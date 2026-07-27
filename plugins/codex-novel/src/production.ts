import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse, stringify } from "yaml";
import {
  marketPositionSchema,
  publicationMetricSchema,
  serialPlanSchema,
  topicDecisionSchema,
  type PublicationMetric,
  type SerialPlan
} from "./schema.js";
import {
  appendEvent,
  atomicWriteText,
  pathExists,
  readState
} from "./io.js";

export type CadenceReport = {
  applicable: boolean;
  updatesPerWeek: number;
  targetBufferDays: number;
  publishedThroughChapter: number;
  committedThroughChapter: number;
  readyInventory: number;
  bufferDays: number;
  health: "green" | "yellow" | "red" | "not-applicable";
  blockedDays: SerialPlan["blockedDays"];
};

async function readPosition(workspace: string) {
  return marketPositionSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning", "market-position.yaml"), "utf8"))
  );
}

async function readSerialPlan(workspace: string): Promise<SerialPlan> {
  return serialPlanSchema.parse(
    parse(await fs.readFile(path.join(workspace, "publication", "serial-plan.yaml"), "utf8"))
  );
}

export async function inspectCadence(workspace: string): Promise<CadenceReport> {
  const [position, plan, state] = await Promise.all([
    readPosition(workspace),
    readSerialPlan(workspace),
    readState(workspace)
  ]);
  if (plan.publishedThroughChapter > state.continuity.lastCommittedChapter) {
    throw new Error("Published chapter cannot exceed the last continuity-committed chapter.");
  }
  if (position.workForm === "short-complete") {
    return {
      applicable: false,
      updatesPerWeek: plan.updatesPerWeek,
      targetBufferDays: plan.targetBufferDays,
      publishedThroughChapter: plan.publishedThroughChapter,
      committedThroughChapter: state.continuity.lastCommittedChapter,
      readyInventory: 0,
      bufferDays: 0,
      health: "not-applicable",
      blockedDays: plan.blockedDays
    };
  }
  const readyInventory = state.continuity.lastCommittedChapter - plan.publishedThroughChapter;
  const bufferDays = Math.floor(readyInventory / (plan.updatesPerWeek / 7));
  const health = bufferDays >= plan.targetBufferDays
    ? "green"
    : bufferDays >= Math.min(3, plan.targetBufferDays)
      ? "yellow"
      : "red";
  return {
    applicable: true,
    updatesPerWeek: plan.updatesPerWeek,
    targetBufferDays: plan.targetBufferDays,
    publishedThroughChapter: plan.publishedThroughChapter,
    committedThroughChapter: state.continuity.lastCommittedChapter,
    readyInventory,
    bufferDays,
    health,
    blockedDays: plan.blockedDays
  };
}

