import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "yaml";
import { fingerprintFile, pathExists, readState } from "./io.js";
import {
  continuityStoreSchema,
  styleExamplesSchema,
  type ContinuityDomain
} from "./schema.js";
import { loadCharacterProfiles } from "./profiles.js";

const INDEX_PATH = "derived/retrieval.sqlite";

async function loadNodeSqlite(): Promise<typeof import("node:sqlite")> {
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const message = warning instanceof Error ? warning.message : String(warning);
    if (message === "SQLite is an experimental feature and might change at any time") return;
    return original(warning, ...(args as [string?]));
  }) as typeof process.emitWarning;
  try {
    return await import("node:sqlite");
  } finally {
    process.emitWarning = original as typeof process.emitWarning;
  }
}
const DOMAIN_FILES: Record<ContinuityDomain, string> = {
  facts: "facts.yaml",
  timeline: "timeline.yaml",
  threads: "threads.yaml",
  resources: "resources.yaml",
  relationships: "relationships.yaml",
  characters: "characters.yaml",
  storyCards: "story-cards.yaml"
};

export type RetrievalCandidate = {
  id: string;
  kind: string;
  path: string;
  fingerprint: string;
  score: number;
};

type IndexDocument = Omit<RetrievalCandidate, "score"> & { content: string };

function ftsQuery(terms: readonly string[]): string {
  return [...new Set(
    terms
      .map((term) => searchableText(term))
      .filter((term) => term.length >= 2)
      .slice(0, 12)
  )]
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" OR ");
}

function searchableText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/(\p{Script=Han})/gu, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function rebuildRetrievalIndex(
  workspace: string
): Promise<{ output: string; documents: number }> {
  const state = await readState(workspace);
  const documents: IndexDocument[] = [];

  for (const { path: relative, profile } of await loadCharacterProfiles(workspace)) {
    documents.push({
      id: `character-profile:${profile.id}`,
      kind: "character-profile",
      path: relative,
      fingerprint: await fingerprintFile(path.join(workspace, relative)),
      content: JSON.stringify(profile)
    });
  }

  for (const domain of Object.keys(DOMAIN_FILES) as ContinuityDomain[]) {
    const relative = `continuity/${DOMAIN_FILES[domain]}`;
    const absolute = path.join(workspace, relative);
    const fingerprint = await fingerprintFile(absolute);
    const store = continuityStoreSchema.parse(parse(await fs.readFile(absolute, "utf8")));
    for (const entry of store.entries.filter((item) => item.status === "active")) {
      documents.push({
        id: `continuity:${domain}:${entry.id}`,
        kind: `continuity-${domain}`,
        path: relative,
        fingerprint,
        content: `${entry.id}\n${JSON.stringify(entry.value)}\n${entry.evidence}`
      });
    }
  }

  for (let chapter = 1; chapter <= state.continuity.lastCommittedChapter; chapter++) {
    const relative = `chapters/${String(chapter).padStart(4, "0")}/handoff.yaml`;
    const absolute = path.join(workspace, relative);
    if (!(await pathExists(absolute))) continue;
    documents.push({
      id: `handoff:${chapter}`,
      kind: "chapter-handoff",
      path: relative,
      fingerprint: await fingerprintFile(absolute),
      content: await fs.readFile(absolute, "utf8")
    });
  }

  const examplesRelative = "planning/style-examples.yaml";
  const examplesAbsolute = path.join(workspace, examplesRelative);
  const examplesFingerprint = await fingerprintFile(examplesAbsolute);
  const library = styleExamplesSchema.parse(parse(await fs.readFile(examplesAbsolute, "utf8")));
  for (const example of library.examples) {
    documents.push({
      id: `style-example:${example.id}`,
      kind: "style-example",
      path: examplesRelative,
      fingerprint: examplesFingerprint,
      content: `${example.title}\n${example.sceneTypes.join(" ")}\n${example.guidance}\n${example.excerpt}`
    });
  }

  const output = path.join(workspace, INDEX_PATH);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(temporary);
  try {
    database.exec(
      "CREATE VIRTUAL TABLE docs USING fts5(" +
      "id UNINDEXED, kind UNINDEXED, path UNINDEXED, fingerprint UNINDEXED, content, " +
      "tokenize='unicode61')"
    );
    const insert = database.prepare(
      "INSERT INTO docs (id, kind, path, fingerprint, content) VALUES (?, ?, ?, ?, ?)"
    );
    database.exec("BEGIN");
    try {
      for (const document of documents) {
        insert.run(
          document.id,
          document.kind,
          document.path,
          document.fingerprint,
          searchableText(document.content)
        );
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
  await fs.rm(output, { force: true });
  await fs.rename(temporary, output);
  return { output, documents: documents.length };
}

export async function queryRetrievalIndex(
  workspace: string,
  terms: readonly string[],
  limit = 8
): Promise<RetrievalCandidate[]> {
  const output = path.join(workspace, INDEX_PATH);
  if (!(await pathExists(output))) return [];
  const query = ftsQuery(terms);
  if (!query) return [];

  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(output, { readOnly: true });
  let raw: Array<Record<string, unknown>>;
  try {
    raw = database.prepare(
      "SELECT id, kind, path, fingerprint, bm25(docs) AS score " +
      "FROM docs WHERE docs MATCH ? ORDER BY score LIMIT ?"
    ).all(query, Math.max(1, Math.min(limit, 50))) as Array<Record<string, unknown>>;
  } finally {
    database.close();
  }

  const candidates: RetrievalCandidate[] = [];
  for (const item of raw) {
    const relative = String(item.path);
    const absolute = path.join(workspace, relative);
    if (!(await pathExists(absolute))) continue;
    const fingerprint = String(item.fingerprint);
    if ((await fingerprintFile(absolute)) !== fingerprint) continue;
    candidates.push({
      id: String(item.id),
      kind: String(item.kind),
      path: relative,
      fingerprint,
      score: Number(item.score)
    });
  }
  return candidates;
}

export async function readRetrievalCandidate(
  workspace: string,
  candidate: RetrievalCandidate
): Promise<string> {
  const absolute = path.join(workspace, candidate.path);
  if ((await fingerprintFile(absolute)) !== candidate.fingerprint) {
    throw new Error(`Retrieval candidate is stale: ${candidate.path}`);
  }
  const raw = await fs.readFile(absolute, "utf8");
  if (candidate.id.startsWith("continuity:")) {
    const [, , entryId] = candidate.id.split(":");
    const store = continuityStoreSchema.parse(parse(raw));
    const entry = store.entries.find((item) => item.id === entryId && item.status === "active");
    if (!entry) throw new Error(`Retrieval continuity entry is missing: ${candidate.id}`);
    return `${entry.id}: ${JSON.stringify(entry.value)} (evidence: ${entry.evidence})`;
  }
  if (candidate.id.startsWith("style-example:")) {
    const exampleId = candidate.id.slice("style-example:".length);
    const library = styleExamplesSchema.parse(parse(raw));
    const example = library.examples.find((item) => item.id === exampleId);
    if (!example) throw new Error(`Retrieval style example is missing: ${exampleId}`);
    return `${example.title}: ${example.guidance}\n${example.excerpt}`;
  }
  return raw;
}
