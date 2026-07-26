import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse, stringify } from "yaml";
import {
  atomicWriteText,
  fingerprintFile,
  pathExists,
  readState,
  sha256Text
} from "./io.js";
import {
  chapterContractSchema,
  chapterHandoffSchema,
  chapterLengthPolicyIssues,
  chapterReviewSchema,
  commercialMilestoneReviewSchema,
  continuityDeltaSchema,
  openingMilestoneReportSchema,
  marketPositionSchema,
  qualityReportSchema,
  storyMilestoneReportSchema,
  storyMilestoneReviewSchema,
  type StoryMilestoneType
} from "./schema.js";
import { generateCheckpoint } from "./checkpoint.js";
import { loadCharacterProfiles } from "./profiles.js";

const REPORT_DIRECTORY = "reports/opening-three";
const CONTINUITY_FILES = [
  "continuity/facts.yaml",
  "continuity/timeline.yaml",
  "continuity/threads.yaml",
  "continuity/resources.yaml",
  "continuity/relationships.yaml",
  "continuity/characters.yaml",
  "continuity/story-cards.yaml"
];

async function source(
  workspace: string,
  relative: string
): Promise<{ path: string; fingerprint: string }> {
  return {
    path: relative,
    fingerprint: await fingerprintFile(path.join(workspace, relative))
  };
}

function reviewTemplate(bundleFingerprint: string): unknown {
  const dimension = {
    score: 1,
    evidence: ["TODO: cite a concrete chapter location and reader effect."],
    nextAction: "TODO: specify one bounded repair or validation action."
  };
  return {
    schemaVersion: 1,
    milestone: "opening-three",
    bundleFingerprint,
    verdict: "revise",
    dimensions: {
      audienceFit: { ...dimension },
      openingHook: { ...dimension },
      protagonistAgency: { ...dimension },
      payoffDensity: { ...dimension },
      escalation: { ...dimension },
      emotionalInvestment: { ...dimension },
      proseDistinctiveness: { ...dimension },
      continuationIntent: { ...dimension }
    },
    blockingIssues: ["TODO: replace with the highest-leverage commercial risk."],
    marketTest: {
      hypothesis: "TODO: state which reader response this opening should cause.",
      targetReader: "TODO: state a narrow target reader segment.",
      successSignal: "TODO: state an observable signal such as chapter-3 continuation intent."
    }
  };
}

export async function validateCommercialMilestoneReview(
  workspace: string,
  expectedBundleFingerprint: string
): Promise<ReturnType<typeof commercialMilestoneReviewSchema.parse>> {
  const reviewPath = path.join(workspace, REPORT_DIRECTORY, "review.yaml");
  const review = commercialMilestoneReviewSchema.parse(
    parse(await fs.readFile(reviewPath, "utf8"))
  );
  if (review.bundleFingerprint !== expectedBundleFingerprint) {
    throw new Error("Commercial milestone review is stale. Regenerate the milestone and review the current bundle.");
  }
  return review;
}

