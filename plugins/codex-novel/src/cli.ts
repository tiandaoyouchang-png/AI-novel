#!/usr/bin/env node

import * as path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
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
import { inspectArcGrid, validateHookExperiments } from "./planning.js";
import {
  guardrailSummary,
  inspectRevealPolicy
} from "./guardrails.js";
import { createRevision, listRevisions, restoreRevision } from "./revisions.js";
import {
  generateLearningReport,
  importPublicationMetrics,
  inspectCadence,
  updatePublishedThrough
} from "./production.js";
import { exportDocument, importManuscript } from "./documents.js";
import {
  friendlyError,
  guideWorkspace,
  runDoctor
} from "./diagnostics.js";

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
    "  hooks <workspace> [--json]",
    "  arcs <workspace> [--json]",
    "  guardrails <workspace> [--json]",
    "  reveals <workspace> [--json]",
    "  phase <workspace> --to <phase>",
    "  context <workspace> [--max-chars 20000]",
    "  quality <workspace> [--source draft|final]",
    "  milestone <workspace> [--type opening-three|short-complete|volume]",
    "  checkpoint <workspace> [--label text]",
    "  index <workspace>",
    "  search <workspace> --query <text> [--limit 8]",
    "  advance <workspace> --to <chapter-status>",
    "  next <workspace>",
    "  revision create <workspace> --name <name>",
    "  revision list <workspace> [--json]",
    "  revision restore <workspace> --id <revision-id>",
    "  cadence <workspace> [--published-through <chapter>]",
    "  metrics import <workspace> --file <metrics.csv>",
    "  learn <workspace> [--json]",
    "  import <workspace> --source <manuscript.md|txt> --title <title>",
    "  export <workspace> [--format md|txt|docx|epub]",
    "  recover <workspace>",
    "  doctor [workspace] [--json]",
    "  guide [workspace]",
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

