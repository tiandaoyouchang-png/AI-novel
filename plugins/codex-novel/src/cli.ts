#!/usr/bin/env node

import * as path from "node:path";
import { readState } from "./io.js";
import { compileChapterContext } from "./context.js";
import { getContinuityCards, recoverContinuityTransaction } from "./continuity.js";
import { runQualityCheck } from "./quality.js";
import {
  generateOpeningMilestone,
  generateStoryMilestone
} from "./milestone.js";
import { generateTopicSelectionReport } from "./topics.js";
import { generateCheckpoint } from "./checkpoint.js";
import {
  queryRetrievalIndex,
  readRetrievalCandidate,
  rebuildRetrievalIndex
} from "./retrieval.js";
import {
  advanceChapter,
  exportNovel,
  formatStatus,
  initializeWorkspace,
  invalidateArtifact,
  startNextChapter,
  transitionPhase,
  validateWorkspace
} from "./workspace.js";
import { bookPhaseSchema, chapterStatusSchema } from "./schema.js";

function usage(): string {
  return [
    "novelctl <command> <workspace> [options]",
    "",
    "Commands:",
    "  init <workspace> --title <title> [--language zh-CN]",
    "  status <workspace> [--json]",
    "  validate <workspace> [--json]",
    "  cards <workspace> [--json]",
    "  invalidate <workspace> --artifact brief|foundation|current-volume-plan --reason <text>",
    "  topics <workspace> [--policy-date YYYY-MM-DD]",
    "  phase <workspace> --to <phase>",
    "  context <workspace> [--max-chars 20000]",
    "  quality <workspace> [--source draft|final]",
    "  milestone <workspace> [--type opening-three|short-complete|volume]",
    "  checkpoint <workspace> [--label text]",
    "  index <workspace>",
    "  search <workspace> --query <text> [--limit 8]",
    "  advance <workspace> --to <chapter-status>",
    "  next <workspace>",
    "  export <workspace> [--format md|txt]",
    "  recover <workspace>",
    "",
    "Book phases: preview, brief_approved, foundation_approved, production, completed",
    "Chapter statuses: not_started, planned, drafted, reviewed, accepted, continuity_committed"
  ].join("\n");
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "help" || command === "--help") {
    console.log(usage());
    return;
  }

  const workspaceArg = args[1];
  if (!workspaceArg) throw new Error(`Missing workspace path.\n\n${usage()}`);
  const workspace = path.resolve(workspaceArg);
  const json = args.includes("--json");

  if (command === "init") {
    const title = option(args, "--title");
    if (!title) throw new Error("init requires --title.");
    const language = option(args, "--language");
    const state = await initializeWorkspace(workspace, {
      title,
      ...(language ? { language } : {})
    });
    console.log(json ? JSON.stringify(state, null, 2) : formatStatus(state));
    return;
  }

  if (command === "status") {
    const state = await readState(workspace);
    console.log(json ? JSON.stringify(state, null, 2) : formatStatus(state));
    return;
  }

  if (command === "validate") {
    const state = await validateWorkspace(workspace);
    const productionReady = state.workflow.phase === "production";
    const readiness = {
      structurallyValid: true,
      productionReady,
      phase: state.workflow.phase,
      note: productionReady
        ? "The workspace is structurally valid and chapter production is unlocked."
        : "The workspace is structurally valid, but prose production remains locked until phase is production."
    };
    console.log(
      json
        ? JSON.stringify({ ok: true, readiness, state }, null, 2)
        : `Workspace is structurally valid. Phase: ${state.workflow.phase}. ` +
          `Production ready: ${productionReady ? "yes" : "no"}.`
    );
    return;
  }

  if (command === "cards") {
    const cards = await getContinuityCards(workspace);
    const state = await readState(workspace);
    const note = cards.characters.length === 0 && cards.storyCards.length === 0
      ? state.continuity.lastCommittedChapter === 0
        ? "No dynamic cards yet. This is expected before seed cards or the first continuity commit."
        : "No active dynamic cards; inspect retired entries or missing chapter deltas."
      : "Dynamic cards reflect accepted seed state and continuity-committed chapters only.";
    if (json) {
      console.log(JSON.stringify({ ...cards, lastCommittedChapter: state.continuity.lastCommittedChapter, note }, null, 2));
    } else {
      const characterLines = cards.characters.length > 0
        ? cards.characters.map(
          (card) =>
            `- ${card.value.name} [${card.value.lifeStatus}] — ` +
            `${card.value.currentLocation}; goal: ${card.value.currentGoal} ` +
            `(chapter ${card.sourceChapter})`
        )
        : ["- none"];
      const storyLines = cards.storyCards.length > 0
        ? cards.storyCards.map(
          (card) =>
            `- ${card.id} [${card.value.type}/${card.value.status}] — ` +
            `${card.value.currentBeat}; next: ${card.value.nextPressure}`
        )
        : ["- none"];
      console.log(
        `# Dynamic Cards\n\n## Characters\n\n${characterLines.join("\n")}\n\n` +
        `## Story\n\n${storyLines.join("\n")}\n\n${note}`
      );
    }
    return;
  }

  if (command === "invalidate") {
    const artifactOption = option(args, "--artifact");
    const artifact = artifactOption === "current-volume-plan" ? "currentVolumePlan" : artifactOption;
    if (artifact !== "brief" && artifact !== "foundation" && artifact !== "currentVolumePlan") {
      throw new Error("invalidate --artifact must be brief, foundation, or current-volume-plan.");
    }
    const reason = option(args, "--reason");
    if (!reason) throw new Error("invalidate requires --reason.");
    const state = await invalidateArtifact(workspace, artifact, reason);
    console.log(json ? JSON.stringify(state, null, 2) : formatStatus(state));
    return;
  }

  if (command === "phase") {
    const to = bookPhaseSchema.parse(option(args, "--to"));
    const state = await transitionPhase(workspace, to);
    console.log(json ? JSON.stringify(state, null, 2) : formatStatus(state));
    return;
  }

  if (command === "topics") {
    const policyDate = option(args, "--policy-date");
    const result = policyDate
      ? await generateTopicSelectionReport(workspace, policyDate)
      : await generateTopicSelectionReport(workspace);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const selected = result.report.rankings.find(
        (candidate) => candidate.id === result.report.selectedId
      );
      console.log(
        `Topic selection ${result.report.ok ? "passed" : "failed"}: ` +
        `${selected?.workingTitle ?? result.report.selectedId} ` +
        `(rank ${result.report.selectedRank}, score ${result.report.selectedScore.toFixed(2)}).\n` +
        `Report: ${result.output}`
      );
      if (result.report.blockingIssues.length > 0) {
        console.log(`Blocking issues:\n- ${result.report.blockingIssues.join("\n- ")}`);
      }
    }
    if (!result.report.ok) process.exitCode = 2;
    return;
  }

  if (command === "advance") {
    const to = chapterStatusSchema.parse(option(args, "--to"));
    const state = await advanceChapter(workspace, to);
    console.log(json ? JSON.stringify(state, null, 2) : formatStatus(state));
    return;
  }

  if (command === "context") {
    const maxCharsOption = option(args, "--max-chars");
    const maxChars = maxCharsOption ? Number(maxCharsOption) : 20_000;
    if (!Number.isInteger(maxChars)) throw new Error("context --max-chars must be an integer.");
    const result = await compileChapterContext(workspace, maxChars);
    console.log(json ? JSON.stringify(result, null, 2) : `Compiled context to ${result.output}`);
    return;
  }

  if (command === "quality") {
    const sourceOption = option(args, "--source") ?? "draft";
    if (sourceOption !== "draft" && sourceOption !== "final") {
      throw new Error("quality --source must be draft or final.");
    }
    const report = await runQualityCheck(workspace, sourceOption);
    console.log(json ? JSON.stringify(report, null, 2) : report.ok ? "Quality gate passed." : "Quality gate failed.");
    if (!report.ok) process.exitCode = 2;
    return;
  }

  if (command === "milestone") {
    const type = option(args, "--type") ?? "opening-three";
    if (type !== "opening-three" && type !== "short-complete" && type !== "volume") {
      throw new Error("milestone --type must be opening-three, short-complete, or volume.");
    }
    const result = type === "opening-three"
      ? await generateOpeningMilestone(workspace)
      : await generateStoryMilestone(workspace, type);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const mechanical = result.report.ok ? "passed" : "failed";
      const review = result.reviewStatus === "valid"
        ? result.reviewVerdict
        : result.reviewStatus;
      console.log(
        `${type} milestone mechanical checks ${mechanical}; commercial review ${review}.\n` +
        `Metrics: ${result.reportPath}\nReview template: ${result.templatePath}`
      );
    }
    if (!result.report.ok) process.exitCode = 2;
    return;
  }

  if (command === "checkpoint") {
    const result = await generateCheckpoint(workspace, option(args, "--label"));
    console.log(
      json
        ? JSON.stringify(result, null, 2)
        : `Created checkpoint for chapter ${result.checkpoint.lastCommittedChapter}: ${result.output}`
    );
    return;
  }

  if (command === "index") {
    const result = await rebuildRetrievalIndex(workspace);
    console.log(
      json
        ? JSON.stringify(result, null, 2)
        : `Rebuilt retrieval index with ${result.documents} document(s): ${result.output}`
    );
    return;
  }

  if (command === "search") {
    const query = option(args, "--query");
    if (!query) throw new Error("search requires --query.");
    const limitOption = option(args, "--limit");
    const limit = limitOption ? Number(limitOption) : 8;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("search --limit must be an integer between 1 and 50.");
    }
    const candidates = await queryRetrievalIndex(
      workspace,
      query.split(/\s+/).filter(Boolean),
      limit
    );
    const results = await Promise.all(
      candidates.map(async (candidate) => ({
        ...candidate,
        content: await readRetrievalCandidate(workspace, candidate)
      }))
    );
    console.log(
      json
        ? JSON.stringify(results, null, 2)
        : results.length === 0
          ? "No current indexed sources matched."
          : results
            .map((item) => `- ${item.kind}/${item.id} (${item.path})`)
            .join("\n")
    );
    return;
  }

  if (command === "next") {
    const state = await startNextChapter(workspace);
    console.log(json ? JSON.stringify(state, null, 2) : formatStatus(state));
    return;
  }

  if (command === "export") {
    const formatOption = option(args, "--format") ?? "md";
    if (formatOption !== "md" && formatOption !== "txt") {
      throw new Error("export --format must be md or txt.");
    }
    const result = await exportNovel(workspace, formatOption);
    console.log(
      json
        ? JSON.stringify(result, null, 2)
        : `Exported ${result.chapters.length} chapter(s) to ${result.output}`
    );
    return;
  }

  if (command === "recover") {
    const state = await recoverContinuityTransaction(workspace);
    console.log(json ? JSON.stringify(state, null, 2) : formatStatus(state));
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`novelctl: ${message}`);
  process.exitCode = 1;
});