export async function generateOpeningMilestone(
  workspace: string
): Promise<{
  report: ReturnType<typeof openingMilestoneReportSchema.parse>;
  reportPath: string;
  templatePath: string;
  reviewStatus: "missing" | "valid" | "stale-or-invalid";
  reviewVerdict: "pass" | "revise" | "reposition" | null;
}> {
  const state = await readState(workspace);
  if (state.continuity.lastCommittedChapter < 3) {
    throw new Error("The opening milestone requires chapters 1-3 to be continuity-committed.");
  }

  const blockingIssues: string[] = [];
  const characterProfilePaths = (await loadCharacterProfiles(workspace))
    .map(({ path: relative }) => relative);
  const globalSourcePaths = [
    "author-intent.md",
    "discovery/market-scan.yaml",
    "discovery/topic-candidates.yaml",
    "discovery/topic-decision.yaml",
    "discovery/topic-selection-report.json",
    "planning/novel-brief.md",
    "planning/market-position.yaml",
    "planning/story-bible.md",
    "planning/characters/character-roster.md",
    "planning/volumes/current-volume.md",
    "planning/style-profile.yaml",
    "planning/style-examples.yaml",
    ...characterProfilePaths,
    ...CONTINUITY_FILES
  ];
  const globalSources = await Promise.all(
    globalSourcePaths.map((relative) => source(workspace, relative))
  );
  const marketPosition = marketPositionSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning/market-position.yaml"), "utf8"))
  );
  const chapters: Array<{
    chapter: number;
    title: string;
    chineseCharacters: number;
    paragraphs: number;
    readerPromise: string;
    netChange: string;
    endingPull: string;
    reviewVerdict: "pass" | "repair" | "replan";
    qualityOk: boolean;
    sources: Array<{ path: string; fingerprint: string }>;
  }> = [];

  for (let chapter = 1; chapter <= 3; chapter++) {
    const directory = String(chapter).padStart(4, "0");
    const chapterRoot = `chapters/${directory}`;
    const paths = {
      contract: `${chapterRoot}/contract.yaml`,
      final: `${chapterRoot}/final.md`,
      review: `${chapterRoot}/review.yaml`,
      quality: `${chapterRoot}/quality-final.json`,
      delta: `${chapterRoot}/delta.yaml`,
      handoff: `${chapterRoot}/handoff.yaml`
    };
    const chapterSources = await Promise.all(
      Object.values(paths).map((relative) => source(workspace, relative))
    );
    const contract = chapterContractSchema.parse(
      parse(await fs.readFile(path.join(workspace, paths.contract), "utf8"))
    );
    const review = chapterReviewSchema.parse(
      parse(await fs.readFile(path.join(workspace, paths.review), "utf8"))
    );
    const quality = qualityReportSchema.parse(
      JSON.parse(await fs.readFile(path.join(workspace, paths.quality), "utf8"))
    );
    const delta = continuityDeltaSchema.parse(
      parse(await fs.readFile(path.join(workspace, paths.delta), "utf8"))
    );
    const handoff = chapterHandoffSchema.parse(
      parse(await fs.readFile(path.join(workspace, paths.handoff), "utf8"))
    );
    const finalFingerprint = chapterSources.find((item) => item.path === paths.final)?.fingerprint;
    if (!finalFingerprint) throw new Error(`Unable to fingerprint ${paths.final}.`);

    if (contract.chapter !== chapter) blockingIssues.push(`Chapter ${chapter} contract number is wrong.`);
    for (const issue of chapterLengthPolicyIssues(contract, marketPosition)) {
      blockingIssues.push(`Chapter ${chapter}: ${issue}`);
    }
    if (quality.chapter !== chapter || quality.source !== "final") {
      blockingIssues.push(`Chapter ${chapter} final quality report targets the wrong source.`);
    }
    if (!quality.ok) blockingIssues.push(`Chapter ${chapter} final quality report has blockers.`);
    if (quality.sourceFingerprint !== finalFingerprint) {
      blockingIssues.push(`Chapter ${chapter} final quality report is stale.`);
    }
    if (review.verdict !== "pass") blockingIssues.push(`Chapter ${chapter} review is not passing.`);
    if (review.sourceFingerprint !== finalFingerprint) {
      blockingIssues.push(`Chapter ${chapter} review is not bound to accepted prose.`);
    }
    if (delta.chapter !== chapter || delta.sourceFingerprint !== finalFingerprint) {
      blockingIssues.push(`Chapter ${chapter} continuity delta is not bound to accepted prose.`);
    }
    if (handoff.chapter !== chapter || handoff.sourceFingerprint !== finalFingerprint) {
      blockingIssues.push(`Chapter ${chapter} handoff is not bound to accepted prose.`);
    }

    chapters.push({
      chapter,
      title: contract.title,
      chineseCharacters: quality.metrics.chineseCharacters,
      paragraphs: quality.metrics.paragraphs,
      readerPromise: contract.readerPromise,
      netChange: contract.netChange,
      endingPull: contract.endingPull,
      reviewVerdict: review.verdict,
      qualityOk: quality.ok,
      sources: chapterSources
    });
  }

  const sources = [...globalSources, ...chapters.flatMap((chapter) => chapter.sources)];
  const bundleFingerprint = sha256Text(
    sources
      .map((item) => `${item.path}:${item.fingerprint}`)
      .sort()
      .join("\n")
  );
  const report = openingMilestoneReportSchema.parse({
    schemaVersion: 1,
    milestone: "opening-three",
    generatedAt: new Date().toISOString(),
    bundleFingerprint,
    ok: blockingIssues.length === 0,
    blockingIssues,
    chapters,
    sources: globalSources
  });

  const reportRoot = path.join(workspace, REPORT_DIRECTORY);
  await fs.mkdir(reportRoot, { recursive: true });
  const reportPath = path.join(reportRoot, "metrics.json");
  const templatePath = path.join(reportRoot, "review-template.yaml");
  await atomicWriteText(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await atomicWriteText(
    templatePath,
    stringify(reviewTemplate(bundleFingerprint), { lineWidth: 0 })
  );

  let reviewStatus: "missing" | "valid" | "stale-or-invalid" = "missing";
  let reviewVerdict: "pass" | "revise" | "reposition" | null = null;
  if (await pathExists(path.join(reportRoot, "review.yaml"))) {
    try {
      const review = await validateCommercialMilestoneReview(workspace, bundleFingerprint);
      reviewStatus = "valid";
      reviewVerdict = review.verdict;
    } catch {
      reviewStatus = "stale-or-invalid";
    }
  }

  return { report, reportPath, templatePath, reviewStatus, reviewVerdict };
}