export async function updatePublishedThrough(
  workspace: string,
  chapter: number
): Promise<CadenceReport> {
  const state = await readState(workspace);
  if (!Number.isInteger(chapter) || chapter < 0) {
    throw new Error("Published chapter must be a non-negative integer.");
  }
  if (chapter > state.continuity.lastCommittedChapter) {
    throw new Error("Published chapter cannot exceed the last continuity-committed chapter.");
  }
  const plan = await readSerialPlan(workspace);
  plan.publishedThroughChapter = chapter;
  await atomicWriteText(
    path.join(workspace, "publication", "serial-plan.yaml"),
    stringify(plan, { lineWidth: 0 })
  );
  await appendEvent(workspace, {
    at: new Date().toISOString(),
    action: "publication_progress_updated",
    publishedThroughChapter: chapter
  });
  return inspectCadence(workspace);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Metrics CSV contains an unclosed quoted field.");
  fields.push(field.trim());
  return fields;
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Metrics value is not numeric: ${value}`);
  return parsed;
}

export async function importPublicationMetrics(
  workspace: string,
  source: string
): Promise<{ imported: number; total: number; output: string }> {
  const lines = (await fs.readFile(source, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("Metrics CSV must include a header and at least one data row.");
  const headers = parseCsvLine(lines[0]!);
  for (const required of ["chapter", "observedAt"]) {
    if (!headers.includes(required)) throw new Error(`Metrics CSV is missing required column: ${required}`);
  }
  const indexOf = (name: string): number => headers.indexOf(name);
  const imported = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return publicationMetricSchema.parse({
      chapter: optionalNumber(values[indexOf("chapter")]),
      observedAt: values[indexOf("observedAt")],
      impressions: optionalNumber(values[indexOf("impressions")]),
      readers: optionalNumber(values[indexOf("readers")]),
      completionRate: optionalNumber(values[indexOf("completionRate")]),
      continuationRate: optionalNumber(values[indexOf("continuationRate")]),
      follows: optionalNumber(values[indexOf("follows")]),
      comments: optionalNumber(values[indexOf("comments")])
    });
  });
  const output = path.join(workspace, "publication", "metrics.json");
  const existing: PublicationMetric[] = await pathExists(output)
    ? zodMetrics(JSON.parse(await fs.readFile(output, "utf8")))
    : [];
  const merged = new Map<string, PublicationMetric>();
  for (const metric of [...existing, ...imported]) {
    merged.set(`${metric.chapter}:${metric.observedAt}`, metric);
  }
  const metrics = [...merged.values()].sort(
    (left, right) => left.chapter - right.chapter || left.observedAt.localeCompare(right.observedAt)
  );
  await atomicWriteText(output, `${JSON.stringify(metrics, null, 2)}\n`);
  await appendEvent(workspace, {
    at: new Date().toISOString(),
    action: "publication_metrics_imported",
    imported: imported.length,
    total: metrics.length
  });
  return { imported: imported.length, total: metrics.length, output };
}

function zodMetrics(input: unknown): PublicationMetric[] {
  if (!Array.isArray(input)) throw new Error("Stored publication metrics must be an array.");
  return input.map((entry) => publicationMetricSchema.parse(entry));
}

function average(values: Array<number | undefined>): number | null {
  const present = values.filter((value): value is number => value !== undefined);
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

export async function generateLearningReport(workspace: string): Promise<{
  output: string;
  report: Record<string, unknown>;
}> {
  const metricsPath = path.join(workspace, "publication", "metrics.json");
  if (!(await pathExists(metricsPath))) {
    throw new Error("No publication metrics are available. Import a CSV file first.");
  }
  const metrics = zodMetrics(JSON.parse(await fs.readFile(metricsPath, "utf8")));
  const decision = topicDecisionSchema.parse(
    parse(await fs.readFile(path.join(workspace, "discovery", "topic-decision.yaml"), "utf8"))
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    hypothesis: decision.validation.hypothesis,
    originalSuccessSignal: decision.validation.successSignal,
    observations: metrics.length,
    throughChapter: Math.max(...metrics.map((metric) => metric.chapter)),
    averages: {
      completionRate: average(metrics.map((metric) => metric.completionRate)),
      continuationRate: average(metrics.map((metric) => metric.continuationRate))
    },
    totals: {
      impressions: metrics.reduce((sum, metric) => sum + (metric.impressions ?? 0), 0),
      readers: metrics.reduce((sum, metric) => sum + (metric.readers ?? 0), 0),
      follows: metrics.reduce((sum, metric) => sum + (metric.follows ?? 0), 0),
      comments: metrics.reduce((sum, metric) => sum + (metric.comments ?? 0), 0)
    },
    conclusionStatus: "needs-author-review",
    reviewQuestions: [
      "真实数据是否达到原始成功信号？",
      "变化来自开篇、内容定位、更新节奏还是曝光结构？",
      "哪些结论仍缺少足够样本，不能据此修改权威设定？"
    ]
  };
  const reportRoot = path.join(workspace, "reports", "learning");
  const output = path.join(
    reportRoot,
    `${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  await atomicWriteText(output, `${JSON.stringify(report, null, 2)}\n`);
  return { output, report };
}
