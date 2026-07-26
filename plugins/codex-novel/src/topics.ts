import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse } from "yaml";
import {
  atomicWriteText,
  appendEvent,
  fingerprintFile
} from "./io.js";
import {
  marketPositionSchema,
  marketScanSchema,
  topicCandidatesSchema,
  topicDecisionSchema,
  topicSelectionReportSchema,
  type TopicSelectionReport
} from "./schema.js";

const INPUT_PATHS = [
  "discovery/market-scan.yaml",
  "discovery/topic-candidates.yaml",
  "discovery/topic-decision.yaml"
] as const;

const AUTHORITATIVE_TYPES = new Set([
  "industry-report",
  "platform-data",
  "reader-research"
]);

function dateAgeDays(later: string, earlier: string): number {
  const milliseconds =
    Date.parse(`${later}T00:00:00.000Z`) -
    Date.parse(`${earlier}T00:00:00.000Z`);
  return Math.floor(milliseconds / 86_400_000);
}

function weightedScore(scores: {
  demand: number;
  competitionWhitespace: number;
  channelFit: number;
  authorFit: number;
  serialSustainability: number;
  differentiation: number;
  evidenceQuality: number;
}): number {
  const result =
    scores.demand * 0.25 +
    scores.competitionWhitespace * 0.15 +
    scores.channelFit * 0.15 +
    scores.authorFit * 0.05 +
    scores.serialSustainability * 0.15 +
    scores.differentiation * 0.15 +
    scores.evidenceQuality * 0.1;
  return Math.round(result * 100) / 100;
}

async function inputSources(
  workspace: string
): Promise<Array<{ path: string; fingerprint: string }>> {
  return Promise.all(
    INPUT_PATHS.map(async (relative) => ({
      path: relative,
      fingerprint: await fingerprintFile(path.join(workspace, relative))
    }))
  );
}

