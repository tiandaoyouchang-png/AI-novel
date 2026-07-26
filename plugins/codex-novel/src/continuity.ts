import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { parse, stringify } from "yaml";
import { z } from "zod";
import {
  atomicWriteText,
  appendEvent,
  fingerprintFile,
  pathExists,
  readState,
  STATE_FILE,
  writeState
} from "./io.js";
import {
  characterCardValueSchema,
  continuityDeltaSchema,
  continuityStoreSchema,
  storyCardValueSchema,
  type ContinuityDomain,
  type ContinuityStore,
  type NovelState
} from "./schema.js";
import { generateCheckpoint } from "./checkpoint.js";

const DOMAIN_FILES: Record<ContinuityDomain, string> = {
  facts: "facts.yaml",
  timeline: "timeline.yaml",
  threads: "threads.yaml",
  resources: "resources.yaml",
  relationships: "relationships.yaml",
  characters: "characters.yaml",
  storyCards: "story-cards.yaml"
};

const pendingTransactionSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().regex(/^[A-Za-z0-9._-]+$/),
    chapter: z.number().int().positive(),
    createdAt: z.string().datetime()
  })
  .strict();

function now(): string {
  return new Date().toISOString();
}

function pendingPath(workspace: string): string {
  return path.join(workspace, "runtime", "pending-continuity.yaml");
}

async function readStore(workspace: string, domain: ContinuityDomain): Promise<ContinuityStore> {
  const raw = await fs.readFile(path.join(workspace, "continuity", DOMAIN_FILES[domain]), "utf8");
  const store = continuityStoreSchema.parse(parse(raw));
  for (const entry of store.entries) validateDomainValue(domain, entry.value);
  return store;
}

export async function validateContinuityStores(workspace: string): Promise<void> {
  const stores = {} as Record<ContinuityDomain, ContinuityStore>;
  for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
    stores[domain] = await readStore(workspace, domain);
  }
  const activeIds = (domain: ContinuityDomain): Set<string> =>
    new Set(
      stores[domain].entries
        .filter((entry) => entry.status === "active")
        .map((entry) => entry.id)
    );
  const characterIds = activeIds("characters");
  const threadIds = activeIds("threads");
  const knowledgeIds = new Set([...activeIds("facts"), ...threadIds]);

  for (const entry of stores.characters.entries) {
    if (entry.status !== "active") continue;
    const character = characterCardValueSchema.parse(entry.value);
    const visible = new Set(character.knowledgeIds);
    const overlap = character.hiddenKnowledgeIds.filter((id) => visible.has(id));
    if (overlap.length > 0) {
      throw new Error(
        `Character card ${entry.id} lists knowledge as both visible and hidden: ${overlap.join(", ")}`
      );
    }
    const unknown = [...character.knowledgeIds, ...character.hiddenKnowledgeIds]
      .filter((id) => !knowledgeIds.has(id));
    if (unknown.length > 0) {
      throw new Error(`Character card ${entry.id} references unknown knowledge IDs: ${unknown.join(", ")}`);
    }
  }

  for (const entry of stores.storyCards.entries) {
    if (entry.status !== "active") continue;
    const card = storyCardValueSchema.parse(entry.value);
    const unknownCharacters = card.characterIds.filter((id) => !characterIds.has(id));
    const unknownThreads = card.threadIds.filter((id) => !threadIds.has(id));
    if (unknownCharacters.length > 0 || unknownThreads.length > 0) {
      throw new Error(
        `Story card ${entry.id} has unknown references. Characters: ` +
        `${unknownCharacters.join(", ") || "none"}; threads: ${unknownThreads.join(", ") || "none"}.`
      );
    }
  }
}

