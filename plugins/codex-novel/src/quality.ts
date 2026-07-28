import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse } from "yaml";
import {
  atomicWriteText,
  appendEvent,
  fingerprintFile,
  readState
} from "./io.js";
import {
  chapterContractSchema,
  chapterLengthPolicyIssues,
  marketPositionSchema,
  qualityReportSchema,
  qualityRulesSchema,
  storyGuardrailsSchema,
  type QualityReport
} from "./schema.js";

function normalizedParagraph(paragraph: string): string {
  return paragraph.replace(/\s+/g, "").replace(/[，。！？；：“”‘’、…—,.!?;:'"()[\]{}<>《》]/g, "");
}

function repeatedPhraseCount(
  text: string,
  phraseLength: number,
  maxOccurrences: number
): number {
  const normalized = normalizedParagraph(text);
  const counts = new Map<string, number>();
  for (let index = 0; index + phraseLength <= normalized.length; index++) {
    const phrase = normalized.slice(index, index + phraseLength);
    if (new Set(phrase).size < 3) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count > maxOccurrences).length;
}

export async function runQualityCheck(
  workspace: string,
  source: "draft" | "final"
): Promise<QualityReport> {
  const state = await readState(workspace);
  const chapter = state.workflow.currentChapter;
  const directory = String(chapter).padStart(4, "0");
  const chapterRoot = path.join(workspace, "chapters", directory);
  const prosePath = path.join(chapterRoot, `${source}.md`);
  const prose = await fs.readFile(prosePath, "utf8");
  const contract = chapterContractSchema.parse(
    parse(await fs.readFile(path.join(chapterRoot, "contract.yaml"), "utf8"))
  );
  const rules = qualityRulesSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning", "quality-rules.yaml"), "utf8"))
  );
  const position = marketPositionSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning", "market-position.yaml"), "utf8"))
  );
  const guardrails = storyGuardrailsSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning", "story-guardrails.yaml"), "utf8"))
  );
  if (contract.chapter !== chapter) {
    throw new Error(`Chapter contract ${contract.chapter} does not match current chapter ${chapter}.`);
  }

  const paragraphs = prose
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !/^#{1,6}\s/.test(paragraph));
  const normalized = paragraphs.map(normalizedParagraph).filter(Boolean);
  const duplicateParagraphs = normalized.length - new Set(normalized).size;
  const chineseCharacters = (prose.match(/\p{Script=Han}/gu) ?? []).length;
  const latinWords = (prose.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length;
  const longestParagraph = normalized.reduce((longest, paragraph) => Math.max(longest, paragraph.length), 0);
  const repeatedPhrases = repeatedPhraseCount(
    prose,
    rules.repeatedPhraseLength,
    rules.maxRepeatedPhraseOccurrences
  );
  const measuredLength = state.novel.language.toLowerCase().startsWith("zh")
    ? chineseCharacters
    : latinWords;

  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  blockingIssues.push(...chapterLengthPolicyIssues(contract, position));
  if (measuredLength < contract.targetLength.min || measuredLength > contract.targetLength.max) {
    blockingIssues.push(
      `Length ${measuredLength} is outside accepted range ` +
      `${contract.targetLength.min}-${contract.targetLength.max}.`
    );
  }
  for (const banned of rules.bannedWords) {
    if (prose.includes(banned)) blockingIssues.push(`Banned word appears: ${banned}`);
  }
  for (const modernTerm of guardrails.periodRules.prohibitedModernTerms) {
    if (prose.includes(modernTerm)) {
      blockingIssues.push(`Period vocabulary violation: ${modernTerm}`);
    }
  }
  for (const shortcut of guardrails.prohibitedNarrativeShortcuts) {
    if (prose.includes(shortcut)) {
      blockingIssues.push(`Prohibited narrative shortcut appears: ${shortcut}`);
    }
  }
  if (paragraphs.length < rules.minParagraphs) {
    blockingIssues.push(`Paragraph count ${paragraphs.length} is below minimum ${rules.minParagraphs}.`);
  }
  if (duplicateParagraphs > 0) {
    blockingIssues.push(`Found ${duplicateParagraphs} duplicate paragraph(s).`);
  }
  if (repeatedPhrases > 0) {
    blockingIssues.push(`Found ${repeatedPhrases} over-repeated phrase pattern(s).`);
  }
  if (longestParagraph > rules.maxParagraphLength) {
    warnings.push(
      `Longest paragraph ${longestParagraph} exceeds preferred maximum ${rules.maxParagraphLength}.`
    );
  }

  const report = qualityReportSchema.parse({
    schemaVersion: 1,
    chapter,
    source,
    sourceFingerprint: await fingerprintFile(prosePath),
    ok: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    metrics: {
      chineseCharacters,
      latinWords,
      paragraphs: paragraphs.length,
      longestParagraph,
      duplicateParagraphs,
      repeatedPhrases
    }
  });
  await atomicWriteText(
    path.join(chapterRoot, `quality-${source}.json`),
    `${JSON.stringify(report, null, 2)}\n`
  );
  try {
    await appendEvent(workspace, {
      at: new Date().toISOString(),
      action: "chapter_quality_checked",
      chapter,
      source,
      ok: report.ok,
      blockingIssues: report.blockingIssues.length
    });
  } catch {
    // Quality output remains valid if diagnostic logging fails.
  }
  return report;
}

export async function readCurrentQualityReport(
  workspace: string,
  source: "draft" | "final"
): Promise<QualityReport> {
  const state = await readState(workspace);
  const directory = String(state.workflow.currentChapter).padStart(4, "0");
  const chapterRoot = path.join(workspace, "chapters", directory);
  const report = qualityReportSchema.parse(
    JSON.parse(await fs.readFile(path.join(chapterRoot, `quality-${source}.json`), "utf8"))
  );
  const fingerprint = await fingerprintFile(path.join(chapterRoot, `${source}.md`));
  if (report.sourceFingerprint !== fingerprint) {
    throw new Error(`Quality report for ${source} is stale.`);
  }
  return report;
}
