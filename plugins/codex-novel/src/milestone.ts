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
  chapterLengthPolicyIssues,
  chapterReviewSchema,
  commercialMilestoneReviewSchema,
  continuityDeltaSchema,
  openingMilestoneReportSchema,
  marketPositionSchema,
  qualityReportSchema
} from "./schema.js";

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
      delta: `${chapterRoot}/delta.yaml`
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
