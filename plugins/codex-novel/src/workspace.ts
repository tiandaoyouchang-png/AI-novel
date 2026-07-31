import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { parse, stringify } from "yaml";
import {
  atomicWriteText,
  appendEvent,
  fingerprintFile,
  pathExists,
  readState,
  sha256Text,
  STATE_FILE,
  writeState
} from "./io.js";
import {
  chapterContractSchema,
  chapterHandoffSchema,
  chapterLengthPolicyIssues,
  chapterReviewSchema,
  continuityDeltaSchema,
  marketPositionSchema,
  qualityReportSchema,
  revealPolicySchema,
  validateState,
  type BookPhase,
  type ChapterStatus,
  type NovelState
} from "./schema.js";
import {
  commitContinuityDelta,
  hasPendingContinuityTransaction,
  validateContinuityStores
} from "./continuity.js";
import { validateCurrentChapterContext } from "./context.js";
import { readCurrentQualityReport } from "./quality.js";
import { validateTopicSelection } from "./topics.js";
import { loadCharacterProfiles, validateCreativeProfiles } from "./profiles.js";
import {
  inspectArcGrid,
  requireProductionArcGrid,
  validateHookExperiments
} from "./planning.js";
import {
  validateChapterGuardrails,
  validateStoryGuardrails
} from "./guardrails.js";
import {
  readLogicDebtLedger,
  validateContractLogicDebts,
  validateReviewLogicDebts
} from "./logic-debts.js";
import {
  readExternalReviewPolicy,
  requireExternalReviewComplete
} from "./external-review.js";

const PHASE_TRANSITIONS: Record<BookPhase, readonly BookPhase[]> = {
  preview: ["brief_approved"],
  brief_approved: ["foundation_approved"],
  foundation_approved: ["production"],
  production: ["completed"],
  completed: []
};

const CHAPTER_TRANSITIONS: Record<ChapterStatus, readonly ChapterStatus[]> = {
  not_started: ["planned"],
  planned: ["drafted"],
  drafted: ["reviewed"],
  reviewed: ["drafted", "accepted"],
  accepted: ["continuity_committed"],
  continuity_committed: []
};

const WORKSPACE_DIRECTORIES = [
  "discovery",
  "planning/characters",
  "planning/volumes",
  "planning/chapter-plans",
  "continuity/checkpoints",
  "chapters",
  "runtime/runs",
  "runtime/revisions",
  "derived",
  "exports",
  "publication",
  "reports/learning",
  "reports/external-reviews",
  "imports/chapters"
];

const OPTIONAL_WORKSPACE_DIRECTORIES = new Set([
  "runtime/runs",
  "runtime/revisions",
  "reports/learning",
  "reports/external-reviews",
  "imports/chapters"
]);

