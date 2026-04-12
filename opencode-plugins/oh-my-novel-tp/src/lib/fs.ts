import * as fs from "node:fs/promises";

/**
 * Check if a file exists
 */
export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists (creates recursively if needed)
 */
export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

/**
 * Write text to file only if it doesn't exist
 * @returns true if file was created, false if it already existed
 */
export async function writeTextIfMissing(p: string, content: string): Promise<boolean> {
  if (await fileExists(p)) return false;
  await fs.writeFile(p, content, "utf8");
  return true;
}

/**
 * Write text to file only if it doesn't exist or is empty
 * @returns true if file was written, false if it already had content
 */
export async function writeTextIfMissingOrEmpty(p: string, content: string): Promise<boolean> {
  if (!(await fileExists(p))) {
    await fs.writeFile(p, content, "utf8");
    return true;
  }
  const raw = await fs.readFile(p, "utf8");
  if (raw.trim().length > 0) return false;
  await fs.writeFile(p, content, "utf8");
  return true;
}

/**
 * Read text from file
 */
export async function readText(p: string): Promise<string> {
  return fs.readFile(p, "utf8");
}

/**
 * Write text to file (overwrites if exists)
 */
export async function writeText(p: string, content: string): Promise<void> {
  await fs.writeFile(p, content, "utf8");
}