function storyReviewDimensions(type: StoryMilestoneType): string[] {
  return type === "short-complete"
    ? [
        "openingPull",
        "compression",
        "causality",
        "emotionalEscalation",
        "reversal",
        "endingPayoff",
        "platformFit"
      ]
    : [
        "promiseDelivery",
        "escalation",
        "characterArcs",
        "subplotControl",
        "continuityHealth",
        "climaxPayoff",
        "nextVolumePull"
      ];
}

function storyReviewTemplate(
  type: StoryMilestoneType,
  bundleFingerprint: string
): unknown {
  return {
    schemaVersion: 1,
    milestone: type,
    bundleFingerprint,
    verdict: "revise",
    dimensions: storyReviewDimensions(type).map((id) => ({
      id,
      score: 1,
      evidence: ["TODO: cite accepted prose, handoff, or continuity evidence."],
      nextAction: "TODO: state one bounded revision or reader-validation action."
    })),
    blockingIssues: ["TODO: replace with the highest-leverage reader risk."],
    readerTest: {
      hypothesis: "TODO: state the intended reader response.",
      targetReader: "TODO: state a narrow target reader segment.",
      successSignal: "TODO: state an observable success signal."
    }
  };
}

export async function validateStoryMilestoneReview(
  workspace: string,
  type: StoryMilestoneType,
  expectedBundleFingerprint: string
): Promise<ReturnType<typeof storyMilestoneReviewSchema.parse>> {
  const reviewPath = path.join(workspace, "reports", type, "review.yaml");
  const review = storyMilestoneReviewSchema.parse(
    parse(await fs.readFile(reviewPath, "utf8"))
  );
  if (review.milestone !== type) {
    throw new Error(`Milestone review type does not match ${type}.`);
  }
  if (review.bundleFingerprint !== expectedBundleFingerprint) {
    throw new Error("Milestone review is stale. Regenerate and review the current accepted bundle.");
  }
  return review;
}

