import { tool } from "@opencode-ai/plugin/tool";
import * as crypto from "node:crypto";
import { ensureDir, readText, writeTextIfMissing, writeTextIfMissingOrEmpty } from "../lib/fs.js";
import { normalizeProjectPath, novelTpPaths } from "../lib/paths.js";
import { nowISO } from "../lib/time.js";
import { TEMPLATE_PACK_VERSION } from "../constants/index.js";
/**
 * Generate a unique novel ID with timestamp and random component
 */
function mkNovelId() {
    const ts = nowISO().replace(/[-:]/g, "").slice(0, 15);
    const rand = crypto.randomBytes(3).toString("hex");
    return `novel-${ts}-${rand}`;
}
/**
 * Generate v1 template contents
 */
function templatesV1() {
    return {
        brief_template: [
            "# Brief (Template)",
            "",
            "- genre:",
            "- theme:",
            "- title (optional):",
            "- must_have_elements:",
            "- no_go:",
            "- chapter_goals:",
            "",
            "## Inputs",
            "- existing_chapters (optional):",
            "- keep_list (optional):",
            "- style_samples (optional):",
            ""
        ].join("\n"),
        constraints_template: [
            "# Constraints (Template)",
            "",
            "## Required",
            "1. pov: (first_person | third_person)  # 是否固定单一视角",
            "2. pacing: (action | suspense | mixed)  # 可写比例",
            "3. chapter_word_count: (e.g. 2000-2600)",
            "4. banned_words: []",
            "5. profanity_level: (none | light | medium | heavy)  # 给边界示例",
            ""
        ].join("\n"),
        style_profile_template: [
            "# Style Profile (Template)",
            "",
            "## Required features (>= 4)",
            "- sentence_rhythm:",
            "- diction_preferences:",
            "- dialogue_style:",
            "- narration_and_inner_monologue:",
            "",
            "## Optional samples (recommended)",
            "- sample_1: (200-500 chars)",
            "- sample_2: (200-500 chars)",
            ""
        ].join("\n"),
        world_bible_template: [
            "# World Bible (Template)",
            "",
            "1. one_liner_worldview + core_conflict + reader_promise",
            "2. world_rules (3-7) + forbidden",
            "3. power_or_tech_system (if any): source/bounds/cost/progression/counters",
            "4. society: politics/law/economy/class/mobility",
            "5. geography + key_locations",
            "6. history + chronology + unresolved_mysteries",
            "7. factions/organizations",
            "8. daily_culture",
            "9. information_system",
            "10. narrative_constraints (mirror constraints/style_profile)",
            "11. per-chapter consistency checklist",
            ""
        ].join("\n"),
        character_card_template: [
            "# Character Card (Template)",
            "",
            "- identity: name/alias/tags/first_appearance",
            "- core_motivation: desire/fear/bottom_line/inner_conflict",
            "- goals: long/mid/short + change_conditions",
            "- abilities_resources: bounds/cost/weakness/counters/resources",
            "- voice_behavior: speech_habits/thinking/emotional_triggers/stress_behavior",
            "- relationships:",
            "- backstory_wounds:",
            "- info_boundary: known/unknown/misbelief/secrets",
            "- arc: start/milestones/end_plan/invariant_core",
            "- chapter_status: as_of_chXX + this_ch_delta + next_risks",
            ""
        ].join("\n"),
        reviewer_checklist: [
            "# Reviewer Checklist (GPT)",
            "",
            "First line MUST be: PASS or FAIL.",
            "",
            "FAIL must include blocking issues + executable fix instructions.",
            "- Evidence should cite exact paragraph/field.",
            "- No rewriting; review only.",
            ""
        ].join("\n"),
        auditor_checklist: [
            "# Auditor Checklist (3 models)",
            "",
            "First line MUST be: PASS or FAIL.",
            "",
            "PASS only if: continuity ok, constraints respected, no new facts, voice consistent.",
            "FAIL must include blocking issues + executable fix instructions.",
            ""
        ].join("\n"),
        humanizer_rules: [
            "# Humanizer Rules",
            "",
            "Hard rules:",
            "1. Do NOT change facts/causality/canon; only expression.",
            "2. No POV drift.",
            "3. Banned words must not appear.",
            "4. Profanity must stay within level.",
            "5. Keep character voice + info boundaries.",
            "6. Remove AI smells: template transitions, summary endings, abstract fluff, overly neat syntax.",
            ""
        ].join("\n"),
        preflight_checklist: [
            "# Preflight Checklist",
            "",
            "Before PLAN/REWRITE/CHAPTER:",
            "- constraints.md has all required fields",
            "- style_profile.md exists for this run",
            "- brief.md present",
            "- template_pack_version recorded",
            ""
        ].join("\n")
    };
}
/**
 * Create the novel_tp_init tool
 */