export async function generateTopicSelectionReport(
  workspace: string,
  policyDate = new Date().toISOString().slice(0, 10)
): Promise<{ report: TopicSelectionReport; output: string }> {
  const [scanRaw, candidatesRaw, decisionRaw, positionRaw] = await Promise.all([
    fs.readFile(path.join(workspace, INPUT_PATHS[0]), "utf8"),
    fs.readFile(path.join(workspace, INPUT_PATHS[1]), "utf8"),
    fs.readFile(path.join(workspace, INPUT_PATHS[2]), "utf8"),
    fs.readFile(path.join(workspace, "planning/market-position.yaml"), "utf8")
  ]);
  const scan = marketScanSchema.parse(parse(scanRaw));
  const slate = topicCandidatesSchema.parse(parse(candidatesRaw));
  const decision = topicDecisionSchema.parse(parse(decisionRaw));
  const position = marketPositionSchema.parse(parse(positionRaw));
  const sourceById = new Map(scan.sources.map((source) => [source.id, source]));
  const candidateById = new Map(slate.candidates.map((candidate) => [candidate.id, candidate]));
  const blockingIssues: string[] = [];

  if (dateAgeDays(policyDate, scan.asOf) > 30) {
    blockingIssues.push(`Market scan is older than 30 days: ${scan.asOf}.`);
  }
  if (scan.asOf > policyDate) {
    blockingIssues.push(`Market scan asOf ${scan.asOf} is after policy date ${policyDate}.`);
  }
  const authoritativeSources = scan.sources.filter((source) =>
    AUTHORITATIVE_TYPES.has(source.type)
  );
  if (authoritativeSources.length < 2) {
    blockingIssues.push("Market scan requires at least two industry, platform, or reader sources.");
  }
  if (new Set(scan.sources.map((source) => source.publisher)).size < 2) {
    blockingIssues.push("Market scan requires at least two independent publishers.");
  }
  if (scan.sources.filter((source) => source.confidence !== "low").length < 2) {
    blockingIssues.push("Market scan requires at least two medium- or high-confidence sources.");
  }

  const ranked = slate.candidates
    .map((candidate) => {
      const issues: string[] = [];
      if (!scan.targetPlatforms.includes(candidate.targetPlatform)) {
        issues.push(`Candidate platform is not declared by the market scan: ${candidate.targetPlatform}.`);
      }
      if (!scan.targetForms.includes(candidate.workForm)) {
        issues.push(`Candidate form is not declared by the market scan: ${candidate.workForm}.`);
      }
      const evidence = candidate.evidenceIds
        .map((id) => sourceById.get(id))
        .filter((source) => source !== undefined);
      const unknown = candidate.evidenceIds.filter((id) => !sourceById.has(id));
      if (unknown.length > 0) {
        issues.push(`Unknown evidence IDs: ${unknown.join(", ")}.`);
      }
      if (new Set(evidence.map((source) => source.publisher)).size < 2) {
        issues.push("Candidate requires evidence from at least two independent publishers.");
      }
      const platformEvidence = evidence.filter(
        (source) =>
          source.appliesTo.includes(candidate.targetPlatform) &&
          source.appliesToForms.includes(candidate.workForm) &&
          AUTHORITATIVE_TYPES.has(source.type)
      );
      if (platformEvidence.length === 0) {
        issues.push(
          `Candidate requires industry, platform, or reader evidence applicable to ${candidate.targetPlatform}.`
        );
      }
      const freshDemandEvidence = evidence.filter(
        (source) =>
          source.type !== "competitor-product" &&
          source.appliesTo.includes(candidate.targetPlatform) &&
          source.appliesToForms.includes(candidate.workForm) &&
          dateAgeDays(policyDate, source.publishedAt) <= 550
      );
      if (freshDemandEvidence.length === 0) {
        issues.push("Candidate has no market-demand evidence published in the last 550 days.");
      }
      if (candidate.scores.demand < 3) issues.push("Demand score must be at least 3.");
      if (candidate.scores.channelFit < 3) issues.push("Channel-fit score must be at least 3.");
      if (candidate.scores.serialSustainability < 3) {
        issues.push("Serial-sustainability score must be at least 3.");
      }
      if (candidate.scores.differentiation < 3) {
        issues.push("Differentiation score must be at least 3.");
      }
      if (candidate.scores.evidenceQuality < 3) {
        issues.push("Evidence-quality score must be at least 3.");
      }
      if (candidate.workForm === "long-serial" && candidate.scores.serialSustainability < 4) {
        issues.push("Long-serial candidates require serial-sustainability score 4 or higher.");
      }
      if (
        candidate.workForm === "short-complete" &&
        (candidate.scores.channelFit < 4 || candidate.scores.differentiation < 4)
      ) {
        issues.push(
          "Short-complete candidates require channel-fit and differentiation scores 4 or higher."
        );
      }
      return {
        id: candidate.id,
        workingTitle: candidate.workingTitle,
        targetPlatform: candidate.targetPlatform,
        workForm: candidate.workForm,
        weightedScore: weightedScore(candidate.scores),
        gateOk: issues.length === 0,
        issues,
        evidenceCount: evidence.length
      };
    })
    .sort((left, right) =>
      right.weightedScore - left.weightedScore ||
      left.id.localeCompare(right.id)
    )
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  const selectedCandidate = candidateById.get(decision.selectedId);
  const selectedRanking = ranked.find((candidate) => candidate.id === decision.selectedId);
  if (!selectedCandidate || !selectedRanking) {
    blockingIssues.push(`Selected topic does not exist: ${decision.selectedId}.`);
  } else {
    if (!selectedRanking.gateOk) {
      blockingIssues.push(
        ...selectedRanking.issues.map((issue) => `Selected topic: ${issue}`)
      );
    }
    if (selectedCandidate.targetReader !== position.targetReader) {
      blockingIssues.push("Selected topic targetReader must match market-position.yaml exactly.");
    }
    if (selectedCandidate.targetPlatform !== position.targetPlatform) {
      blockingIssues.push("Selected topic targetPlatform must match market-position.yaml exactly.");
    }
    if (selectedCandidate.workForm !== position.workForm) {
      blockingIssues.push("Selected topic workForm must match market-position.yaml exactly.");
    }
    if (selectedCandidate.channel !== position.audienceChannel) {
      blockingIssues.push("Selected topic channel must match market-position.yaml exactly.");
    }
  }

  const expectedRejected = new Set(
    slate.candidates
      .filter((candidate) => candidate.id !== decision.selectedId)
      .map((candidate) => candidate.id)
  );
  const actualRejected = new Set(decision.rejected.map((candidate) => candidate.id));
  const missingRejected = [...expectedRejected].filter((id) => !actualRejected.has(id));
  const unexpectedRejected = [...actualRejected].filter((id) => !expectedRejected.has(id));
  if (missingRejected.length > 0 || unexpectedRejected.length > 0) {
    blockingIssues.push(
      `Rejected alternatives must match the candidate slate. Missing: ` +
      `${missingRejected.join(", ") || "none"}; unexpected: ` +
      `${unexpectedRejected.join(", ") || "none"}.`
    );
  }
  if (actualRejected.size !== decision.rejected.length) {
    blockingIssues.push("Rejected alternative IDs must be unique.");
  }

  const sources = await inputSources(workspace);
  const report = topicSelectionReportSchema.parse({
    schemaVersion: 1,
    policyDate,
    selectedId: decision.selectedId,
    selectedRank: selectedRanking?.rank ?? ranked.length + 1,
    selectedScore: selectedRanking?.weightedScore ?? 0,
    ok: blockingIssues.length === 0,
    blockingIssues,
    rankings: ranked,
    sources
  });
  const output = path.join(workspace, "discovery", "topic-selection-report.json");
  await atomicWriteText(output, `${JSON.stringify(report, null, 2)}\n`);
  try {
    await appendEvent(workspace, {
      at: new Date().toISOString(),
      action: "topic_selection_evaluated",
      selectedId: report.selectedId,
      selectedRank: report.selectedRank,
      ok: report.ok
    });
  } catch {
    // The report remains valid if diagnostic logging fails.
  }
  return { report, output };
}

export async function validateTopicSelection(
  workspace: string,
  policyDate = new Date().toISOString().slice(0, 10)
): Promise<TopicSelectionReport> {
  const report = topicSelectionReportSchema.parse(
    JSON.parse(
      await fs.readFile(
        path.join(workspace, "discovery", "topic-selection-report.json"),
        "utf8"
      )
    )
  );
  if (dateAgeDays(policyDate, report.policyDate) > 30) {
    throw new Error(`Topic selection report is older than 30 days: ${report.policyDate}.`);
  }
  const currentSources = await inputSources(workspace);
  for (const source of report.sources) {
    const current = currentSources.find((candidate) => candidate.path === source.path);
    if (!current || current.fingerprint !== source.fingerprint) {
      throw new Error(`Topic selection report is stale because ${source.path} changed.`);
    }
  }
  if (!report.ok) {
    throw new Error(
      `Topic selection has blocking issues:\n- ${report.blockingIssues.join("\n- ")}`
    );
  }
  return report;
}