export async function generateStoryMilestone(
  workspace: string,
  type: StoryMilestoneType
): Promise<{
  report: ReturnType<typeof storyMilestoneReportSchema.parse>;
  reportPath: string;
  templatePath: string;
  reviewStatus: "missing" | "valid" | "stale-or-invalid";
  reviewVerdict: "pass" | "revise" | "reposition" | null;
  checkpointPath: string | null;
}> {
  const state = await readState(workspace);
  const position = marketPositionSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning/market-position.yaml"), "utf8"))
  );
  if (state.continuity.lastCommittedChapter === 0) {
    throw new Error(`${type} milestone requires at least one continuity-committed chapter.`);
  }
  if (type === "short-complete" && position.workForm !== "short-complete") {
    throw new Error("The short-complete milestone is only valid for short-complete projects.");
  }
  if (type === "volume" && position.workForm !== "long-serial") {
    throw new Error("The volume milestone is only valid for long-serial projects.");
  }

  const blockingIssues: string[] = [];
  const chapters: Array<{
    chapter: number;
    title: string;
    chineseCharacters: number;
    emotionalTarget: string;
    sceneCount: number;
    reviewRound: number;
    sources: Array<{ path: string; fingerprint: string }>;
  }> = [];

  for (let chapter = 1; chapter <= state.continuity.lastCommittedChapter; chapter++) {
    const directory = String(chapter).padStart(4, "0");
    const root = `chapters/${directory}`;
    const paths = [
      `${root}/contract.yaml`,
      `${root}/final.md`,
      `${root}/review.yaml`,
      `${root}/quality-final.json`,
      `${root}/delta.yaml`,
      `${root}/handoff.yaml`
    ];
    const chapterSources = await Promise.all(
      paths.map((relative) => source(workspace, relative))
    );
    const contract = chapterContractSchema.parse(
      parse(await fs.readFile(path.join(workspace, paths[0]!), "utf8"))
    );
    const review = chapterReviewSchema.parse(
      parse(await fs.readFile(path.join(workspace, paths[2]!), "utf8"))
    );
    const quality = qualityReportSchema.parse(
      JSON.parse(await fs.readFile(path.join(workspace, paths[3]!), "utf8"))
    );
    const delta = continuityDeltaSchema.parse(
      parse(await fs.readFile(path.join(workspace, paths[4]!), "utf8"))
    );
    const handoff = chapterHandoffSchema.parse(
      parse(await fs.readFile(path.join(workspace, paths[5]!), "utf8"))
    );
    const finalFingerprint = chapterSources[1]?.fingerprint;
    if (!finalFingerprint) throw new Error(`Unable to fingerprint ${paths[1]}.`);
    if (contract.chapter !== chapter) blockingIssues.push(`Chapter ${chapter}: contract number mismatch.`);
    if (review.verdict !== "pass" || review.sourceFingerprint !== finalFingerprint) {
      blockingIssues.push(`Chapter ${chapter}: review is not passing or is stale.`);
    }
    if (!quality.ok || quality.sourceFingerprint !== finalFingerprint) {
      blockingIssues.push(`Chapter ${chapter}: final quality report is not passing or is stale.`);
    }
    if (delta.chapter !== chapter || delta.sourceFingerprint !== finalFingerprint) {
      blockingIssues.push(`Chapter ${chapter}: continuity delta is stale.`);
    }
    if (handoff.chapter !== chapter || handoff.sourceFingerprint !== finalFingerprint) {
      blockingIssues.push(`Chapter ${chapter}: handoff is stale.`);
    }
    chapters.push({
      chapter,
      title: contract.title,
      chineseCharacters: quality.metrics.chineseCharacters,
      emotionalTarget: contract.emotionalTarget,
      sceneCount: contract.sceneBeats.length,
      reviewRound: review.reviewRound,
      sources: chapterSources
    });
  }

  const globalPaths = [
    "planning/market-position.yaml",
    "planning/story-bible.md",
    "planning/volumes/current-volume.md",
    "planning/style-profile.yaml",
    "planning/style-examples.yaml",
    ...(await loadCharacterProfiles(workspace)).map(({ path: relative }) => relative),
    ...CONTINUITY_FILES
  ];
  const globalSources = await Promise.all(
    globalPaths.map((relative) => source(workspace, relative))
  );
  const allSources = [...globalSources, ...chapters.flatMap((chapter) => chapter.sources)];
  const bundleFingerprint = sha256Text(
    allSources
      .map((item) => `${item.path}:${item.fingerprint}`)
      .sort()
      .join("\n")
  );
  const report = storyMilestoneReportSchema.parse({
    schemaVersion: 1,
    milestone: type,
    workForm: position.workForm,
    generatedAt: new Date().toISOString(),
    bundleFingerprint,
    throughChapter: state.continuity.lastCommittedChapter,
    totalChineseCharacters: chapters.reduce(
      (total, chapter) => total + chapter.chineseCharacters,
      0
    ),
    ok: blockingIssues.length === 0,
    blockingIssues,
    chapters,
    sources: globalSources
  });

  const reportRoot = path.join(workspace, "reports", type);
  await fs.mkdir(reportRoot, { recursive: true });
  const reportPath = path.join(reportRoot, "metrics.json");
  const templatePath = path.join(reportRoot, "review-template.yaml");
  await atomicWriteText(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await atomicWriteText(
    templatePath,
    stringify(storyReviewTemplate(type, bundleFingerprint), { lineWidth: 0 })
  );

  let reviewStatus: "missing" | "valid" | "stale-or-invalid" = "missing";
  let reviewVerdict: "pass" | "revise" | "reposition" | null = null;
  const reviewPath = path.join(reportRoot, "review.yaml");
  if (await pathExists(reviewPath)) {
    try {
      const review = await validateStoryMilestoneReview(
        workspace,
        type,
        bundleFingerprint
      );
      reviewStatus = "valid";
      reviewVerdict = review.verdict;
    } catch {
      reviewStatus = "stale-or-invalid";
    }
  }

  let checkpointPath: string | null = null;
  if (type === "volume") {
    checkpointPath = (
      await generateCheckpoint(
        workspace,
        `volume-through-${state.continuity.lastCommittedChapter}`
      )
    ).output;
  }
  return {
    report,
    reportPath,
    templatePath,
    reviewStatus,
    reviewVerdict,
    checkpointPath
  };
}
