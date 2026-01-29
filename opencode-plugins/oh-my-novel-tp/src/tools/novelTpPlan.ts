import { tool } from "@opencode-ai/plugin/tool";
import { fileExists, readText, writeText } from "../lib/fs.js";
import { novelTpPaths } from "../lib/paths.js";
import { promptText } from "../lib/llm.js";
import type { ToolCtx } from "../plugin.js";

function firstLine(s: string) {
  return s.replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "";
}

function isPassFailLine(line: string) {
  const up = line.toUpperCase();
  return up === "PASS" || up === "FAIL";
}

export function createNovelTpPlan(ctx: ToolCtx) {
  return tool({
    description: "Stage 1: council(3) -> writer -> reviewer(GPT) loop; write/update bible artifacts.",
    args: {
      root: tool.schema.string().optional().describe("Optional novel root. Default: <project>/novel"),
      maxRounds: tool.schema.number().int().positive().default(3),
      councilGptModel: tool.schema.string().default("openai/gpt-5.2"),
      councilClaudeModel: tool.schema.string().default("google/antigravity-claude-sonnet-4-5-thinking"),
      councilGeminiModel: tool.schema.string().default("google/antigravity-gemini-3-pro"),
      writerModel: tool.schema.string().default("google/antigravity-claude-sonnet-4-5"),
      reviewerModel: tool.schema.string().default("openai/gpt-5.2")
    },
    async execute(
      args: {
        root?: string;
        maxRounds: number;
        councilGptModel: string;
        councilClaudeModel: string;
        councilGeminiModel: string;
        writerModel: string;
        reviewerModel: string;
      },
      toolContext
    ) {
      if (!ctx.client) return "Model client not available in this runtime.";

      const root = ctx.resolveRoot(args.root);
      const p = novelTpPaths(root);

      // Preflight must be satisfied BEFORE plan.
      const requiredFiles = [p.briefPath, p.constraintsPath, p.styleProfilePath];
      const missingFiles: string[] = [];
      for (const f of requiredFiles) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await fileExists(f))) missingFiles.push(f);
      }
      if (missingFiles.length > 0) {
        return JSON.stringify({ ok: false, reason: "missing_required_files", missing: missingFiles }, null, 2);
      }

      const brief = await readText(p.briefPath);
      const constraints = await readText(p.constraintsPath);
      const style = await readText(p.styleProfilePath);
      const reviewerChecklist = (await fileExists(p.reviewerChecklistPath)) ? await readText(p.reviewerChecklistPath) : "";

      const councilSystem =
        "You are COUNCIL (discussion only). Propose a plan; do NOT write final bible files. Be concrete and list risks.";
      const writerSystem =
        "You are WRITER. Produce the final Bible markdown contents ONLY (no commentary). Follow constraints/style_profile.";
      const reviewerSystem =
        "You are REVIEWER (strict gate). Output first line PASS or FAIL. You MUST NOT write prose; only review.";

      const baseContext = [
        "BRIEF:",
        brief.trim(),
        "",
        "CONSTRAINTS:",
        constraints.trim(),
        "",
        "STYLE_PROFILE:",
        style.trim()
      ]
        .filter((x) => x.length > 0)
        .join("\n");

      let lastFeedback = "";

      for (let round = 1; round <= Math.max(1, Math.min(10, args.maxRounds)); round++) {
        const councilPrompt = [
          baseContext,
          lastFeedback ? "\nREVIEWER_FEEDBACK (from previous round, must address):\n" + lastFeedback.trim() : "",
          "\nTASK:",
          "- Propose world bible structure, character bible structure, chronology, outline, chapter beats.",
          "- Call out continuity risks and what to lock as canon.",
          "- Output as bullet points with headings; no file writing."
        ]
          .filter((x) => x.length > 0)
          .join("\n");

        const [cGpt, cClaude, cGemini] = await Promise.all([
          promptText({
            client: ctx.client,
            sessionID: toolContext.sessionID,
            directory: ctx.projectDir,
            model: args.councilGptModel,
            system: councilSystem,
            text: councilPrompt
          }),
          promptText({
            client: ctx.client,
            sessionID: toolContext.sessionID,
            directory: ctx.projectDir,
            model: args.councilClaudeModel,
            system: councilSystem,
            text: councilPrompt
          }),
          promptText({
            client: ctx.client,
            sessionID: toolContext.sessionID,
            directory: ctx.projectDir,
            model: args.councilGeminiModel,
            system: councilSystem,
            text: councilPrompt
          })
        ]);

        const writerPrompt = [
          baseContext,
          "\nCOUNCIL_GPT:\n" + cGpt.trim(),
          "\nCOUNCIL_CLAUDE:\n" + cClaude.trim(),
          "\nCOUNCIL_GEMINI:\n" + cGemini.trim(),
          lastFeedback ? "\nREVIEWER_FEEDBACK (must fix):\n" + lastFeedback.trim() : "",
          "\nOUTPUT REQUIREMENTS:",
          "Return FIVE markdown documents separated by explicit markers exactly as follows:",
          "---FILE: world.md---",
          "---FILE: characters.md---",
          "---FILE: chronology.md---",
          "---FILE: outline.md---",
          "---FILE: chapter_beats.md---",
          "No other text."
        ].join("\n");

        const bundle = await promptText({
          client: ctx.client,
          sessionID: toolContext.sessionID,
          directory: ctx.projectDir,
          model: args.writerModel,
          system: writerSystem,
          text: writerPrompt
        });

        const parts = bundle.split(/\n---FILE: ([^\n]+)---\n/).filter((x) => x !== "");
        // parts shape: [preamble?] or [filename, content, filename, content...]
        const fileMap = new Map<string, string>();
        for (let i = 0; i + 1 < parts.length; i += 2) {
          const name = (parts[i] ?? "").trim();
          const body = (parts[i + 1] ?? "").trimEnd() + "\n";
          if (name) fileMap.set(name, body);
        }

        const requiredOut = [
          ["world.md", p.worldPath],
          ["characters.md", p.charactersPath],
          ["chronology.md", p.chronologyPath],
          ["outline.md", p.outlinePath],
          ["chapter_beats.md", p.chapterBeatsPath]
        ] as const;

        const missingOut = requiredOut.filter(([n]) => !fileMap.has(n)).map(([n]) => n);
        if (missingOut.length > 0) {
          lastFeedback = `Writer output missing files: ${missingOut.join(", ")}`;
          continue;
        }

        for (const [n, outPath] of requiredOut) {
          await writeText(outPath, (fileMap.get(n) ?? "").trimEnd() + "\n");
        }

        const reviewPrompt = [
          reviewerChecklist ? "REVIEWER_CHECKLIST:\n" + reviewerChecklist.trim() : "",
          "\nCONTEXT:\n" + baseContext,
          "\nFILES TO REVIEW:",
          "--- world.md ---\n" + (fileMap.get("world.md") ?? ""),
          "--- characters.md ---\n" + (fileMap.get("characters.md") ?? ""),
          "--- chronology.md ---\n" + (fileMap.get("chronology.md") ?? ""),
          "--- outline.md ---\n" + (fileMap.get("outline.md") ?? ""),
          "--- chapter_beats.md ---\n" + (fileMap.get("chapter_beats.md") ?? ""),
          "\nReturn first line PASS or FAIL." 
        ].join("\n");

        const review = await promptText({
          client: ctx.client,
          sessionID: toolContext.sessionID,
          directory: ctx.projectDir,
          model: args.reviewerModel,
          system: reviewerSystem,
          text: reviewPrompt
        });

        const verdict = firstLine(review);
        if (!isPassFailLine(verdict)) {
          lastFeedback = "Reviewer did not output PASS/FAIL on first line; retrying.";
          continue;
        }
        if (verdict.toUpperCase() === "PASS") {
          return JSON.stringify({ ok: true, root, round, verdict: "PASS" }, null, 2);
        }

        lastFeedback = review.trim();
      }

      return JSON.stringify({ ok: false, root, verdict: "FAIL", reason: "max_rounds_exceeded", lastFeedback }, null, 2);
    }
  });
}
