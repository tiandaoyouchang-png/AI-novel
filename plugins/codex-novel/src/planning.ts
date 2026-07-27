import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse } from "yaml";
import {
  arcGridSchema,
  continuityStoreSchema,
  hookExperimentsSchema,
  marketPositionSchema,
  type ArcGrid,
  type HookExperiments
} from "./schema.js";
import { readState } from "./io.js";

export async function validateHookExperiments(workspace: string): Promise<HookExperiments> {
  const raw = await fs.readFile(path.join(workspace, "discovery", "hook-experiments.yaml"), "utf8");
  return hookExperimentsSchema.parse(parse(raw));
}

export type ArcGridReport = {
  workForm: "long-serial" | "short-complete";
  totalArcs: number;
  activeArcs: number;
  idleArcs: Array<{
    id: string;
    title: string;
    idleChapters: number;
    maxIdleChapters: number;
  }>;
  payoffDebt: Array<{
    id: string;
    title: string;
    targetVolume: number;
    description: string;
  }>;
  warnings: string[];
};

export async function inspectArcGrid(
  workspace: string
): Promise<{ grid: ArcGrid; report: ArcGridReport }> {
  const position = marketPositionSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning", "market-position.yaml"), "utf8"))
  );
  const grid = arcGridSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning", "arc-grid.yaml"), "utf8"))
  );
  const state = await readState(workspace);
  const storyCards = continuityStoreSchema.parse(
    parse(await fs.readFile(path.join(workspace, "continuity", "story-cards.yaml"), "utf8"))
  );
  const activeStoryCardIds = new Set(
    storyCards.entries.filter((entry) => entry.status === "active").map((entry) => entry.id)
  );

  const idleArcs = grid.arcs
    .filter((arc) => arc.status === "active")
    .map((arc) => ({
      id: arc.id,
      title: arc.title,
      idleChapters: Math.max(0, state.continuity.lastCommittedChapter - arc.lastAdvancedChapter),
      maxIdleChapters: arc.maxIdleChapters
    }))
    .filter((arc) => arc.idleChapters > arc.maxIdleChapters);

  const payoffDebt = grid.arcs
    .filter((arc) => arc.status !== "resolved" && arc.status !== "abandoned")
    .map((arc) => ({
      id: arc.id,
      title: arc.title,
      targetVolume: arc.payoffTarget.volume,
      description: arc.payoffTarget.description
    }));

  const warnings: string[] = [];
  if (position.workForm === "long-serial" && grid.arcs.length === 0) {
    warnings.push("长篇连载至少需要一条跨卷主线或角色弧。");
  }
  if (position.workForm === "short-complete" && grid.arcs.length > 0) {
    warnings.push("短篇可以使用弧线表，但不需要为了跨卷结构增加无效支线。");
  }
  if (position.workForm === "long-serial" && state.continuity.lastCommittedChapter > 0) {
    for (const arc of grid.arcs) {
      const introduced = arc.introducedIn.chapter ?? 1;
      if (
        arc.status === "active" &&
        introduced <= state.continuity.lastCommittedChapter &&
        !activeStoryCardIds.has(arc.id)
      ) {
        warnings.push(`${arc.title} 已进入正文，但还没有同 ID 的动态剧情卡。`);
      }
    }
    const gridIds = new Set(grid.arcs.map((arc) => arc.id));
    for (const storyCardId of activeStoryCardIds) {
      if (!gridIds.has(storyCardId)) {
        warnings.push(`动态剧情卡 ${storyCardId} 尚未纳入跨卷弧线网格。`);
      }
    }
  }
  for (const arc of idleArcs) {
    warnings.push(
      `${arc.title} 已连续 ${arc.idleChapters} 章未推进，超过上限 ${arc.maxIdleChapters} 章。`
    );
  }

  return {
    grid,
    report: {
      workForm: position.workForm,
      totalArcs: grid.arcs.length,
      activeArcs: grid.arcs.filter((arc) => arc.status === "active").length,
      idleArcs,
      payoffDebt,
      warnings
    }
  };
}

export async function requireProductionArcGrid(workspace: string): Promise<ArcGrid> {
  const { grid, report } = await inspectArcGrid(workspace);
  if (report.workForm === "long-serial" && grid.arcs.length === 0) {
    throw new Error("Long serial production requires at least one cross-volume arc.");
  }
  return grid;
}