const INITIAL_FILES: Record<string, string> = {
  "discovery/market-scan.yaml": [
    "# (TODO: replace with at least three current, independently published market signals)",
    "schemaVersion: 1",
    "asOf: 2000-01-01",
    'targetMarket: "(TODO: define the shared market boundary)"',
    "targetPlatforms:",
    "  - fanqie",
    "  - zhihu-salt",
    "targetForms:",
    "  - long-serial",
    "  - short-complete",
    "sources: []",
    ""
  ].join("\n"),
  "discovery/topic-candidates.yaml": [
    "# (TODO: replace with three to eight evidence-backed topic candidates)",
    "schemaVersion: 1",
    "candidates: []",
    ""
  ].join("\n"),
  "discovery/topic-decision.yaml": [
    "# (TODO: select one candidate and record trade-offs plus a reader test)",
    "schemaVersion: 1",
    'selectedId: "(TODO)"',
    'decisionRationale: "(TODO)"',
    'selectionTradeoff: "(TODO)"',
    "rejected: []",
    "validation:",
    '  hypothesis: "(TODO)"',
    '  targetReaders: "(TODO)"',
    "  minimumSampleSize: 3",
    '  successSignal: "(TODO)"',
    "protectedOriginality: []",
    ""
  ].join("\n"),
  "discovery/hook-experiments.yaml": [
    "# (TODO: compare two or three anonymous opening-hook variants before brief approval)",
    "schemaVersion: 1",
    'selectedHookId: "(TODO)"',
    "candidates: []",
    "testProtocol:",
    "  blindLabels: true",
    '  targetReaders: "(TODO)"',
    "  minimumSampleSize: 3",
    "  questions: []",
    "  successSignals: []",
    "rejected: []",
    "notes: []",
    ""
  ].join("\n"),
  "author-intent.md": "# Author Intent\n\nDescribe what this novel should become and what must not be lost.\n",
  "current-focus.md": "# Current Focus\n\nDescribe the focus for the next one to three chapters.\n",
  "planning/novel-brief.md": "# Novel Brief\n\n(TODO: approve the reader promise, protagonist path, conflict, and progression loop.)\n",
  "planning/market-position.yaml": [
    "schemaVersion: 1",
    'targetPlatform: "(TODO: choose fanqie or zhihu-salt)"',
    'workForm: "(TODO: choose long-serial or short-complete)"',
    'targetReader: "(TODO: define a narrow target reader)"',
    'audienceChannel: "(TODO: define the distribution channel)"',
    'publicationFormat: "(TODO: define the serialization format)"',
    'primaryPromise: "(TODO: define the repeatable reader payoff)"',
    "chapterLength:",
    "  min: 1",
    "  target: 1",
    "  max: 1",
    "commercialAssumptions:",
    '  - "(TODO: state a testable commercial assumption)"',
    "contentBoundaries: []",
    ""
  ].join("\n"),
  "planning/story-bible.md": "# Story Bible\n\n(TODO)\n",
  "planning/story-guardrails.yaml": [
    "# (TODO: lock the signature mechanism, scope, capabilities, evidence method, period, and costs)",
    "schemaVersion: 1",
    "corePremise:",
    '  oneSentence: "(TODO)"',
    '  signatureMechanism: "(TODO)"',
    "  protectedElements: []",
    "  forbiddenDrift: []",
    "maxScope: county",
    "maxHiddenAntagonistLayers: 1",
    "capabilityBoundaries: []",
    "investigationRules:",
    "  coincidenceBudgetPerChapter: 0",
    "  requireAlternativeExplanations: true",
    "  evidenceMustNotNameCulprit: true",
    "  requireVerificationLimitation: true",
    "periodRules:",
    '  era: "(TODO)"',
    "  prohibitedModernTerms: []",
    "  institutionalConstraints: []",
    "  physicalConstraints: []",
    "supportingCharacters: []",
    "consequenceRules:",
    "  failureCannotAutoReward: true",
    "  permanentCosts: []",
    "prohibitedNarrativeShortcuts: []",
    ""
  ].join("\n"),
  "planning/reveal-policy.yaml": [
    "# Schedule protected meanings; do not write secrets directly into pre-reveal chapter context.",
    "schemaVersion: 1",
    "reveals: []",
    ""
  ].join("\n"),
  "planning/world-rules.yaml": "schemaVersion: 1\nrules: []\n",
  "planning/characters/character-roster.md": "# Character Roster\n\n(TODO)\n",
  "planning/volumes/current-volume.md": "# Current Volume Plan\n\n(TODO)\n",
  "planning/arc-grid.yaml": [
    "# Long serials require at least one cross-volume arc before production.",
    "schemaVersion: 1",
    "arcs: []",
    ""
  ].join("\n"),
  "planning/quality-rules.yaml": [
    "schemaVersion: 1",
    "bannedWords: []",
    "maxRepeatedPhraseOccurrences: 3",
    "repeatedPhraseLength: 8",
    "minParagraphs: 5",
    "maxParagraphLength: 500",
    ""
  ].join("\n"),
  "planning/logic-debts.yaml": [
    "# Cross-chapter obligations created by accepted prose reviews.",
    "schemaVersion: 1",
    "debts: []",
    ""
  ].join("\n"),
  "planning/external-review-policy.yaml": [
    "# External review is advisory and opt-in per workspace.",
    "schemaVersion: 1",
    "enabled: false",
    "provider: chatgpt-web",
    "requiredBeforeNextChapter: false",
    ""
  ].join("\n"),
  "planning/style-profile.yaml": [
    "schemaVersion: 1",
    "pov: third-limited",
    "tense: past",
    "pacing: balanced",
    "dialogueDensity: medium",
    "sentenceRhythm: 压力场景使用较短句，安静场景允许适度展开",
    "descriptionPreferences:",
    "  - 优先使用具体动作、感官证据和角色选择",
    "bannedPatterns:",
    "  - 大段解释角色已经通过行动表达的情绪",
    "sceneGuidance:",
    "  dialogue:",
    "    - 每轮对话都应改变信息、关系或行动选择",
    "  action:",
    "    - 动作必须受空间、能力和代价约束",
    "  investigation:",
    "    - 线索必须可回看且不能依赖作者临时补充",
    "  intimacy:",
    "    - 亲密变化通过具体选择体现",
    "  reveal:",
    "    - 揭示必须重排既有证据而非凭空新增答案",
    "  transition:",
    "    - 只保留推动时间、位置或压力变化的内容",
    "  other:",
    "    - 场景必须产生明确价值变化",
    ""
  ].join("\n"),
  "planning/style-examples.yaml": [
    "schemaVersion: 1",
    "# Only user-owned, explicitly authorized, or public-domain examples are allowed.",
    "examples: []",
    ""
  ].join("\n"),
  "continuity/facts.yaml": "schemaVersion: 1\nentries: []\n",
  "continuity/timeline.yaml": "schemaVersion: 1\nentries: []\n",
  "continuity/threads.yaml": "schemaVersion: 1\nentries: []\n",
  "continuity/resources.yaml": "schemaVersion: 1\nentries: []\n",
  "continuity/relationships.yaml": "schemaVersion: 1\nentries: []\n",
  "continuity/characters.yaml": "schemaVersion: 1\nentries: []\n",
  "continuity/story-cards.yaml": "schemaVersion: 1\nentries: []\n",
  "continuity/evidence.yaml": "schemaVersion: 1\nentries: []\n",
  "publication/serial-plan.yaml": [
    "schemaVersion: 1",
    "updatesPerWeek: 7",
    "targetBufferDays: 7",
    "publishedThroughChapter: 0",
    "blockedDays: []",
    ""
  ].join("\n"),
  "runtime/events.jsonl": ""
};