export async function getContinuityCards(workspace: string): Promise<{
  characters: Array<{
    id: string;
    sourceChapter: number;
    evidence: string;
    value: z.infer<typeof characterCardValueSchema>;
  }>;
  storyCards: Array<{
    id: string;
    sourceChapter: number;
    evidence: string;
    value: z.infer<typeof storyCardValueSchema>;
  }>;
}> {
  await validateContinuityStores(workspace);
  const characters = (await readStore(workspace, "characters")).entries
    .filter((entry) => entry.status === "active")
    .map((entry) => ({
      id: entry.id,
      sourceChapter: entry.sourceChapter,
      evidence: entry.evidence,
      value: characterCardValueSchema.parse(entry.value)
    }));
  const storyCards = (await readStore(workspace, "storyCards")).entries
    .filter((entry) => entry.status === "active")
    .map((entry) => ({
      id: entry.id,
      sourceChapter: entry.sourceChapter,
      evidence: entry.evidence,
      value: storyCardValueSchema.parse(entry.value)
    }));
  return { characters, storyCards };
}

function validateDomainValue(
  domain: ContinuityDomain,
  value: Record<string, unknown>
): void {
  if (domain === "characters") characterCardValueSchema.parse(value);
  if (domain === "storyCards") storyCardValueSchema.parse(value);
}

function applyChanges(
  stores: Record<ContinuityDomain, ContinuityStore>,
  delta: z.infer<typeof continuityDeltaSchema>
): Record<ContinuityDomain, ContinuityStore> {
  const updated = structuredClone(stores);
  const timestamp = now();

  for (const change of delta.changes) {
    const store = updated[change.domain];
    const index = store.entries.findIndex((entry) => entry.id === change.id);
    const previous = index >= 0 ? store.entries[index] : undefined;

    if (change.operation === "retire" && !previous) {
      throw new Error(`Cannot retire missing ${change.domain} entry: ${change.id}`);
    }
    if (previous && previous.sourceChapter > delta.chapter) {
      throw new Error(`Cannot overwrite a newer ${change.domain} entry: ${change.id}`);
    }
    if (change.operation === "upsert") {
      validateDomainValue(change.domain, change.value);
    }
    if (change.domain === "characters" && previous && change.operation === "upsert") {
      const beforeCharacter = characterCardValueSchema.parse(previous.value);
      const afterCharacter = characterCardValueSchema.parse(change.value);
      if (beforeCharacter.lifeStatus === "dead" && afterCharacter.lifeStatus !== "dead") {
        throw new Error(
          `Dead character cannot return to ${afterCharacter.lifeStatus} without an explicit resurrection workflow: ${change.id}`
        );
      }
    }

    const entry = {
      id: change.id,
      status: change.operation === "retire" ? "retired" as const : "active" as const,
      value: change.operation === "retire" && previous ? previous.value : change.value,
      sourceChapter: delta.chapter,
      evidence: change.evidence,
      updatedAt: timestamp
    };
    if (index >= 0) store.entries[index] = entry;
    else store.entries.push(entry);
    store.entries.sort((a, b) => a.id.localeCompare(b.id));
  }

  for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
    continuityStoreSchema.parse(updated[domain]);
    for (const entry of updated[domain].entries) validateDomainValue(domain, entry.value);
  }
  return updated;
}

async function restoreFromRun(workspace: string, runId: string): Promise<void> {
  const runDirectory = path.join(workspace, "runtime", "runs", runId);
  for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
    const backup = await fs.readFile(path.join(runDirectory, "continuity.before", DOMAIN_FILES[domain]), "utf8");
    await atomicWriteText(path.join(workspace, "continuity", DOMAIN_FILES[domain]), backup);
  }
  const stateBefore = await fs.readFile(path.join(runDirectory, "state.before.yaml"), "utf8");
  await atomicWriteText(path.join(workspace, STATE_FILE), stateBefore);
}

