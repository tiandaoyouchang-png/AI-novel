import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse, stringify } from "yaml";
import {
  atomicWriteText,
  fingerprintFile,
  readState
} from "./io.js";
import {
  checkpointSchema,
  continuityStoreSchema,
  storyCardValueSchema,
  type ContinuityDomain
} from "./schema.js";

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

function safeLabel(label: string): string {
  const normalized = label
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "checkpoint";
}

export async function generateCheckpoint(
  workspace: string,
  requestedLabel?: string
): Promise<{ output: string; checkpoint: ReturnType<typeof checkpointSchema.parse> }> {
  const state = await readState(workspace);
  if (state.continuity.lastCommittedChapter === 0) {
    throw new Error("A checkpoint requires at least one continuity-committed chapter.");
  }

  const active = {
    facts: [] as string[],
    timeline: [] as string[],
    threads: [] as string[],
    resources: [] as string[],
    relationships: [] as string[],
    characters: [] as string[],
    storyCards: [] as string[],
    evidence: [] as string[]
  };
  const qualityDebt: string[] = [];
  const sources: Array<{ path: string; fingerprint: string }> = [];

  for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
    const relative = `continuity/${DOMAIN_FILES[domain]}`;
    const raw = await fs.readFile(path.join(workspace, relative), "utf8");
    const store = continuityStoreSchema.parse(parse(raw));
    active[domain] = store.entries
      .filter((entry) => entry.status === "active")
      .map((entry) => entry.id)
      .sort();
    if (domain === "storyCards") {
      for (const entry of store.entries.filter((item) => item.status === "active")) {
        const card = storyCardValueSchema.parse(entry.value);
        qualityDebt.push(`${entry.id}: ${card.payoffDebt}`);
      }
    }
    sources.push({ path: relative, fingerprint: await fingerprintFile(path.join(workspace, relative)) });
  }

  const statePath = path.join(workspace, "novel-state.yaml");
  const label = requestedLabel?.trim() || `chapter-${state.continuity.lastCommittedChapter}`;
  const checkpoint = checkpointSchema.parse({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    label,
    lastCommittedChapter: state.continuity.lastCommittedChapter,
    stateFingerprint: await fingerprintFile(statePath),
    active,
    qualityDebt,
    sources
  });
  const output = path.join(
    workspace,
    "continuity",
    "checkpoints",
    `${safeLabel(label)}.yaml`
  );
  await atomicWriteText(output, stringify(checkpoint, { lineWidth: 0 }));
  return { output, checkpoint };
}