export function createNovelTpInit(ctx) {
    return tool({
        description: "Initialize novel Template Pack workspace (novel/...) with v1.0 templates.",
        args: {
            root: tool.schema
                .string()
                .optional()
                .describe("Optional novel root. Default: <project>/novel")
        },
        async execute(args) {
            const root = ctx.resolveRoot(args.root);
            const p = novelTpPaths(root);
            await Promise.all([
                ensureDir(p.root),
                ensureDir(p.metaDir),
                ensureDir(p.templatesDir),
                ensureDir(p.bibleDir),
                ensureDir(p.chaptersDir)
            ]);
            await writeTextIfMissingOrEmpty(p.novelIdPath, mkNovelId() + "\n");
            await writeTextIfMissingOrEmpty(p.templatePackVersionPath, TEMPLATE_PACK_VERSION + "\n");
            const t = templatesV1();
            await writeTextIfMissingOrEmpty(p.briefTemplatePath, t.brief_template + "\n");
            await writeTextIfMissingOrEmpty(p.constraintsTemplatePath, t.constraints_template + "\n");
            await writeTextIfMissingOrEmpty(p.styleProfileTemplatePath, t.style_profile_template + "\n");
            await writeTextIfMissingOrEmpty(p.worldBibleTemplatePath, t.world_bible_template + "\n");
            await writeTextIfMissingOrEmpty(p.characterCardTemplatePath, t.character_card_template + "\n");
            await writeTextIfMissingOrEmpty(p.reviewerChecklistPath, t.reviewer_checklist + "\n");
            await writeTextIfMissingOrEmpty(p.auditorChecklistPath, t.auditor_checklist + "\n");
            await writeTextIfMissingOrEmpty(p.humanizerRulesPath, t.humanizer_rules + "\n");
            await writeTextIfMissingOrEmpty(p.preflightChecklistPath, t.preflight_checklist + "\n");
            // Instances (do not overwrite if user already filled).
            await writeTextIfMissing(p.briefPath, (await readText(p.briefTemplatePath)) + "\n");
            await writeTextIfMissing(p.constraintsPath, (await readText(p.constraintsTemplatePath)) + "\n");
            await writeTextIfMissing(p.styleProfilePath, (await readText(p.styleProfileTemplatePath)) + "\n");
            await writeTextIfMissing(p.worldPath, "# World Bible\n\n(TODO)\n");
            await writeTextIfMissing(p.charactersPath, "# Characters\n\n(TODO)\n");
            await writeTextIfMissing(p.chronologyPath, "# Chronology\n\n(TODO)\n");
            await writeTextIfMissing(p.outlinePath, "# Outline\n\n(TODO)\n");
            await writeTextIfMissing(p.chapterBeatsPath, "# Chapter Beats\n\n(TODO)\n");
            return [
                `Initialized Template Pack v${TEMPLATE_PACK_VERSION} at: ${normalizeProjectPath(root)}`,
                `- meta: ${normalizeProjectPath(p.metaDir)}`,
                `- templates: ${normalizeProjectPath(p.templatesDir)}`,
                `- bible: ${normalizeProjectPath(p.bibleDir)}`,
                `- chapters: ${normalizeProjectPath(p.chaptersDir)}`
            ].join("\n");
        }
    });
}