async function interactiveGuide(): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("guide without a workspace requires an interactive terminal.");
  }
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const workspace = (await prompt.question("作品目录（例如 novels/my-story）：")).trim();
    const title = (await prompt.question("书名：")).trim();
    const platform = (await prompt.question("目标平台（fanqie / zhihu-salt）：")).trim();
    const form = (await prompt.question("作品形态（long-serial / short-complete）：")).trim();
    const genre = (await prompt.question("题材偏好：")).trim();
    if (!workspace || !title) throw new Error("作品目录和书名不能为空。");
    if (platform !== "fanqie" && platform !== "zhihu-salt") {
      throw new Error("目标平台只能是 fanqie 或 zhihu-salt。");
    }
    if (form !== "long-serial" && form !== "short-complete") {
      throw new Error("作品形态只能是 long-serial 或 short-complete。");
    }
    const resolved = path.resolve(workspace);
    await initializeWorkspace(resolved, { title });
    console.log(
      `\n已创建：${resolved}\n\n请在 Codex 中发送：\n` +
      `请读取 Codex Novel Skill，继续 ${resolved}。目标平台：${platform}；` +
      `作品形态：${form}；题材：${genre || "待探索"}。先完成市场扫描、候选选题和开篇钩子实验，不要直接写正文。`
    );
  } finally {
    prompt.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "help" || command === "--help") {
    console.log(usage());
    return;
  }

  if (command === "doctor") {
    const workspaceArg = args[1]?.startsWith("--") ? undefined : args[1];
    const result = await runDoctor(workspaceArg);
    console.log(
      args.includes("--json")
        ? JSON.stringify(result, null, 2)
        : result.checks.map(
          (check) =>
            `${check.ok ? "✓" : "✗"} ${check.message}` +
            (check.action ? `\n  下一步：${check.action}` : "")
        ).join("\n")
    );
    if (!result.ok) process.exitCode = 2;
    return;
  }

  if (command === "guide" && !args[1]) {
    await interactiveGuide();
    return;
  }

  if (command === "revision") {
    const action = args[1];
    const revisionWorkspace = args[2];
    if (!revisionWorkspace) throw new Error("revision requires create/list/restore and a workspace path.");
    const workspace = path.resolve(revisionWorkspace);
    if (action === "create") {
      const name = option(args, "--name");
      if (!name) throw new Error("revision create requires --name.");
      const revision = await createRevision(workspace, name);
      console.log(args.includes("--json") ? JSON.stringify(revision, null, 2) : `已创建修订版本 ${revision.id}：${revision.name}`);
      return;
    }
    if (action === "list") {
      const revisions = await listRevisions(workspace);
      console.log(
        args.includes("--json")
          ? JSON.stringify(revisions, null, 2)
          : revisions.length === 0
            ? "还没有命名修订版本。"
            : revisions.map((revision) => `- ${revision.id} ${revision.name} (${revision.createdAt})`).join("\n")
      );
      return;
    }
    if (action === "restore") {
      const id = option(args, "--id");
      if (!id) throw new Error("revision restore requires --id.");
      const result = await restoreRevision(workspace, id);
      console.log(
        `已恢复版本 ${result.restored.id}；恢复前状态已自动保存为 ${result.safetyRevision.id}。`
      );
      return;
    }
    throw new Error("revision action must be create, list, or restore.");
  }

  if (command === "metrics") {
    if (args[1] !== "import" || !args[2]) {
      throw new Error("Use metrics import <workspace> --file <metrics.csv>.");
    }
    const source = option(args, "--file");
    if (!source) throw new Error("metrics import requires --file.");
    const result = await importPublicationMetrics(path.resolve(args[2]), path.resolve(source));
    console.log(args.includes("--json") ? JSON.stringify(result, null, 2) : `已导入 ${result.imported} 条发布指标，共 ${result.total} 条。`);
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

  if (command === "hooks") {
    const experiment = await validateHookExperiments(workspace);
    console.log(
      json
        ? JSON.stringify(experiment, null, 2)
        : `开篇钩子实验有效：${experiment.candidates.length} 个候选，选择 ${experiment.selectedHookId}，` +
          `${experiment.rejected.length} 个方案已记录淘汰原因。`
    );
    return;
  }

  if (command === "arcs") {
    const { report } = await inspectArcGrid(workspace);
    console.log(
      json
        ? JSON.stringify(report, null, 2)
        : [
            `弧线总数：${report.totalArcs}；活跃：${report.activeArcs}；闲置超限：${report.idleArcs.length}`,
            `待兑现：${report.payoffDebt.length}`,
            ...report.warnings.map((warning) => `- ${warning}`)
          ].join("\n")
    );
    if (report.idleArcs.length > 0) process.exitCode = 2;
    return;
  }

  if (command === "guardrails") {
    const summary = await guardrailSummary(workspace);
    console.log(
      json
        ? JSON.stringify(summary, null, 2)
        : [
            `核心设定：${summary.premise}`,
            `招牌机制：${summary.signatureMechanism}`,
            `规模上限：${summary.maxScope}`,
            `幕后层级上限：${summary.maxHiddenAntagonistLayers}`,
            `角色能力边界：${summary.capabilityCharacters} 人`,
            `每章巧合预算：${summary.coincidenceBudget}`,
            `禁用现代词：${summary.prohibitedModernTerms.join("、") || "无"}`,
            `禁用剧情捷径：${summary.prohibitedShortcuts.join("、") || "无"}`
          ].join("\n")
    );
    return;
  }

  if (command === "reveals") {
    const report = await inspectRevealPolicy(workspace);
    console.log(
      json
        ? JSON.stringify(report, null, 2)
        : [
            `当前章节：${report.chapter}；待揭秘：${report.planned}`,
            `本章目标：${report.dueNow.join("、") || "无"}`,
            `已逾期：${report.overdue.join("、") || "无"}`,
            `明确延期：${report.delayed.map((item) => `${item.id}(${item.reason})`).join("、") || "无"}`,
            `仍受保护：${report.protected.map((item) =>
              `${item.id}(最早${item.earliestChapter}/目标${item.targetChapter})`
            ).join("、") || "无"}`
          ].join("\n")
    );
    if (report.overdue.length > 0) process.exitCode = 2;
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

  if (command === "cadence") {
    const published = option(args, "--published-through");
    const report = published === undefined
      ? await inspectCadence(workspace)
      : await updatePublishedThrough(workspace, Number(published));
    console.log(
      json
        ? JSON.stringify(report, null, 2)
        : report.applicable
          ? `库存 ${report.readyInventory} 章，约 ${report.bufferDays} 天，健康状态：${report.health}。`
          : "短篇完结项目不使用连载库存。"
    );
    return;
  }

  if (command === "learn") {
    const result = await generateLearningReport(workspace);
    console.log(json ? JSON.stringify(result, null, 2) : `已生成发布后复盘底稿：${result.output}`);
    return;
  }

  if (command === "import") {
    const source = option(args, "--source");
    const title = option(args, "--title");
    if (!source || !title) throw new Error("import requires --source and --title.");
    const result = await importManuscript(workspace, path.resolve(source), title);
    console.log(
      `已识别 ${result.chapters} 个章节。导入内容尚未成为权威正文；请先让 Codex 提取人物、时间线和伏笔：${result.manifest}`
    );
    return;
  }

  if (command === "export") {
    const formatOption = option(args, "--format") ?? "md";
    if (
      formatOption !== "md" &&
      formatOption !== "txt" &&
      formatOption !== "docx" &&
      formatOption !== "epub"
    ) {
      throw new Error("export --format must be md, txt, docx, or epub.");
    }
    const result = formatOption === "docx" || formatOption === "epub"
      ? await exportDocument(workspace, formatOption)
      : await exportNovel(workspace, formatOption);
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

  if (command === "guide") {
    const result = await guideWorkspace(workspace);
    console.log(`# ${result.title}\n\n下一步：${result.nextAction}\n\n可复制给 Codex：\n${result.prompt}`);
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`novelctl: ${friendlyError(message)}`);
  process.exitCode = 1;
});