function now(): string {
  return new Date().toISOString();
}

function slugify(input: string): string {
  const slug = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "novel";
}

function chapterDirectory(state: NovelState): string {
  return String(state.workflow.currentChapter).padStart(4, "0");
}

type ArtifactKey = keyof NovelState["artifacts"];

async function artifactFingerprint(workspace: string, artifact: ArtifactKey): Promise<string> {
  if (artifact === "brief") {
    const briefFiles = [
      "discovery/market-scan.yaml",
      "discovery/topic-candidates.yaml",
      "discovery/topic-decision.yaml",
      "discovery/hook-experiments.yaml",
      "discovery/topic-selection-report.json",
      "planning/novel-brief.md",
      "planning/market-position.yaml"
    ];
    const combined = (
      await Promise.all(briefFiles.map((relative) => fs.readFile(path.join(workspace, relative), "utf8")))
    ).join("\n---\n");
    return sha256Text(combined);
  }
  if (artifact === "currentVolumePlan") {
    return fingerprintFile(path.join(workspace, "planning/volumes/current-volume.md"));
  }
  const foundationFiles = [
    "planning/story-bible.md",
    "planning/story-guardrails.yaml",
    "planning/world-rules.yaml",
    "planning/characters/character-roster.md",
    "planning/style-profile.yaml",
    "planning/style-examples.yaml"
  ];
  const profiles = await loadCharacterProfiles(workspace);
  foundationFiles.push(...profiles.map(({ path: relative }) => relative));
  const revealPolicy = revealPolicySchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning/reveal-policy.yaml"), "utf8"))
  );
  const stableRevealSchedule = revealPolicy.reveals.map((reveal) => ({
    ...reveal,
    status: reveal.status === "cancelled" ? "cancelled" : "planned",
    revealedChapter: null,
    delayReason: null
  }));
  const combined = [
    ...await Promise.all(
      foundationFiles.map((relative) => fs.readFile(path.join(workspace, relative), "utf8"))
    ),
    stringify({ schemaVersion: 1, reveals: stableRevealSchedule }, { lineWidth: 0 })
  ].join("\n---\n");
  return sha256Text(combined);
}

export async function detectStaleArtifacts(
  workspace: string,
  state: NovelState
): Promise<ArtifactKey[]> {
  const stale: ArtifactKey[] = [];
  for (const artifact of ["brief", "foundation", "currentVolumePlan"] as const) {
    const record = state.artifacts[artifact];
    if (record.status !== "accepted" || !record.fingerprint) continue;
    try {
      if ((await artifactFingerprint(workspace, artifact)) !== record.fingerprint) stale.push(artifact);
    } catch {
      stale.push(artifact);
    }
  }
  return stale;
}

