import { tool } from "@opencode-ai/plugin/tool";
import type { ToolCtx } from "../plugin.js";
import { createNovelTpChapter } from "./novelTpChapter.js";

export function createNovelTpRewrite(ctx: ToolCtx) {
  return tool({
    description: "Batch rewrite chapters via novel_tp_chapter pipeline.",
    args: {
      root: tool.schema.string().optional().describe("Optional novel root. Default: <project>/novel"),
      from: tool.schema.number().int().positive().describe("Start chapter number (1-based)"),
      to: tool.schema.number().int().positive().describe("End chapter number (1-based, inclusive)"),
      maxWriteRounds: tool.schema.number().int().positive().default(5),
      maxHumanizeRounds: tool.schema.number().int().positive().default(3),

      councilGptModel: tool.schema.string().default("openai/gpt-5.2"),
      councilClaudeModel: tool.schema.string().default("google/antigravity-claude-sonnet-4-5-thinking"),
      councilGeminiModel: tool.schema.string().default("google/antigravity-gemini-3-pro"),

      writerModel: tool.schema.string().default("google/antigravity-claude-sonnet-4-5"),
      reviewerModel: tool.schema.string().default("openai/gpt-5.2"),
      auditorGptModel: tool.schema.string().default("openai/gpt-5.2"),
      auditorClaudeModel: tool.schema.string().default("google/antigravity-claude-sonnet-4-5-thinking"),
      auditorGeminiModel: tool.schema.string().default("google/antigravity-gemini-3-pro"),
      humanizerModel: tool.schema.string().default("google/antigravity-claude-sonnet-4-5")
    },
    async execute(
      args: {
        root?: string;
        from: number;
        to: number;
        maxWriteRounds: number;
        maxHumanizeRounds: number;
        councilGptModel: string;
        councilClaudeModel: string;
        councilGeminiModel: string;
        writerModel: string;
        reviewerModel: string;
        auditorGptModel: string;
        auditorClaudeModel: string;
        auditorGeminiModel: string;
        humanizerModel: string;
      },
      toolContext
    ) {
      const start = Math.min(args.from, args.to);
      const end = Math.max(args.from, args.to);

      const chapterTool = createNovelTpChapter(ctx);
      const results: Array<{ n: number; ok: boolean; raw: string }> = [];

      for (let n = start; n <= end; n++) {
        // eslint-disable-next-line no-await-in-loop
        const out = await (chapterTool as any).execute(
          {
            root: args.root,
            n,
            maxWriteRounds: args.maxWriteRounds,
            maxHumanizeRounds: args.maxHumanizeRounds,
            councilGptModel: args.councilGptModel,
            councilClaudeModel: args.councilClaudeModel,
            councilGeminiModel: args.councilGeminiModel,
            writerModel: args.writerModel,
            reviewerModel: args.reviewerModel,
            auditorGptModel: args.auditorGptModel,
            auditorClaudeModel: args.auditorClaudeModel,
            auditorGeminiModel: args.auditorGeminiModel,
            humanizerModel: args.humanizerModel
          },
          toolContext
        );

        const raw = String(out);
        let ok = false;
        try {
          const parsed = JSON.parse(raw);
          ok = Boolean(parsed?.ok);
        } catch {
          ok = false;
        }

        results.push({ n, ok, raw });
        if (!ok) break;
      }

      const okAll = results.length === (end - start + 1) && results.every((r) => r.ok);
      return JSON.stringify({ ok: okAll, range: { from: start, to: end }, results }, null, 2);
    }
  });
}
