import { tool } from "@opencode-ai/plugin/tool";
import { fileExists, readText } from "../lib/fs.js";
import { novelTpPaths } from "../lib/paths.js";
function lineValue(text, key) {
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.toLowerCase().startsWith(key.toLowerCase() + ":"))
            continue;
        const v = trimmed.slice(key.length + 1).trim();
        if (!v)
            return "";
        return v;
    }
    return "";
}
function hasAnyNonPlaceholder(text, key) {
    const v = lineValue(text, key);
    if (!v)
        return false;
    if (v === "(TODO)" || v === "TODO")
        return false;
    return true;
}
export function createNovelTpPreflight(ctx) {
    return tool({
        description: "Preflight gate: validate constraints/style_profile required fields; emit missing questions.",
        args: {
            root: tool.schema
                .string()
                .optional()
                .describe("Optional novel root. Default: <project>/novel")
        },
        async execute(args) {
            const root = ctx.resolveRoot(args.root);
            const p = novelTpPaths(root);
            const missing = [];
            const questions = [];
            if (!(await fileExists(p.briefPath))) {
                missing.push({ file: "brief", key: "brief", message: "Missing novel/bible/brief.md" });
            }
            if (!(await fileExists(p.constraintsPath))) {
                missing.push({ file: "constraints", key: "constraints", message: "Missing novel/bible/constraints.md" });
            }
            if (!(await fileExists(p.styleProfilePath))) {
                missing.push({ file: "style_profile", key: "style_profile", message: "Missing novel/bible/style_profile.md" });
            }
            const constraintsText = (await fileExists(p.constraintsPath)) ? await readText(p.constraintsPath) : "";
            const styleText = (await fileExists(p.styleProfilePath)) ? await readText(p.styleProfilePath) : "";
            // constraints required
            if (constraintsText) {
                if (!hasAnyNonPlaceholder(constraintsText, "pov")) {
                    missing.push({ file: "constraints", key: "pov", message: "constraints: missing pov" });
                    questions.push({
                        id: "constraints.pov",
                        question: "叙事视角（pov）选哪个？",
                        options: ["first_person", "third_person"]
                    });
                }
                if (!hasAnyNonPlaceholder(constraintsText, "pacing")) {
                    missing.push({ file: "constraints", key: "pacing", message: "constraints: missing pacing" });
                    questions.push({
                        id: "constraints.pacing",
                        question: "节奏取向（pacing）偏哪种？",
                        options: ["action", "suspense", "mixed"]
                    });
                }
                if (!hasAnyNonPlaceholder(constraintsText, "chapter_word_count")) {
                    missing.push({ file: "constraints", key: "chapter_word_count", message: "constraints: missing chapter_word_count" });
                    questions.push({
                        id: "constraints.chapter_word_count",
                        question: "每章目标字数区间（例如 2000-2600）？",
                        options: []
                    });
                }
                if (!hasAnyNonPlaceholder(constraintsText, "banned_words")) {
                    missing.push({ file: "constraints", key: "banned_words", message: "constraints: missing banned_words" });
                    questions.push({
                        id: "constraints.banned_words",
                        question: "禁用词列表（可空，但要明确写 [] 或具体词）？",
                        options: []
                    });
                }
                if (!hasAnyNonPlaceholder(constraintsText, "profanity_level")) {
                    missing.push({ file: "constraints", key: "profanity_level", message: "constraints: missing profanity_level" });
                    questions.push({
                        id: "constraints.profanity_level",
                        question: "允许的粗口程度（profanity_level）？",
                        options: ["none", "light", "medium", "heavy"]
                    });
                }
            }
            // style_profile required
            if (styleText) {
                const required = [
                    "sentence_rhythm",
                    "diction_preferences",
                    "dialogue_style",
                    "narration_and_inner_monologue"
                ];
                for (const k of required) {
                    if (hasAnyNonPlaceholder(styleText, k))
                        continue;
                    missing.push({ file: "style_profile", key: k, message: `style_profile: missing ${k}` });
                }
                if (required.some((k) => !hasAnyNonPlaceholder(styleText, k))) {
                    questions.push({
                        id: "style_profile.features",
                        question: "本次 style_profile 缺少必填特征参数（sentence_rhythm/diction_preferences/dialogue_style/narration_and_inner_monologue）。请逐项给一句话配置。",
                        options: []
                    });
                }
            }
            const ok = missing.length === 0;
            return JSON.stringify({ ok, root, missing, questions }, null, 2);
        }
    });
}
