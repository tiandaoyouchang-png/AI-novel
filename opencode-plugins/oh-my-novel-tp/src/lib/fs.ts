import * as fs from "node:fs/promises";

export async function fileExists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

export async function writeTextIfMissing(p: string, content: string) {
  if (await fileExists(p)) return false;
  await fs.writeFile(p, content, "utf8");
  return true;
}

export async function writeTextIfMissingOrEmpty(p: string, content: string) {
  if (!(await fileExists(p))) {
    await fs.writeFile(p, content, "utf8");
    return true;
  }
  const raw = await fs.readFile(p, "utf8");
  if (raw.trim().length > 0) return false;
  await fs.writeFile(p, content, "utf8");
  return true;
}

export async function readText(p: string) {
  return fs.readFile(p, "utf8");
}

export async function writeText(p: string, content: string) {
  await fs.writeFile(p, content, "utf8");
}
