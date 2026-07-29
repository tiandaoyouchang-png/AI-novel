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
  chapterContractSchema,
  chapterReviewSchema,
  characterCardValueSchema,
  continuityDeltaSchema,
  continuityStoreSchema,
  evidenceValueSchema,
  logicDebtLedgerSchema,
  revealPolicySchema,
  serialPlanSchema,
  storyCardValueSchema,
  type ContinuityDomain,
  type ContinuityStore,
  type NovelState
} from "./schema.js";
import { generateCheckpoint } from "./checkpoint.js";
import {
  LOGIC_DEBT_FILE,
  readLogicDebtLedger,
  resolvedLogicDebtLedger,
  writeLogicDebtLedger
} from "./logic-debts.js";
import { createRevision, restoreRevision } from "./revisions.js";

const DOMAIN_FILES: Record<ContinuityDomain, string> = {
  facts: "facts.yaml",
  timeline: "timeline.yaml",
  threads: "threads.yaml",
  resources: "resources.yaml",
  relationships: "relationships.yaml",
  characters: "characters.yaml",
  storyCards: "story-cards.yaml",
  evidence: "evidence.yaml"
};

const pendingTransactionSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().regex(/^[A-Za-z0-9._-]+$/),
    chapter: z.number().int().positive(),
    createdAt: z.string().datetime(),
    revisionId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).nullable().default(null)
  })
  .strict();

const committedTransactionSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().regex(/^[A-Za-z0-9._-]+$/),
    chapter: z.number().int().positive(),
    status: z.literal("committed"),
    committedAt: z.string().datetime()
  })
  .strict();

function now(): string {
  return new Date().toISOString();
}

function pendingPath(workspace: string): string {
  return path.join(workspace, "runtime", "pending-continuity.yaml");
}

