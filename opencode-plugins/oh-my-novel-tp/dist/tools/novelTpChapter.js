import { tool } from "@opencode-ai/plugin/tool";
import * as path from "node:path";
import { ensureDir, fileExists, readText, writeText } from "../lib/fs.js";
import { novelTpPaths } from "../lib/paths.js";
import { promptText } from "../lib/llm.js";
function pad2(n) {
    return String(n).padStart(2, "0");
}
function firstLine(s) {
    return s.replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "";
}
function isPass(line) {
    return line.trim().toUpperCase() === "PASS";
}
function isPassFail(line) {
    const up = line.trim().toUpperCase();
    return up === "PASS" || up === "FAIL";
}
function extractChapterBeat(allBeats, chId) {
    const lines = allBeats.replace(/\r\n/g, "\n").split("\n");
    const tag = `- ${chId} `;
    const idx = lines.findIndex((l) => l.trim().startsWith(tag));
    if (idx < 0)
        return "";
    const out = [];
    for (let i = Math.max(0, idx - 1); i <= Math.min(lines.length - 1, idx + 1); i++) {
        const v = (lines[i] ?? "").trimEnd();
        if (v.trim().length === 0)
            continue;
        out.push(v);
    }
    return out.join("\n");
}
function takePrefix(s, maxChars) {
    const t = s.trim();
    if (t.length <= maxChars)
        return t;
    return t.slice(0, maxChars) + "\n... (truncated)";
}
export function createNovelTpChapter(ctx) {
    return tool({
        description: "Stage 2+3: council->writer->reviewer loop -> auditors(3/3) -> character update -> humanizer -> recheck -> final.",
        args: {
            root: tool.schema.string().optional().describe("Optional novel root. Default: <project>/novel"),
            n: tool.schema.number().int().positive().describe("Chapter number (1-based)"),
            maxWriteRounds: tool.schema.number().int().positive().default(5),
            maxHumanizeRounds: tool.schema.number().int().positive().default(3),
            enableCouncil: tool.schema.boolean().default(true).describe("If false, skip council discussion and write directly from beat."),
            enableAuditors: tool.schema.boolean().default(true).describe("If false, skip 3-auditor final gate (NOT recommended)."),
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
        async execute(args, toolContext) {
            if (!ctx.client)
                return "Model client not available in this runtime.";
            const root = ctx.resolveRoot(args.root);
            const p = novelTpPaths(root);
            const chId = `ch${pad2(args.n)}`;
            const chDir = path.join(p.chaptersDir, chId);
            // Hard gate: required inputs must exist.
            const required = [
                p.briefPath,
                p.constraintsPath,
                p.styleProfilePath,
                p.worldPath,
                p.charactersPath,
                p.chronologyPath,
                p.outlinePath,
                p.chapterBeatsPath,
                p.reviewerChecklistPath,
                p.auditorChecklistPath,
                p.humanizerRulesPath
            ];
            const missing = [];
            for (const f of required) {
                // eslint-disable-next-line no-await-in-loop
                if (!(await fileExists(f)))
                    missing.push(f);
            }
            if (missing.length > 0) {
                return JSON.stringify({ ok: false, reason: "missing_required_files", missing }, null, 2);
            }
            await ensureDir(chDir);
            const brief = await readText(p.briefPath);
            const constraints = await readText(p.constraintsPath);
            const style = await readText(p.styleProfilePath);
            const world = await readText(p.worldPath);
            const characters = await readText(p.charactersPath);
            const chronology = await readText(p.chronologyPath);
            const outline = await readText(p.outlinePath);
            const beats = await readText(p.chapterBeatsPath);
            const reviewerChecklist = await readText(p.reviewerChecklistPath);
            const auditorChecklist = await readText(p.auditorChecklistPath);
            const humanizerRules = await readText(p.humanizerRulesPath);
            const prefinalPath = path.join(chDir, "prefinal.md");
            const finalPath = path.join(chDir, "final.md");
            const characterDeltaPath = path.join(chDir, "character_delta.md");
            const humanizeDeltaPath = path.join(chDir, "humanize_delta.md");
            const styleUsedPath = path.join(chDir, "style_profile_used.md");
            // Always snapshot style_profile for this chapter.
            await writeText(styleUsedPath, style.trimEnd() + "\n");
            const councilSystem = "You are COUNCIL (discussion only). Propose a concrete chapter plan; do NOT write final prose.";
            const writerSystem = "You are WRITER. Output ONLY the chapter prose in Markdown (no commentary). Respect constraints/style_profile and canon.";
            const reviewerSystem = "You are REVIEWER (strict gate). Output first line PASS or FAIL; then blocking issues + executable fix instructions. No rewriting.";
            const auditorSystem = "You are AUDITOR (strict final gate). Output first line PASS or FAIL; then blocking issues + executable fix instructions. No rewriting.";
            const humanizerSystem = "You are HUMANIZER. Only change expression; do NOT change facts/causality/canon. Output ONLY the revised chapter Markdown.";
            const beat = extractChapterBeat(beats, chId);
            const baseContext = [
                `CHAPTER: ${chId}`,
                beat ? "\nCHAPTER_BEAT (single):\n" + beat : "",
                "\nBRIEF:\n" + takePrefix(brief, 8000),
                "\nCONSTRAINTS:\n" + takePrefix(constraints, 4000),
                "\nSTYLE_PROFILE (this run):\n" + takePrefix(style, 4000),
                "\nWORLD (canon):\n" + takePrefix(world, 12000),
                "\nCHARACTERS (canon):\n" + takePrefix(characters, 12000),
                "\nCHRONOLOGY:\n" + takePrefix(chronology, 6000),
                "\nOUTLINE (high-level):\n" + takePrefix(outline, 6000)
            ]
                .filter((x) => x !== "")
                .join("\n");
            let reviewerFeedback = "";
            let auditorFeedback = "";
            // 1) council -> writer -> reviewer loop
            let prefinalText = "";
            for (let round = 1; round <= Math.max(1, Math.min(10, args.maxWriteRounds)); round++) {
                const councilOut = args.enableCouncil
                    ? await Promise.all([
                        promptText({
                            client: ctx.client,
                            sessionID: toolContext.sessionID,
                            directory: ctx.projectDir,
                            model: args.councilGptModel,
                            system: councilSystem,
                            text: [
                                baseContext,
                                reviewerFeedback ? "\nREVIEWER_FEEDBACK (must fix):\n" + reviewerFeedback : "",
                                auditorFeedback ? "\nAUDITOR_FEEDBACK (must fix):\n" + auditorFeedback : "",
                                "\nTASK:",
                                "- Propose scene list (in-order), conflict escalation, info drops, hook.",
                                "- Note continuity risks.",
                                "- Output as headings + bullets only."
                            ].join("\n")
                        }),
                        promptText({
                            client: ctx.client,
                            sessionID: toolContext.sessionID,
                            directory: ctx.projectDir,
                            model: args.councilClaudeModel,
                            system: councilSystem,
                            text: [
                                baseContext,
                                reviewerFeedback ? "\nREVIEWER_FEEDBACK (must fix):\n" + reviewerFeedback : "",
                                auditorFeedback ? "\nAUDITOR_FEEDBACK (must fix):\n" + auditorFeedback : "",
                                "\nTASK:",
                                "- Propose scene list (in-order), conflict escalation, info drops, hook.",
                                "- Note continuity risks.",
                                "- Output as headings + bullets only."
                            ].join("\n")
                        }),
                        promptText({
                            client: ctx.client,
                            sessionID: toolContext.sessionID,
                            directory: ctx.projectDir,
                            model: args.councilGeminiModel,
                            system: councilSystem,
                            text: [
                                baseContext,
                                reviewerFeedback ? "\nREVIEWER_FEEDBACK (must fix):\n" + reviewerFeedback : "",
                                auditorFeedback ? "\nAUDITOR_FEEDBACK (must fix):\n" + auditorFeedback : "",
                                "\nTASK:",
                                "- Propose scene list (in-order), conflict escalation, info drops, hook.",
                                "- Note continuity risks.",
                                "- Output as headings + bullets only."
                            ].join("\n")
                        })
                    ])
                    : null;
                const writerPrompt = [
                    baseContext,
                    councilOut
                        ? "\nCOUNCIL_GPT:\n" + (councilOut[0] ?? "").trim() +
                            "\n\nCOUNCIL_CLAUDE:\n" + (councilOut[1] ?? "").trim() +
                            "\n\nCOUNCIL_GEMINI:\n" + (councilOut[2] ?? "").trim()
                        : "\nCOUNCIL: (skipped)\n- Write directly from CHAPTER_BEAT, maintaining tension and cliffhanger.",
                    reviewerFeedback ? "\nREVIEWER_FEEDBACK (must fix):\n" + reviewerFeedback : "",
                    auditorFeedback ? "\nAUDITOR_FEEDBACK (must fix):\n" + auditorFeedback : "",
                    "\nOUTPUT:",
                    "- Write this chapter in Markdown.",
                    "- Keep POV consistent with constraints.",
                    "- No meta commentary.",
                    "Return the chapter text only."
                ].join("\n");
                prefinalText = await promptText({
                    client: ctx.client,
                    sessionID: toolContext.sessionID,
                    directory: ctx.projectDir,
                    model: args.writerModel,
                    system: writerSystem,
                    text: writerPrompt
                });
                await writeText(prefinalPath, prefinalText.trimEnd() + "\n");
                const reviewPrompt = [
                    reviewerChecklist.trim(),
                    "\nCONTEXT:\n" + baseContext,
                    "\nCHAPTER (prefinal):\n" + prefinalText.trim()
                ].join("\n");
                const reviewOut = await promptText({
                    client: ctx.client,
                    sessionID: toolContext.sessionID,
                    directory: ctx.projectDir,
                    model: args.reviewerModel,
                    system: reviewerSystem,
                    text: reviewPrompt
                });
                const verdict = firstLine(reviewOut);
                if (!isPassFail(verdict)) {
                    reviewerFeedback = "Reviewer did not output PASS/FAIL on first line. Retry.";
                    continue;
                }
                if (isPass(verdict)) {
                    reviewerFeedback = "";
                    break;
                }
                reviewerFeedback = reviewOut.trim();
            }
            if (reviewerFeedback) {
                return JSON.stringify({ ok: false, chapter: chId, stage: "reviewer", verdict: "FAIL", reviewerFeedback }, null, 2);
            }
            // 2) auditors: 3/3 PASS required
            if (!args.enableAuditors) {
                auditorFeedback = "";
            }
            for (let round = 1; round <= 3; round++) {
                if (!args.enableAuditors)
                    break;
                const auditPrompt = [
                    auditorChecklist.trim(),
                    "\nCONTEXT:\n" + baseContext,
                    "\nCHAPTER (prefinal):\n" + prefinalText.trim()
                ].join("\n");
                const [aGpt, aClaude, aGemini] = await Promise.all([
                    promptText({
                        client: ctx.client,
                        sessionID: toolContext.sessionID,
                        directory: ctx.projectDir,
                        model: args.auditorGptModel,
                        system: auditorSystem,
                        text: auditPrompt
                    }),
                    promptText({
                        client: ctx.client,
                        sessionID: toolContext.sessionID,
                        directory: ctx.projectDir,
                        model: args.auditorClaudeModel,
                        system: auditorSystem,
                        text: auditPrompt
                    }),
                    promptText({
                        client: ctx.client,
                        sessionID: toolContext.sessionID,
                        directory: ctx.projectDir,
                        model: args.auditorGeminiModel,
                        system: auditorSystem,
                        text: auditPrompt
                    })
                ]);
                const v1 = firstLine(aGpt);
                const v2 = firstLine(aClaude);
                const v3 = firstLine(aGemini);
                const passAll = isPass(v1) && isPass(v2) && isPass(v3);
                if (passAll) {
                    auditorFeedback = "";
                    break;
                }
                auditorFeedback = [
                    "AUDITOR_GPT:\n" + aGpt.trim(),
                    "\nAUDITOR_CLAUDE:\n" + aClaude.trim(),
                    "\nAUDITOR_GEMINI:\n" + aGemini.trim()
                ].join("\n");
                // Feed back to writer (1 round rewrite) then re-audit.
                const rewritePrompt = [
                    baseContext,
                    "\nAUDITOR_FEEDBACK (must fix):\n" + auditorFeedback.trim(),
                    "\nCHAPTER (current prefinal):\n" + prefinalText.trim(),
                    "\nTASK: Rewrite the chapter to resolve ALL blocking issues. Output the full revised chapter markdown only."
                ].join("\n");
                prefinalText = await promptText({
                    client: ctx.client,
                    sessionID: toolContext.sessionID,
                    directory: ctx.projectDir,
                    model: args.writerModel,
                    system: writerSystem,
                    text: rewritePrompt
                });
                await writeText(prefinalPath, prefinalText.trimEnd() + "\n");
            }
            if (auditorFeedback) {
                return JSON.stringify({ ok: false, chapter: chId, stage: "auditors", verdict: "FAIL", auditorFeedback }, null, 2);
            }
            // 3) character delta + merge (minimal: append section)
            const deltaSystem = "You extract character deltas. Output markdown only. Include: status/relationships/goals/info_boundary/resources changes.";
            const deltaPrompt = [
                "CONTEXT:\n" + baseContext,
                "\nCHAPTER (prefinal):\n" + prefinalText.trim(),
                "\nTASK: Produce character_delta.md for this chapter."
            ].join("\n");
            const delta = await promptText({
                client: ctx.client,
                sessionID: toolContext.sessionID,
                directory: ctx.projectDir,
                model: args.writerModel,
                system: deltaSystem,
                text: deltaPrompt
            });
            await writeText(characterDeltaPath, delta.trimEnd() + "\n");
            const merged = [
                characters.trimEnd(),
                "",
                `## ${chId} delta`,
                "",
                delta.trimEnd(),
                ""
            ].join("\n");
            await writeText(p.charactersPath, merged);
            // 4) humanizer -> quick recheck gate
            let finalText = "";
            let humanizeFeedback = "";
            for (let round = 1; round <= Math.max(1, Math.min(10, args.maxHumanizeRounds)); round++) {
                const humanizePrompt = [
                    baseContext,
                    "\nHUMANIZER_RULES:\n" + humanizerRules.trim(),
                    humanizeFeedback ? "\nRECHECK_FEEDBACK (must fix):\n" + humanizeFeedback.trim() : "",
                    "\nCHAPTER (prefinal):\n" + prefinalText.trim(),
                    "\nTASK: Humanize the chapter (expression only). Output full chapter markdown only."
                ].join("\n");
                finalText = await promptText({
                    client: ctx.client,
                    sessionID: toolContext.sessionID,
                    directory: ctx.projectDir,
                    model: args.humanizerModel,
                    system: humanizerSystem,
                    text: humanizePrompt
                });
                const recheckSystem = "You are QUICK_RECHECK. Output first line PASS or FAIL. Check POV drift, banned words, profanity, new facts, info leaks, style mismatch.";
                const recheckPrompt = [
                    "CONSTRAINTS:\n" + constraints.trim(),
                    "\nSTYLE_PROFILE:\n" + style.trim(),
                    "\nWORLD/CHARACTERS (canon):\n" + (await readText(p.worldPath)).trim() + "\n" + (await readText(p.charactersPath)).trim(),
                    "\nCHAPTER (final candidate):\n" + finalText.trim(),
                    "\nReturn first line PASS or FAIL, then blocking issues + fix instructions."
                ].join("\n");
                const recheck = await promptText({
                    client: ctx.client,
                    sessionID: toolContext.sessionID,
                    directory: ctx.projectDir,
                    model: args.reviewerModel,
                    system: recheckSystem,
                    text: recheckPrompt
                });
                const verdict = firstLine(recheck);
                if (!isPassFail(verdict)) {
                    humanizeFeedback = "Recheck did not output PASS/FAIL on first line.";
                    continue;
                }
                if (isPass(verdict)) {
                    humanizeFeedback = "";
                    break;
                }
                humanizeFeedback = recheck.trim();
            }
            if (humanizeFeedback) {
                return JSON.stringify({ ok: false, chapter: chId, stage: "humanizer_recheck", verdict: "FAIL", humanizeFeedback }, null, 2);
            }
            await writeText(finalPath, finalText.trimEnd() + "\n");
            // humanize_delta (best-effort)
            const delta2System = "Summarize language-level changes only (no plot/fact changes). Output markdown only.";
            const delta2Prompt = [
                "CHAPTER_ID: " + chId,
                "\nORIGINAL (prefinal):\n" + prefinalText.trim(),
                "\nHUMANIZED (final):\n" + finalText.trim(),
                "\nTASK: Write humanize_delta.md (language-level change summary)."
            ].join("\n");
            const delta2 = await promptText({
                client: ctx.client,
                sessionID: toolContext.sessionID,
                directory: ctx.projectDir,
                model: args.humanizerModel,
                system: delta2System,
                text: delta2Prompt
            });
            await writeText(humanizeDeltaPath, delta2.trimEnd() + "\n");
            return JSON.stringify({
                ok: true,
                chapter: chId,
                outputs: {
                    prefinal: prefinalPath,
                    final: finalPath,
                    character_delta: characterDeltaPath,
                    humanize_delta: humanizeDeltaPath,
                    style_profile_used: styleUsedPath
                }
            }, null, 2);
        }
    });
}
