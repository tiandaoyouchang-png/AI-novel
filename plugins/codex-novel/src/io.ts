import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parse, stringify } from "yaml";
import { validateState, type NovelState } from "./schema.js";

export const STATE_FILE = "novel-state.yaml";

export function sha256Text(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function fingerprintFile(target: string): Promise<string> {
  return sha256Text(await fs.readFile(target, "utf8"));
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function atomicWriteText(target: string, content: string): Promise<void> {
  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);

  try {
    await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export async function readState(workspace: string): Promise<NovelState> {
  const raw = await fs.readFile(path.join(workspace, STATE_FILE), "utf8");
  return validateState(parse(raw));
}

export async function writeState(workspace: string, state: NovelState): Promise<void> {
  const validated = validateState(state);
  await atomicWriteText(
    path.join(workspace, STATE_FILE),
    stringify(validated, { lineWidth: 0, sortMapEntries: false })
  );
}

export async function appendEvent(
  workspace: string,
  event: Record<string, unknown>
): Promise<void> {
  const eventPath = path.join(workspace, "runtime", "events.jsonl");
  await fs.mkdir(path.dirname(eventPath), { recursive: true });
  await fs.appendFile(eventPath, `${JSON.stringify(event)}\n`, "utf8");
}