async function filesMatch(left: string, right: string): Promise<boolean> {
  if (!(await pathExists(left)) || !(await pathExists(right))) return false;
  const [leftFingerprint, rightFingerprint] = await Promise.all([
    fingerprintFile(left),
    fingerprintFile(right)
  ]);
  return leftFingerprint === rightFingerprint;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function targetDebtLedgerForReopen(
  workspace: string,
  sourceRun: string
) {
  const current = await readLogicDebtLedger(workspace);
  const beforePath = path.join(sourceRun, "logic-debts.before.yaml");
  const afterPath = path.join(sourceRun, "logic-debts.after.yaml");
  if (!(await pathExists(beforePath)) || !(await pathExists(afterPath))) {
    return current;
  }

  const before = logicDebtLedgerSchema.parse(parse(await fs.readFile(beforePath, "utf8")));
  const after = logicDebtLedgerSchema.parse(parse(await fs.readFile(afterPath, "utf8")));
  const beforeById = new Map(before.debts.map((debt) => [debt.id, debt]));
  const afterById = new Map(after.debts.map((debt) => [debt.id, debt]));
  const currentById = new Map(current.debts.map((debt) => [debt.id, debt]));
  const changedIds = new Set([...beforeById.keys(), ...afterById.keys()]);

  for (const id of changedIds) {
    const beforeDebt = beforeById.get(id);
    const afterDebt = afterById.get(id);
    if (sameValue(beforeDebt, afterDebt)) continue;
    if (!sameValue(currentById.get(id), afterDebt)) {
      throw new Error(
        `Logic debt ${id} changed after chapter commit and cannot be rolled back automatically.`
      );
    }
    if (beforeDebt) currentById.set(id, beforeDebt);
    else currentById.delete(id);
  }

  return logicDebtLedgerSchema.parse({
    schemaVersion: 1,
    debts: [...currentById.values()]
  });
}

async function matchingCommittedRun(
  workspace: string,
  chapter: number
): Promise<string | null> {
  const root = path.join(workspace, "runtime", "runs");
  if (!(await pathExists(root))) return null;
  const candidates: Array<{ runId: string; committedAt: string }> = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const transactionPath = path.join(root, entry.name, "transaction.yaml");
    if (!(await pathExists(transactionPath))) continue;
    try {
      const transaction = committedTransactionSchema.parse(
        parse(await fs.readFile(transactionPath, "utf8"))
      );
      if (transaction.chapter === chapter) {
        candidates.push({ runId: transaction.runId, committedAt: transaction.committedAt });
      }
    } catch {
      // Ignore incomplete or unrelated diagnostic runs.
    }
  }
  candidates.sort((left, right) => right.committedAt.localeCompare(left.committedAt));
  for (const candidate of candidates) {
    const runDirectory = path.join(root, candidate.runId);
    let matches = true;
    for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
      if (!await filesMatch(
        path.join(workspace, "continuity", DOMAIN_FILES[domain]),
        path.join(runDirectory, "continuity.after", DOMAIN_FILES[domain])
      )) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    if (!await filesMatch(
      path.join(workspace, "planning", "reveal-policy.yaml"),
      path.join(runDirectory, "reveal-policy.after.yaml")
    )) {
      continue;
    }
    return candidate.runId;
  }
  return null;
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
  if (domain === "evidence") evidenceValueSchema.parse(value);
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
    const backupPath = path.join(runDirectory, "continuity.before", DOMAIN_FILES[domain]);
    if (!(await pathExists(backupPath))) continue;
    const backup = await fs.readFile(backupPath, "utf8");
    await atomicWriteText(path.join(workspace, "continuity", DOMAIN_FILES[domain]), backup);
  }
  const stateBefore = await fs.readFile(path.join(runDirectory, "state.before.yaml"), "utf8");
  await atomicWriteText(path.join(workspace, STATE_FILE), stateBefore);
  const revealBefore = path.join(runDirectory, "reveal-policy.before.yaml");
  if (await pathExists(revealBefore)) {
    await atomicWriteText(
      path.join(workspace, "planning", "reveal-policy.yaml"),
      await fs.readFile(revealBefore, "utf8")
    );
  }
  const debtBefore = path.join(runDirectory, "logic-debts.before.yaml");
  if (await pathExists(debtBefore)) {
    await atomicWriteText(
      path.join(workspace, LOGIC_DEBT_FILE),
      await fs.readFile(debtBefore, "utf8")
    );
  }
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
  const contractPath = path.join(workspace, "chapters", chapterDirectory, "contract.yaml");
  const contract = await pathExists(contractPath)
    ? chapterContractSchema.parse(parse(await fs.readFile(contractPath, "utf8")))
    : null;
  const reviewPath = path.join(workspace, "chapters", chapterDirectory, "review.yaml");
  const review = await pathExists(reviewPath)
    ? chapterReviewSchema.parse(parse(await fs.readFile(reviewPath, "utf8")))
    : null;
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
  const evidenceChanges = new Map(
    delta.changes
      .filter((change) => change.domain === "evidence" && change.operation === "upsert")
      .map((change) => [change.id, evidenceValueSchema.parse(change.value)])
  );
  if (contract?.schemaVersion === 3) {
    for (const move of contract.evidenceMoves) {
      if (move.action === "hypothesize") continue;
      const evidence = evidenceChanges.get(move.evidenceId);
      if (!evidence) {
        throw new Error(
          `Evidence move ${move.action}/${move.evidenceId} must be recorded in the chapter continuity delta.`
        );
      }
      const allowedStatuses: Record<typeof move.action, string[]> = {
        discover: ["observed"],
        test: ["contested", "corroborated", "discredited"],
        corroborate: ["corroborated"],
        challenge: ["contested", "discredited"],
        admit: ["admitted"]
      };
      if (!allowedStatuses[move.action].includes(evidence.status)) {
        throw new Error(
          `Evidence move ${move.action}/${move.evidenceId} produced invalid status ${evidence.status}.`
        );
      }
    }
  }

  const revealPolicyPath = path.join(workspace, "planning", "reveal-policy.yaml");
  const revealPolicy = revealPolicySchema.parse(
    parse(await fs.readFile(revealPolicyPath, "utf8"))
  );
  const updatedRevealPolicy = structuredClone(revealPolicy);
  if (contract?.schemaVersion === 3) {
    const revealIds = new Set(contract.revealIds);
    for (const reveal of updatedRevealPolicy.reveals) {
      if (!revealIds.has(reveal.id)) continue;
      reveal.status = "revealed";
      reveal.revealedChapter = chapter;
      reveal.delayReason = null;
    }
  }
  revealPolicySchema.parse(updatedRevealPolicy);
  const logicDebtLedger = await readLogicDebtLedger(workspace);
  const updatedLogicDebtLedger = contract
    ? await resolvedLogicDebtLedger(workspace, contract, review)
    : logicDebtLedger;

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
    atomicWriteText(path.join(runDirectory, "state.after.yaml"), stringify(after, { lineWidth: 0 })),
    atomicWriteText(
      path.join(runDirectory, "reveal-policy.before.yaml"),
      stringify(revealPolicy, { lineWidth: 0 })
    ),
    atomicWriteText(
      path.join(runDirectory, "reveal-policy.after.yaml"),
      stringify(updatedRevealPolicy, { lineWidth: 0 })
    ),
    atomicWriteText(
      path.join(runDirectory, "logic-debts.before.yaml"),
      stringify(logicDebtLedger, { lineWidth: 0 })
    ),
    atomicWriteText(
      path.join(runDirectory, "logic-debts.after.yaml"),
      stringify(updatedLogicDebtLedger, { lineWidth: 0 })
    )
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
    await atomicWriteText(
      revealPolicyPath,
      stringify(updatedRevealPolicy, { lineWidth: 0 })
    );
    await writeLogicDebtLedger(workspace, updatedLogicDebtLedger);
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

