import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import {
  appendEvent,
  atomicWriteText,
  fingerprintFile,
  pathExists,
  STATE_FILE
} from "./io.js";
import {
  revisionManifestSchema,
  type RevisionManifest
} from "./schema.js";

const REVISION_ROOT = path.join("runtime", "revisions");
const AUTHORITATIVE_ROOTS = [
  "discovery",
  "planning",
  "continuity",
  "chapters",
  "publication",
  "imports"
] as const;
const AUTHORITATIVE_TOP_LEVEL = [STATE_FILE, "author-intent.md", "current-focus.md"] as const;

function revisionId(): string {
  return `${new Date().toISOString().replace(/\D/g, "").toLowerCase()}-${randomUUID().slice(0, 8)}`;
}

function safeRelative(relative: string): string {
  const normalized = relative.split(path.sep).join(path.posix.sep);
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`Unsafe revision path: ${relative}`);
  }
  return normalized;
}

async function walkFiles(root: string, relative = ""): Promise<string[]> {
  const directory = path.join(root, relative);
  if (!(await pathExists(directory))) return [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(root, child));
    } else if (entry.isFile()) {
      files.push(safeRelative(child));
    }
  }
  return files;
}

async function authoritativeFiles(workspace: string): Promise<string[]> {
  const files: string[] = [];
  for (const relative of AUTHORITATIVE_TOP_LEVEL) {
    if (await pathExists(path.join(workspace, relative))) files.push(relative);
  }
  for (const root of AUTHORITATIVE_ROOTS) {
    files.push(...await walkFiles(workspace, root));
  }
  return [...new Set(files)].sort();
}

async function loadManifest(revisionDirectory: string): Promise<RevisionManifest> {
  return revisionManifestSchema.parse(
    JSON.parse(await fs.readFile(path.join(revisionDirectory, "manifest.json"), "utf8"))
  );
}

export async function listRevisions(workspace: string): Promise<RevisionManifest[]> {
  const root = path.join(workspace, REVISION_ROOT);
  if (!(await pathExists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const manifests: RevisionManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    try {
      manifests.push(await loadManifest(path.join(root, entry.name)));
    } catch {
      // An incomplete temporary revision is not a usable restore point.
    }
  }
  return manifests.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function createRevision(
  workspace: string,
  name: string
): Promise<RevisionManifest> {
  const revisionName = name.trim();
  if (!revisionName) throw new Error("Revision name cannot be empty.");
  const files = await authoritativeFiles(workspace);
  if (!files.includes(STATE_FILE)) throw new Error("Revision requires a valid novel-state.yaml.");

  const previous = (await listRevisions(workspace)).at(-1) ?? null;
  const previousMap = new Map(previous?.files.map((file) => [file.path, file.fingerprint]) ?? []);
  const currentFiles = await Promise.all(
    files.map(async (relative) => ({
      path: relative,
      fingerprint: await fingerprintFile(path.join(workspace, relative))
    }))
  );
  const currentMap = new Map(currentFiles.map((file) => [file.path, file.fingerprint]));
  const id = revisionId();
  const root = path.join(workspace, REVISION_ROOT);
  const temporary = path.join(root, `.${id}.tmp`);
  const destination = path.join(root, id);
  const manifest = revisionManifestSchema.parse({
    schemaVersion: 1,
    id,
    name: revisionName,
    createdAt: new Date().toISOString(),
    stateFingerprint: currentMap.get(STATE_FILE),
    baseRevisionId: previous?.id ?? null,
    files: currentFiles,
    diffSummary: {
      added: files.filter((relative) => !previousMap.has(relative)),
      changed: files.filter(
        (relative) => previousMap.has(relative) &&
          previousMap.get(relative) !== currentMap.get(relative)
      ),
      removed: [...previousMap.keys()].filter((relative) => !currentMap.has(relative))
    }
  });

  await fs.mkdir(root, { recursive: true });
  try {
    await fs.mkdir(temporary);
    for (const file of currentFiles) {
      const source = path.join(workspace, file.path);
      const target = path.join(temporary, "files", file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
    }
    await atomicWriteText(
      path.join(temporary, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }

  await appendEvent(workspace, {
    at: manifest.createdAt,
    action: "revision_created",
    revisionId: manifest.id,
    name: manifest.name
  });
  return manifest;
}

export async function restoreRevision(
  workspace: string,
  id: string
): Promise<{ restored: RevisionManifest; safetyRevision: RevisionManifest }> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("Invalid revision ID.");
  const revisionDirectory = path.join(workspace, REVISION_ROOT, id);
  const target = await loadManifest(revisionDirectory);
  const safetyRevision = await createRevision(workspace, `恢复前自动备份：${target.name}`);
  const currentFiles = await authoritativeFiles(workspace);
  const targetPaths = new Set(target.files.map((file) => safeRelative(file.path)));

  for (const relative of targetPaths) {
    const source = path.join(revisionDirectory, "files", relative);
    if (!(await pathExists(source))) throw new Error(`Revision snapshot is incomplete: ${relative}`);
    const actual = await fingerprintFile(source);
    const expected = target.files.find((file) => file.path === relative)?.fingerprint;
    if (actual !== expected) throw new Error(`Revision snapshot fingerprint mismatch: ${relative}`);
  }

  for (const file of target.files) {
    const source = path.join(revisionDirectory, "files", file.path);
    const destination = path.join(workspace, file.path);
    await atomicWriteText(destination, await fs.readFile(source, "utf8"));
  }
  for (const relative of currentFiles) {
    if (!targetPaths.has(relative)) await fs.rm(path.join(workspace, relative), { force: true });
  }

  await fs.rm(path.join(workspace, "derived", "retrieval.sqlite"), { force: true });
  await appendEvent(workspace, {
    at: new Date().toISOString(),
    action: "revision_restored",
    revisionId: target.id,
    safetyRevisionId: safetyRevision.id
  });
  return { restored: target, safetyRevision };
}