export async function commitContinuityDelta(
  workspace: string,
  before: NovelState,
  after: NovelState
): Promise<NovelState> {
  const chapter = before.workflow.currentChapter;
  const chapterDirectory = String(chapter).padStart(4, "0");
  const finalPath = path.join(workspace, "chapters", chapterDirectory, "final.md");
  const deltaPath = path.join(workspace, "chapters", chapterDirectory, "delta.yaml");
  const delta = continuityDeltaSchema.parse(parse(await fs.readFile(deltaPath, "utf8")));

  if (delta.chapter !== chapter) {
    throw new Error(`Continuity delta chapter ${delta.chapter} does not match current chapter ${chapter}.`);
  }
  const finalFingerprint = await fingerprintFile(finalPath);
  if (delta.sourceFingerprint !== finalFingerprint) {
    throw new Error("Continuity delta fingerprint does not match accepted final prose.");
  }

  const stores = {} as Record<ContinuityDomain, ContinuityStore>;
  for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
    stores[domain] = await readStore(workspace, domain);
  }
  const updated = applyChanges(stores, delta);

  const runId = `continuity-${now().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const runDirectory = path.join(workspace, "runtime", "runs", runId);
  const beforeDirectory = path.join(runDirectory, "continuity.before");
  const afterDirectory = path.join(runDirectory, "continuity.after");
  await Promise.all([fs.mkdir(beforeDirectory, { recursive: true }), fs.mkdir(afterDirectory, { recursive: true })]);

  for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
    await Promise.all([
      atomicWriteText(path.join(beforeDirectory, DOMAIN_FILES[domain]), stringify(stores[domain], { lineWidth: 0 })),
      atomicWriteText(path.join(afterDirectory, DOMAIN_FILES[domain]), stringify(updated[domain], { lineWidth: 0 }))
    ]);
  }
  await Promise.all([
    atomicWriteText(path.join(runDirectory, "state.before.yaml"), stringify(before, { lineWidth: 0 })),
    atomicWriteText(path.join(runDirectory, "state.after.yaml"), stringify(after, { lineWidth: 0 }))
  ]);
  await atomicWriteText(
    pendingPath(workspace),
    stringify({ schemaVersion: 1, runId, chapter, createdAt: now() }, { lineWidth: 0 })
  );

  try {
    for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
      await atomicWriteText(
        path.join(workspace, "continuity", DOMAIN_FILES[domain]),
        stringify(updated[domain], { lineWidth: 0 })
      );
    }
    await writeState(workspace, after);
  } catch (error) {
    await restoreFromRun(workspace, runId);
    await fs.rm(pendingPath(workspace), { force: true });
    throw error;
  }

  await atomicWriteText(
    path.join(runDirectory, "transaction.yaml"),
    stringify({ schemaVersion: 1, runId, chapter, status: "committed", committedAt: now() })
  );
  await fs.rm(pendingPath(workspace), { force: true });
  try {
    await appendEvent(workspace, {
      at: after.workflow.updatedAt,
      action: "continuity_committed",
      runId,
      chapter,
      changes: delta.changes.length
    });
  } catch {
    // Event logs are diagnostic and must never invalidate the commit.
  }
  if (chapter % after.continuity.checkpointInterval === 0) {
    try {
      await generateCheckpoint(workspace, `chapter-${chapter}`);
    } catch {
      // Checkpoints are derived recovery aids and must not invalidate committed continuity.
    }
  }
  return after;
}

export async function recoverContinuityTransaction(workspace: string): Promise<NovelState> {
  const target = pendingPath(workspace);
  if (!(await pathExists(target))) return readState(workspace);
  const pending = pendingTransactionSchema.parse(parse(await fs.readFile(target, "utf8")));
  await restoreFromRun(workspace, pending.runId);
  await fs.rm(target, { force: true });
  const state = await readState(workspace);
  try {
    await appendEvent(workspace, {
      at: now(),
      action: "continuity_transaction_recovered",
      runId: pending.runId,
      chapter: pending.chapter
    });
  } catch {
    // Recovery remains valid if diagnostic logging fails.
  }
  return state;
}

export async function hasPendingContinuityTransaction(workspace: string): Promise<boolean> {
  return pathExists(pendingPath(workspace));
}