export async function reopenLatestCommittedChapter(
  workspace: string,
  name: string,
  requestedChapter?: number
): Promise<{
  state: NovelState;
  revisionId: string;
  runId: string;
  draft: string;
}> {
  if (await hasPendingContinuityTransaction(workspace)) {
    throw new Error("A continuity transaction is incomplete. Run recover before revising a chapter.");
  }
  const before = await readState(workspace);
  const chapter = before.workflow.currentChapter;
  if (before.workflow.phase !== "production") {
    throw new Error("Chapter revision is available only in production phase.");
  }
  if (
    before.workflow.chapterStatus !== "continuity_committed" ||
    before.continuity.lastCommittedChapter !== chapter
  ) {
    throw new Error("Only the latest continuity-committed chapter can be revised safely.");
  }
  if (requestedChapter !== undefined && requestedChapter !== chapter) {
    throw new Error(`Requested chapter ${requestedChapter} is not the latest committed chapter ${chapter}.`);
  }
  const revisionName = name.trim();
  if (!revisionName) throw new Error("Chapter revision requires a non-empty name.");

  const serialPlan = serialPlanSchema.parse(
    parse(
      await fs.readFile(
        path.join(workspace, "publication", "serial-plan.yaml"),
        "utf8"
      )
    )
  );
  if (serialPlan.publishedThroughChapter >= chapter) {
    throw new Error(
      `Chapter ${chapter} is already marked published and cannot enter the local revision workflow.`
    );
  }

  const sourceRunId = await matchingCommittedRun(workspace, chapter);
  if (!sourceRunId) {
    throw new Error(
      "Cannot find a committed continuity transaction matching the current chapter state. " +
      "Resolve out-of-band continuity or reveal edits before revising."
    );
  }
  const sourceRun = path.join(workspace, "runtime", "runs", sourceRunId);
  const chapterDirectory = String(chapter).padStart(4, "0");
  const chapterRoot = path.join(workspace, "chapters", chapterDirectory);
  const finalPath = path.join(chapterRoot, "final.md");
  if (!(await pathExists(finalPath))) {
    throw new Error(`Committed chapter ${chapter} is missing final.md.`);
  }
  const acceptedProse = await fs.readFile(finalPath, "utf8");
  const safetyRevision = await createRevision(workspace, revisionName);

  const after: NovelState = structuredClone(before);
  after.workflow.chapterStatus = "not_started";
  after.workflow.reviewRound = 0;
  after.workflow.blockingReason = null;
  after.workflow.updatedAt = now();
  after.continuity.lastCommittedChapter = chapter - 1;

  const targetReveal = await fs.readFile(
    path.join(sourceRun, "reveal-policy.before.yaml"),
    "utf8"
  );
  const currentDebtLedger = await readLogicDebtLedger(workspace);
  const targetDebtLedger = await targetDebtLedgerForReopen(workspace, sourceRun);

  const runId = `chapter-revision-${now().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const runDirectory = path.join(workspace, "runtime", "runs", runId);
  const beforeDirectory = path.join(runDirectory, "continuity.before");
  const afterDirectory = path.join(runDirectory, "continuity.after");
  await Promise.all([
    fs.mkdir(beforeDirectory, { recursive: true }),
    fs.mkdir(afterDirectory, { recursive: true })
  ]);
  for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
    await Promise.all([
      atomicWriteText(
        path.join(beforeDirectory, DOMAIN_FILES[domain]),
        await fs.readFile(path.join(workspace, "continuity", DOMAIN_FILES[domain]), "utf8")
      ),
      atomicWriteText(
        path.join(afterDirectory, DOMAIN_FILES[domain]),
        await fs.readFile(
          path.join(sourceRun, "continuity.before", DOMAIN_FILES[domain]),
          "utf8"
        )
      )
    ]);
  }
  await Promise.all([
    atomicWriteText(
      path.join(runDirectory, "state.before.yaml"),
      stringify(before, { lineWidth: 0 })
    ),
    atomicWriteText(
      path.join(runDirectory, "state.after.yaml"),
      stringify(after, { lineWidth: 0 })
    ),
    atomicWriteText(
      path.join(runDirectory, "reveal-policy.before.yaml"),
      await fs.readFile(path.join(workspace, "planning", "reveal-policy.yaml"), "utf8")
    ),
    atomicWriteText(path.join(runDirectory, "reveal-policy.after.yaml"), targetReveal),
    atomicWriteText(
      path.join(runDirectory, "logic-debts.before.yaml"),
      stringify(currentDebtLedger, { lineWidth: 0 })
    ),
    atomicWriteText(
      path.join(runDirectory, "logic-debts.after.yaml"),
      stringify(targetDebtLedger, { lineWidth: 0 })
    )
  ]);
  await atomicWriteText(
    pendingPath(workspace),
    stringify(
      {
        schemaVersion: 1,
        runId,
        chapter,
        createdAt: now(),
        revisionId: safetyRevision.id
      },
      { lineWidth: 0 }
    )
  );

  try {
    for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
      await atomicWriteText(
        path.join(workspace, "continuity", DOMAIN_FILES[domain]),
        await fs.readFile(path.join(afterDirectory, DOMAIN_FILES[domain]), "utf8")
      );
    }
    await atomicWriteText(
      path.join(workspace, "planning", "reveal-policy.yaml"),
      targetReveal
    );
    await writeLogicDebtLedger(workspace, targetDebtLedger);
    await writeState(workspace, after);
    await atomicWriteText(path.join(chapterRoot, "draft.md"), acceptedProse);
    for (const file of [
      "context.md",
      "context-manifest.yaml",
      "review.yaml",
      "quality-draft.json",
      "final.md",
      "quality-final.json",
      "delta.yaml",
      "handoff.yaml"
    ]) {
      await fs.rm(path.join(chapterRoot, file), { force: true });
    }
    await fs.rm(path.join(workspace, "derived", "retrieval.sqlite"), { force: true });
  } catch (error) {
    await fs.rm(pendingPath(workspace), { force: true });
    await restoreRevision(workspace, safetyRevision.id);
    throw error;
  }

  await atomicWriteText(
    path.join(runDirectory, "transaction.yaml"),
    stringify({
      schemaVersion: 1,
      runId,
      chapter,
      status: "committed",
      committedAt: now(),
      operation: "chapter_revision_opened",
      sourceRunId,
      revisionId: safetyRevision.id
    }, { lineWidth: 0 })
  );
  await fs.rm(pendingPath(workspace), { force: true });
  await appendEvent(workspace, {
    at: after.workflow.updatedAt,
    action: "chapter_revision_opened",
    chapter,
    runId,
    sourceRunId,
    revisionId: safetyRevision.id
  });
  return {
    state: after,
    revisionId: safetyRevision.id,
    runId,
    draft: path.join(chapterRoot, "draft.md")
  };
}

export async function recoverContinuityTransaction(workspace: string): Promise<NovelState> {
  const target = pendingPath(workspace);
  if (!(await pathExists(target))) return readState(workspace);
  const pending = pendingTransactionSchema.parse(parse(await fs.readFile(target, "utf8")));
  if (pending.revisionId) {
    await restoreRevision(workspace, pending.revisionId);
  } else {
    await restoreFromRun(workspace, pending.runId);
  }
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
