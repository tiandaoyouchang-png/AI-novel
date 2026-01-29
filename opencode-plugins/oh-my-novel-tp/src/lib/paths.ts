import * as path from "node:path";

export function normalizeProjectPath(p: string) {
  return p.replace(/\\/g, "/");
}

export function resolveNovelRoot(projectDir: string, root?: string) {
  if (!root || root.trim().length === 0) return path.join(projectDir, "novel");
  return path.isAbsolute(root) ? root : path.join(projectDir, root);
}

export function novelTpPaths(root: string) {
  const metaDir = path.join(root, "meta");
  const templatesDir = path.join(root, "templates");
  const bibleDir = path.join(root, "bible");
  const chaptersDir = path.join(root, "chapters");

  return {
    root,
    metaDir,
    templatesDir,
    bibleDir,
    chaptersDir,

    novelIdPath: path.join(metaDir, "novel_id.txt"),
    templatePackVersionPath: path.join(metaDir, "template_pack_version.txt"),

    briefTemplatePath: path.join(templatesDir, "brief_template.md"),
    constraintsTemplatePath: path.join(templatesDir, "constraints_template.md"),
    styleProfileTemplatePath: path.join(templatesDir, "style_profile_template.md"),
    worldBibleTemplatePath: path.join(templatesDir, "world_bible_template.md"),
    characterCardTemplatePath: path.join(templatesDir, "character_card_template.md"),
    reviewerChecklistPath: path.join(templatesDir, "reviewer_checklist.md"),
    auditorChecklistPath: path.join(templatesDir, "auditor_checklist.md"),
    humanizerRulesPath: path.join(templatesDir, "humanizer_rules.md"),
    preflightChecklistPath: path.join(templatesDir, "preflight_checklist.md"),

    briefPath: path.join(bibleDir, "brief.md"),
    constraintsPath: path.join(bibleDir, "constraints.md"),
    styleProfilePath: path.join(bibleDir, "style_profile.md"),
    worldPath: path.join(bibleDir, "world.md"),
    charactersPath: path.join(bibleDir, "characters.md"),
    chronologyPath: path.join(bibleDir, "chronology.md"),
    outlinePath: path.join(bibleDir, "outline.md"),
    chapterBeatsPath: path.join(bibleDir, "chapter_beats.md")
  };
}
