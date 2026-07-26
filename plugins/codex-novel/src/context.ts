import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse, stringify } from "yaml";
import {
  atomicWriteText,
  appendEvent,
  fingerprintFile,
  readState,
  sha256Text
} from "./io.js";
import {
  chapterContractSchema,
  chapterContextManifestSchema,
  characterCardValueSchema,
  continuityStoreSchema,
  topicCandidatesSchema,
  topicDecisionSchema,
  type ContinuityDomain,
  type ContinuityStore
} from "./schema.js";

const DOMAIN_FILES: Record<ContinuityDomain, string> = {
  facts: "facts.yaml",
  timeline: "timeline.yaml",
  threads: "threads.yaml",
  resources: "resources.yaml",
  relationships: "relationships.yaml",
  characters: "characters.yaml",
  storyCards: "story-cards.yaml"
};

function takeTail(content: string, maxChars: number): string {
  const trimmed = content.trim();
  return trimmed.length <= maxChars ? trimmed : `[truncated]\n${trimmed.slice(-maxChars)}`;
}

function takePrefix(content: string, maxChars: number): string {
  const trimmed = content.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}\n[truncated]`;
}

function contextValue(
  domain: ContinuityDomain,
  value: Record<string, unknown>
): Record<string, unknown> {
  if (domain !== "characters") return value;
  const character = characterCardValueSchema.parse(value);
  return {
    ...character,
    hiddenKnowledgeIds: character.hiddenKnowledgeIds.length > 0
      ? [`[redacted: ${character.hiddenKnowledgeIds.length} hidden item(s)]`]
      : []
  };
}

function matchesContext(
  domain: ContinuityDomain,
  id: string,
  value: Record<string, unknown>,
  evidence: string,
  explicitIds: Set<string>,
  terms: readonly string[]
): boolean {
  if (explicitIds.has(id)) return true;
  const haystack = `${id}\n${JSON.stringify(value)}\n${evidence}`.toLocaleLowerCase();
  return terms.some((term) => haystack.includes(term.toLocaleLowerCase())) ||
    (domain === "facts" && terms.length === 0);
}

export async function compileChapterContext(
  workspace: string,
  maxChars = 12_000
): Promise<{ output: string; manifest: string; selectedEntries: number; truncated: boolean }> {
  if (maxChars < 4_000 || maxChars > 50_000) {
    throw new Error("Context maxChars must be between 4000 and 50000.");
  }
  const state = await readState(workspace);
  if (state.workflow.phase !== "production") {
    throw new Error("Context compilation is available only in production phase.");
  }

  const chapter = state.workflow.currentChapter;
  const chapterDirectory = String(chapter).padStart(4, "0");
  const chapterRoot = path.join(workspace, "chapters", chapterDirectory);
  const contractPath = path.join(chapterRoot, "contract.yaml");
  const contract = chapterContractSchema.parse(parse(await fs.readFile(contractPath, "utf8")));
  if (contract.chapter !== chapter) {
    throw new Error(`Chapter contract ${contract.chapter} does not match current chapter ${chapter}.`);
  }
  const topicCandidates = topicCandidatesSchema.parse(
    parse(
      await fs.readFile(
        path.join(workspace, "discovery/topic-candidates.yaml"),
        "utf8"
      )
    )
  );
  const topicDecision = topicDecisionSchema.parse(
    parse(
      await fs.readFile(
        path.join(workspace, "discovery/topic-decision.yaml"),
        "utf8"
      )
    )
  );
  const selectedTopic = topicCandidates.candidates.find(
    (candidate) => candidate.id === topicDecision.selectedId
  );
  if (!selectedTopic) {
    throw new Error(`Selected topic does not exist: ${topicDecision.selectedId}.`);
  }

  const terms = [
    ...contract.participants,
    ...contract.locations,
    ...contract.keywords,
    ...contract.protectedFacts
  ];
  const explicitByDomain: Record<ContinuityDomain, Set<string>> = {
    facts: new Set(contract.protectedFacts),
    timeline: new Set(),
    threads: new Set(contract.threadIds),
    resources: new Set(contract.resourceIds),
    relationships: new Set(contract.relationshipIds),
    characters: new Set(contract.participants),
    storyCards: new Set(contract.threadIds)
  };

  const selected: Array<{
    domain: ContinuityDomain;
    id: string;
    value: Record<string, unknown>;
    evidence: string;
    sourceChapter: number;
  }> = [];
  const deadParticipants: string[] = [];
  for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
    const raw = await fs.readFile(path.join(workspace, "continuity", DOMAIN_FILES[domain]), "utf8");
    const store: ContinuityStore = continuityStoreSchema.parse(parse(raw));
    for (const entry of store.entries) {
      if (entry.status !== "active") continue;
      if (domain === "characters") {
        const character = characterCardValueSchema.parse(entry.value);
        const isParticipant =
          contract.participants.includes(entry.id) ||
          contract.participants.includes(character.name);
        const isNonPresent =
          contract.nonPresentParticipants.includes(entry.id) ||
          contract.nonPresentParticipants.includes(character.name);
        if (isParticipant && !isNonPresent && character.lifeStatus === "dead") {
          deadParticipants.push(`${character.name} (${entry.id})`);
        }
      }
      if (matchesContext(domain, entry.id, entry.value, entry.evidence, explicitByDomain[domain], terms)) {
        selected.push({
          domain,
          id: entry.id,
          value: entry.value,
          evidence: entry.evidence,
          sourceChapter: entry.sourceChapter
        });
      }
    }
  }
  if (deadParticipants.length > 0) {
    throw new Error(
      `Dead characters cannot be present in chapter ${chapter}: ${deadParticipants.join(", ")}. ` +
      "List memory, dream, recording, portrait, or flashback appearances in nonPresentParticipants."
    );
  }

  const sourceFiles = [
    "author-intent.md",
    "current-focus.md",
    "discovery/topic-candidates.yaml",
    "discovery/topic-decision.yaml",
    "discovery/topic-selection-report.json",
    "planning/market-position.yaml",
    "planning/story-bible.md",
    "planning/world-rules.yaml",
    "planning/characters/character-roster.md",
    "planning/volumes/current-volume.md",
    ...Object.values(DOMAIN_FILES).map((file) => `continuity/${file}`),
    `chapters/${chapterDirectory}/contract.yaml`
  ];
  if (chapter > 1 && state.continuity.lastCommittedChapter >= chapter - 1) {
    sourceFiles.push(`chapters/${String(chapter - 1).padStart(4, "0")}/final.md`);
  }
  const sources = await Promise.all(
    sourceFiles.map(async (relative) => ({
      path: relative,
      fingerprint: await fingerprintFile(path.join(workspace, relative))
    }))
  );

  const sections: string[] = [
    `# Chapter ${chapter} Context`,
    "",
    "## Contract",
    "",
    `- title: ${contract.title}`,
    `- goal: ${contract.goal}`,
    `- resistance: ${contract.resistance}`,
    `- reader promise: ${contract.readerPromise}`,
    `- key turn: ${contract.keyTurn}`,
    `- net change: ${contract.netChange}`,
    `- ending pull: ${contract.endingPull}`,
    `- required events: ${contract.requiredEvents.join("; ") || "none"}`,
    `- protected facts: ${contract.protectedFacts.join("; ") || "none"}`,
    `- prohibited crossings: ${contract.prohibitedCrossings.join("; ") || "none"}`,
    "",
    "## Selected Topic",
    "",
    `- working title: ${selectedTopic.workingTitle}`,
    `- target platform: ${selectedTopic.targetPlatform}`,
    `- work form: ${selectedTopic.workForm}`,
    `- genre: ${selectedTopic.genre}`,
    `- target reader: ${selectedTopic.targetReader}`,
    `- platform rationale: ${selectedTopic.platformRationale}`,
    `- reader need: ${selectedTopic.readerNeed}`,
    `- emotional reward: ${selectedTopic.emotionalReward}`,
    `- core fantasy: ${selectedTopic.coreFantasy}`,
    `- story engine: ${selectedTopic.storyEngine}`,
    `- differentiator: ${selectedTopic.differentiator}`,
    `- originality boundaries: ${topicDecision.protectedOriginality.join("; ")}`,
    "",
    "## Author Intent",
    "",
    takePrefix(await fs.readFile(path.join(workspace, "author-intent.md"), "utf8"), 1_200),
    "",
    "## Current Focus",
    "",
    takePrefix(await fs.readFile(path.join(workspace, "current-focus.md"), "utf8"), 1_000),
    "",
    "## Current Volume",
    "",
    takePrefix(await fs.readFile(path.join(workspace, "planning/volumes/current-volume.md"), "utf8"), 1_800),
    "",
    "## Relevant Continuity",
    ""
  ];

  if (selected.length === 0) {
    sections.push("- No matching active continuity entries. Treat this as an explicit gap.");
  } else {
    for (const entry of selected) {
      sections.push(
        `- [${entry.domain}/${entry.id}] ${JSON.stringify(contextValue(entry.domain, entry.value))} ` +
        `(source chapter ${entry.sourceChapter}; evidence: ${entry.evidence})`
      );
    }
  }

  if (chapter > 1 && state.continuity.lastCommittedChapter >= chapter - 1) {
    const previous = String(chapter - 1).padStart(4, "0");
    sections.push(
      "",
      "## Previous Chapter Handoff",
      "",
      takeTail(await fs.readFile(path.join(workspace, "chapters", previous, "final.md"), "utf8"), 1_800)
    );
  }

  sections.push("", "## Source Fingerprints", "");
  for (const source of sources) sections.push(`- ${source.path}: ${source.fingerprint}`);
  sections.push(
    "",
    "## Deliberate Omissions",
    "",
    "- Full prior chapters except the immediate handoff.",
    "- Raw market research; only the approved topic decision enters prose context.",
    "- Continuity entries unrelated to current participants, locations, IDs, or keywords.",
    "- Drafts, rejected reviews, and speculative future events.",
    ""
  );

  const complete = sections.join("\n");
  const truncated = complete.length > maxChars;
  const outputText = truncated
    ? `${complete.slice(0, maxChars - 80)}\n\n[context package truncated at ${maxChars} characters]\n`
    : complete;
  const output = path.join(chapterRoot, "context.md");
  const manifest = path.join(chapterRoot, "context-manifest.yaml");
  await atomicWriteText(output, outputText);
  await atomicWriteText(
    manifest,
    stringify(
      chapterContextManifestSchema.parse({
        schemaVersion: 1,
        chapter,
        generatedAt: new Date().toISOString(),
        maxChars,
        truncated,
        outputFingerprint: sha256Text(outputText),
        sources
      }),
      { lineWidth: 0 }
    )
  );
  try {
    await appendEvent(workspace, {
      at: new Date().toISOString(),
      action: "chapter_context_compiled",
      chapter,
      selectedEntries: selected.length,
      truncated
    });
  } catch {
    // Context output remains valid if diagnostic logging fails.
  }
  return { output, manifest, selectedEntries: selected.length, truncated };
}

export async function validateCurrentChapterContext(workspace: string): Promise<void> {
  const state = await readState(workspace);
  const chapter = state.workflow.currentChapter;
  const chapterDirectory = String(chapter).padStart(4, "0");
  const chapterRoot = path.join(workspace, "chapters", chapterDirectory);
  const manifestPath = path.join(chapterRoot, "context-manifest.yaml");
  const manifest = chapterContextManifestSchema.parse(
    parse(await fs.readFile(manifestPath, "utf8"))
  );
  if (manifest.chapter !== chapter) {
    throw new Error(`Context manifest chapter ${manifest.chapter} does not match current chapter ${chapter}.`);
  }

  const contextFingerprint = await fingerprintFile(path.join(chapterRoot, "context.md"));
  if (contextFingerprint !== manifest.outputFingerprint) {
    throw new Error("Chapter context changed after compilation. Recompile context.");
  }

  for (const source of manifest.sources) {
    let current: string;
    try {
      current = await fingerprintFile(path.join(workspace, source.path));
    } catch {
      throw new Error(`Context source is missing: ${source.path}. Recompile context.`);
    }
    if (current !== source.fingerprint) {
      throw new Error(`Chapter context is stale because ${source.path} changed. Recompile context.`);
    }
  }
}