async function hasUsableContent(filePath: string): Promise<boolean> {
  if (!(await pathExists(filePath))) return false;
  const raw = (await fs.readFile(filePath, "utf8")).trim();
  if (raw.length < 40 || raw.includes("(TODO")) return false;
  if (path.extname(filePath) === ".yaml") {
    try {
      const parsed = parse(raw);
      return typeof parsed === "object" && parsed !== null;
    } catch {
      return false;
    }
  }
  return true;
}

async function requireUsableFiles(workspace: string, files: readonly string[]): Promise<void> {
  const missing: string[] = [];
  for (const relative of files) {
    if (!(await hasUsableContent(path.join(workspace, relative)))) missing.push(relative);
  }
  if (missing.length > 0) {
    throw new Error(`Required accepted artifacts are missing or placeholders: ${missing.join(", ")}`);
  }
}

async function createTransitionSnapshot(
  workspace: string,
  before: NovelState,
  after: NovelState
): Promise<string> {
  const runId = `${now().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const runDirectory = path.join(workspace, "runtime", "runs", runId);
  await fs.mkdir(runDirectory, { recursive: true });
  await Promise.all([
    atomicWriteText(path.join(runDirectory, "state.before.yaml"), stringify(before)),
    atomicWriteText(path.join(runDirectory, "state.after.yaml"), stringify(after))
  ]);
  return runId;
}

async function recordTransitionEvent(
  workspace: string,
  state: NovelState,
  action: string,
  runId: string
): Promise<void> {
  try {
    await appendEvent(workspace, {
      at: state.workflow.updatedAt,
      action,
      runId,
      currentChapter: state.workflow.currentChapter,
      chapterStatus: state.workflow.chapterStatus,
      phase: state.workflow.phase
    });
  } catch {
    // Event logs are diagnostic and must never invalidate an authoritative state commit.
  }
}

export async function initializeWorkspace(
  target: string,
  options: { title: string; language?: string }
): Promise<NovelState> {
  const workspace = path.resolve(target);
  if (await pathExists(workspace)) {
    throw new Error(`Workspace already exists: ${workspace}`);
  }

  const parent = path.dirname(workspace);
  await fs.mkdir(parent, { recursive: true });
  const temporary = path.join(parent, `.${path.basename(workspace)}.init-${randomUUID()}`);
  const createdAt = now();
  const state: NovelState = {
    schemaVersion: 2,
    novel: {
      id: `${slugify(options.title)}-${randomUUID().slice(0, 8)}`,
      title: options.title.trim(),
      language: options.language?.trim() || "zh-CN",
      audienceChannel: "unconfirmed",
      publicationFormat: "unconfirmed"
    },
    workflow: {
      phase: "preview",
      currentChapter: 1,
      chapterStatus: "not_started",
      reviewRound: 0,
      delegatedThroughChapter: null,
      blockingReason: null,
      updatedAt: createdAt
    },
    artifacts: {
      brief: { status: "missing", fingerprint: null, acceptedAt: null },
      foundation: { status: "missing", fingerprint: null, acceptedAt: null },
      currentVolumePlan: { status: "missing", fingerprint: null, acceptedAt: null }
    },
    continuity: {
      lastCommittedChapter: 0,
      checkpointInterval: 10
    }
  };

  validateState(state);
  try {
    await fs.mkdir(temporary);
    await Promise.all(
      WORKSPACE_DIRECTORIES.map((relative) => fs.mkdir(path.join(temporary, relative), { recursive: true }))
    );
    await Promise.all(
      Object.entries(INITIAL_FILES).map(([relative, content]) =>
        atomicWriteText(path.join(temporary, relative), content)
      )
    );
    await atomicWriteText(path.join(temporary, STATE_FILE), stringify(state, { lineWidth: 0 }));
    await fs.rename(temporary, workspace);
    try {
      await appendEvent(workspace, { at: createdAt, action: "workspace_initialized" });
    } catch {
      // The workspace is valid even if its diagnostic event log cannot be appended.
    }
    return state;
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function transitionPhase(workspace: string, to: BookPhase): Promise<NovelState> {
  const before = await readState(workspace);
  if (!PHASE_TRANSITIONS[before.workflow.phase].includes(to)) {
    throw new Error(`Invalid phase transition: ${before.workflow.phase} -> ${to}`);
  }

  if (to === "brief_approved") {
    await requireUsableFiles(workspace, [
      "discovery/market-scan.yaml",
      "discovery/topic-candidates.yaml",
      "discovery/topic-decision.yaml",
      "discovery/hook-experiments.yaml",
      "discovery/topic-selection-report.json",
      "planning/novel-brief.md",
      "planning/market-position.yaml"
    ]);
    await validateTopicSelection(workspace);
    await validateHookExperiments(workspace);
  } else if (to === "foundation_approved") {
    await requireUsableFiles(workspace, [
      "planning/story-bible.md",
      "planning/story-guardrails.yaml",
      "planning/world-rules.yaml",
      "planning/characters/character-roster.md",
      "planning/style-profile.yaml",
      "planning/style-examples.yaml"
    ]);
    await validateCreativeProfiles(workspace);
    await validateStoryGuardrails(workspace);
  } else if (to === "production") {
    await requireUsableFiles(workspace, ["planning/volumes/current-volume.md"]);
    await requireProductionArcGrid(workspace);
    await validateStoryGuardrails(workspace);
  } else if (to === "completed" && before.workflow.chapterStatus !== "continuity_committed") {
    throw new Error("The current chapter must be continuity-committed before completing the book.");
  }

  const after: NovelState = structuredClone(before);
  after.workflow.phase = to;
  after.workflow.updatedAt = now();
  after.workflow.blockingReason = null;
  if (to === "brief_approved") {
    const position = marketPositionSchema.parse(
      parse(await fs.readFile(path.join(workspace, "planning/market-position.yaml"), "utf8"))
    );
    after.novel.audienceChannel = position.audienceChannel;
    after.novel.publicationFormat = position.publicationFormat;
    after.artifacts.brief = {
      status: "accepted",
      fingerprint: await artifactFingerprint(workspace, "brief"),
      acceptedAt: after.workflow.updatedAt
    };
  }
  if (to === "foundation_approved") {
    after.artifacts.foundation = {
      status: "accepted",
      fingerprint: await artifactFingerprint(workspace, "foundation"),
      acceptedAt: after.workflow.updatedAt
    };
  }
  if (to === "production") {
    after.artifacts.currentVolumePlan = {
      status: "accepted",
      fingerprint: await fingerprintFile(path.join(workspace, "planning/volumes/current-volume.md")),
      acceptedAt: after.workflow.updatedAt
    };
  }

  const runId = await createTransitionSnapshot(workspace, before, after);
  await writeState(workspace, after);
  await recordTransitionEvent(workspace, after, "phase_transition", runId);
  return after;
}

export async function invalidateArtifact(
  workspace: string,
  artifact: ArtifactKey,
  reason: string
): Promise<NovelState> {
  const before = await readState(workspace);
  const after: NovelState = structuredClone(before);
  const markStale = (key: ArtifactKey): void => {
    if (after.artifacts[key].status !== "missing") after.artifacts[key].status = "stale";
  };

  if (artifact === "brief") {
    markStale("brief");
    markStale("foundation");
    markStale("currentVolumePlan");
    after.workflow.phase = "preview";
  } else if (artifact === "foundation") {
    markStale("foundation");
    markStale("currentVolumePlan");
    after.workflow.phase = after.artifacts.brief.status === "accepted" ? "brief_approved" : "preview";
  } else {
    markStale("currentVolumePlan");
    after.workflow.phase = after.artifacts.foundation.status === "accepted"
      ? "foundation_approved"
      : after.artifacts.brief.status === "accepted"
        ? "brief_approved"
        : "preview";
  }

  after.workflow.blockingReason = reason.trim() || `${artifact} changed`;
  after.workflow.updatedAt = now();
  const runId = await createTransitionSnapshot(workspace, before, after);
  await writeState(workspace, after);
  await recordTransitionEvent(workspace, after, "artifact_invalidated", runId);
  return after;
}

export async function advanceChapter(
  workspace: string,
  to: ChapterStatus
): Promise<NovelState> {
  const before = await readState(workspace);
  const staleArtifacts = await detectStaleArtifacts(workspace, before);
  if (staleArtifacts.length > 0) {
    throw new Error(
      `Accepted artifacts changed after approval: ${staleArtifacts.join(", ")}. ` +
      "Run invalidate before continuing."
    );
  }
  if (before.workflow.phase !== "production") {
    throw new Error("Chapter production is locked until the book phase is production.");
  }
  if (!CHAPTER_TRANSITIONS[before.workflow.chapterStatus].includes(to)) {
    throw new Error(`Invalid chapter transition: ${before.workflow.chapterStatus} -> ${to}`);
  }
  if (
    before.workflow.chapterStatus === "reviewed" &&
    to === "drafted" &&
    before.workflow.reviewRound >= 2
  ) {
    throw new Error("The two-round repair budget is exhausted. Stop for author direction.");
  }

  const chapter = chapterDirectory(before);
  const requiredByStatus: Partial<Record<ChapterStatus, readonly string[]>> = {
    planned: [
      `chapters/${chapter}/contract.yaml`,
      `chapters/${chapter}/context.md`,
      `chapters/${chapter}/context-manifest.yaml`
    ],
    drafted: [`chapters/${chapter}/draft.md`],
    reviewed: [`chapters/${chapter}/review.yaml`, `chapters/${chapter}/quality-draft.json`],
    accepted: [`chapters/${chapter}/final.md`, `chapters/${chapter}/quality-final.json`],
    continuity_committed: [
      `chapters/${chapter}/delta.yaml`,
      `chapters/${chapter}/handoff.yaml`
    ]
  };
  await requireUsableFiles(workspace, requiredByStatus[to] ?? []);
  if (to === "planned") {
    const contract = chapterContractSchema.parse(
      parse(await fs.readFile(path.join(workspace, "chapters", chapter, "contract.yaml"), "utf8"))
    );
    if (contract.chapter !== before.workflow.currentChapter) {
      throw new Error("Chapter contract does not match current chapter.");
    }
    if (contract.schemaVersion !== 3) {
      throw new Error(
        "New chapter planning requires contract schemaVersion 3 with scope, capability, evidence, period, agency, and consequence checks."
      );
    }
    await validateChapterGuardrails(workspace, contract);
    await validateContractLogicDebts(workspace, contract);
    const position = marketPositionSchema.parse(
      parse(await fs.readFile(path.join(workspace, "planning/market-position.yaml"), "utf8"))
    );
    const policyIssues = chapterLengthPolicyIssues(contract, position);
    if (policyIssues.length > 0) {
      throw new Error(`Chapter contract violates market position:\n- ${policyIssues.join("\n- ")}`);
    }
    await validateCurrentChapterContext(workspace);
  }
  if (to === "reviewed") {
    const quality = await readCurrentQualityReport(workspace, "draft");
    if (!quality.ok) throw new Error("Draft quality gate has blocking issues.");
    const review = chapterReviewSchema.parse(
      parse(await fs.readFile(path.join(workspace, "chapters", chapter, "review.yaml"), "utf8"))
    );
    const contract = chapterContractSchema.parse(
      parse(await fs.readFile(path.join(workspace, "chapters", chapter, "contract.yaml"), "utf8"))
    );
    if (contract.schemaVersion === 3 && review.schemaVersion !== 3) {
      throw new Error("A schema-v3 chapter contract requires a schema-v3 review.");
    }
    if (review.sourceFingerprint !== quality.sourceFingerprint) {
      throw new Error("Review fingerprint does not match the current draft.");
    }
    if (review.reviewRound !== before.workflow.reviewRound + 1) {
      throw new Error(
        `Review round must advance from ${before.workflow.reviewRound} to ${before.workflow.reviewRound + 1}.`
      );
    }
    validateReviewLogicDebts(contract, review);
  }
  if (to === "accepted") {
    const quality = await readCurrentQualityReport(workspace, "final");
    if (!quality.ok) throw new Error("Final quality gate has blocking issues.");
    const review = chapterReviewSchema.parse(
      parse(await fs.readFile(path.join(workspace, "chapters", chapter, "review.yaml"), "utf8"))
    );
    const contract = chapterContractSchema.parse(
      parse(await fs.readFile(path.join(workspace, "chapters", chapter, "contract.yaml"), "utf8"))
    );
    validateReviewLogicDebts(contract, review);
    if (review.verdict !== "pass") {
      throw new Error("Chapter cannot be accepted until review verdict is pass.");
    }
    if (review.reviewRound !== before.workflow.reviewRound) {
      throw new Error("Accepted review round does not match chapter state.");
    }
    if (review.sourceFingerprint !== quality.sourceFingerprint) {
      throw new Error(
        "Accepted prose differs from the reviewed draft. Return to drafted, review the exact candidate, then accept."
      );
    }
  }
  if (to === "continuity_committed") {
    const handoff = chapterHandoffSchema.parse(
      parse(await fs.readFile(path.join(workspace, "chapters", chapter, "handoff.yaml"), "utf8"))
    );
    const finalFingerprint = await fingerprintFile(
      path.join(workspace, "chapters", chapter, "final.md")
    );
    if (handoff.chapter !== before.workflow.currentChapter) {
      throw new Error("Chapter handoff does not match the current chapter.");
    }
    if (handoff.sourceFingerprint !== finalFingerprint) {
      throw new Error("Chapter handoff fingerprint does not match accepted final prose.");
    }
  }

  const after: NovelState = structuredClone(before);
  after.workflow.chapterStatus = to;
  if (to === "reviewed") {
    const review = chapterReviewSchema.parse(
      parse(await fs.readFile(path.join(workspace, "chapters", chapter, "review.yaml"), "utf8"))
    );
    after.workflow.reviewRound = review.reviewRound;
  }
  after.workflow.updatedAt = now();
  after.workflow.blockingReason = null;
  if (to === "continuity_committed") {
    after.continuity.lastCommittedChapter = after.workflow.currentChapter;
    return commitContinuityDelta(workspace, before, after);
  }

  const runId = await createTransitionSnapshot(workspace, before, after);
  await writeState(workspace, after);
  await recordTransitionEvent(workspace, after, "chapter_transition", runId);
  return after;
}

export async function startNextChapter(workspace: string): Promise<NovelState> {
  const before = await readState(workspace);
  if (before.workflow.chapterStatus !== "continuity_committed") {
    throw new Error("The current chapter must be continuity-committed before starting the next.");
  }
  await requireExternalReviewComplete(workspace, before.workflow.currentChapter);

  const after: NovelState = structuredClone(before);
  after.workflow.currentChapter += 1;
  after.workflow.chapterStatus = "not_started";
  after.workflow.reviewRound = 0;
  after.workflow.updatedAt = now();
  const runId = await createTransitionSnapshot(workspace, before, after);
  await writeState(workspace, after);
  await recordTransitionEvent(workspace, after, "next_chapter", runId);
  return after;
}

export async function exportNovel(
  workspace: string,
  format: "md" | "txt"
): Promise<{ output: string; chapters: number[] }> {
  const state = await readState(workspace);
  if (state.continuity.lastCommittedChapter === 0) {
    throw new Error("No continuity-committed chapters are available to export.");
  }

  const chapters: number[] = [];
  const sections: string[] = [];
  for (let chapter = 1; chapter <= state.continuity.lastCommittedChapter; chapter++) {
    const directory = String(chapter).padStart(4, "0");
    const finalPath = path.join(workspace, "chapters", directory, "final.md");
    if (!(await hasUsableContent(finalPath))) {
      throw new Error(`Committed chapter is missing accepted prose: chapters/${directory}/final.md`);
    }
    sections.push((await fs.readFile(finalPath, "utf8")).trim());
    chapters.push(chapter);
  }

  const output = path.join(workspace, "exports", `${state.novel.id}.${format}`);
  await atomicWriteText(output, `${sections.join("\n\n")}\n`);
  try {
    await appendEvent(workspace, {
      at: now(),
      action: "novel_exported",
      output,
      chapters
    });
  } catch {
    // Export output is authoritative; the event log is diagnostic.
  }
  return { output, chapters };
}

export async function validateWorkspace(workspace: string): Promise<NovelState> {
  if (await hasPendingContinuityTransaction(workspace)) {
    throw new Error("A continuity transaction is incomplete. Run recover before continuing.");
  }
  const state = await readState(workspace);
  const stale = await detectStaleArtifacts(workspace, state);
  if (stale.length > 0) {
    throw new Error(
      `Accepted artifacts changed after approval: ${stale.join(", ")}. Run invalidate before continuing.`
    );
  }
  if (state.artifacts.foundation.status === "accepted") {
    await validateCreativeProfiles(workspace);
    await validateStoryGuardrails(workspace);
  }
  if (state.artifacts.brief.status === "accepted") {
    await validateHookExperiments(workspace);
  }
  if (state.workflow.phase === "production" || state.workflow.phase === "completed") {
    await requireProductionArcGrid(workspace);
  } else if (state.artifacts.brief.status === "accepted") {
    await inspectArcGrid(workspace);
  }
  const requiredDirectories = WORKSPACE_DIRECTORIES.filter(
    (relative) => !OPTIONAL_WORKSPACE_DIRECTORIES.has(relative)
  );
  const missingDirectories: string[] = [];
  for (const relative of requiredDirectories) {
    if (!(await pathExists(path.join(workspace, relative)))) missingDirectories.push(relative);
  }
  if (missingDirectories.length > 0) {
    throw new Error(`Required workspace directories are missing: ${missingDirectories.join(", ")}`);
  }
  await validateContinuityStores(workspace);
  await readLogicDebtLedger(workspace);
  await readExternalReviewPolicy(workspace);
  await validateCommittedChapterArtifacts(workspace, state);
  return state;
}

export async function validateCommittedChapterArtifacts(
  workspace: string,
  state: NovelState
): Promise<void> {
  const issues: string[] = [];
  const logicDebtLedger = await readLogicDebtLedger(workspace);
  const logicDebts = new Map(logicDebtLedger.debts.map((debt) => [debt.id, debt]));
  for (let chapter = 1; chapter <= state.continuity.lastCommittedChapter; chapter++) {
    const directory = String(chapter).padStart(4, "0");
    const chapterRoot = path.join(workspace, "chapters", directory);
    try {
      const contract = chapterContractSchema.parse(
        parse(await fs.readFile(path.join(chapterRoot, "contract.yaml"), "utf8"))
      );
      const review = chapterReviewSchema.parse(
        parse(await fs.readFile(path.join(chapterRoot, "review.yaml"), "utf8"))
      );
      const quality = qualityReportSchema.parse(
        JSON.parse(await fs.readFile(path.join(chapterRoot, "quality-final.json"), "utf8"))
      );
      const delta = continuityDeltaSchema.parse(
        parse(await fs.readFile(path.join(chapterRoot, "delta.yaml"), "utf8"))
      );
      const handoff = chapterHandoffSchema.parse(
        parse(await fs.readFile(path.join(chapterRoot, "handoff.yaml"), "utf8"))
      );
      const finalFingerprint = await fingerprintFile(path.join(chapterRoot, "final.md"));

      if (contract.chapter !== chapter) issues.push(`chapter ${chapter}: contract number mismatch`);
      if (review.verdict !== "pass") issues.push(`chapter ${chapter}: review is not passing`);
      try {
        validateReviewLogicDebts(contract, review);
      } catch (error) {
        issues.push(
          `chapter ${chapter}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      if (contract.schemaVersion === 3) {
        for (const resolution of contract.logicDebtResolutions) {
          const debt = logicDebts.get(resolution.debtId);
          if (
            !debt ||
            debt.status !== "resolved" ||
            debt.resolvedChapter !== chapter
          ) {
            issues.push(
              `chapter ${chapter}: logic debt ${resolution.debtId} is not transactionally resolved`
            );
          }
        }
      }
      if (review.sourceFingerprint !== finalFingerprint) {
        issues.push(`chapter ${chapter}: accepted prose differs from reviewed prose`);
      }
      if (quality.chapter !== chapter || quality.source !== "final" || !quality.ok) {
        issues.push(`chapter ${chapter}: final quality report is not passing`);
      }
      if (quality.sourceFingerprint !== finalFingerprint) {
        issues.push(`chapter ${chapter}: final quality report is stale`);
      }
      if (delta.chapter !== chapter || delta.sourceFingerprint !== finalFingerprint) {
        issues.push(`chapter ${chapter}: continuity delta is stale`);
      }
      if (handoff.chapter !== chapter || handoff.sourceFingerprint !== finalFingerprint) {
        issues.push(`chapter ${chapter}: handoff is stale`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(`chapter ${chapter}: ${message}`);
    }
  }
  if (issues.length > 0) {
    throw new Error(`Committed chapter integrity failed:\n- ${issues.join("\n- ")}`);
  }
}

export function formatStatus(state: NovelState): string {
  return [
    `# ${state.novel.title}`,
    "",
    `- phase: ${state.workflow.phase}`,
    `- current chapter: ${state.workflow.currentChapter}`,
    `- chapter status: ${state.workflow.chapterStatus}`,
    `- review round: ${state.workflow.reviewRound}/2`,
    `- last committed chapter: ${state.continuity.lastCommittedChapter}`,
    `- brief: ${state.artifacts.brief.status}`,
    `- foundation: ${state.artifacts.foundation.status}`,
    `- current volume plan: ${state.artifacts.currentVolumePlan.status}`
  ].join("\n");
}
