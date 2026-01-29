import * as fs from "node:fs/promises";
export async function fileExists(p) {
    try {
        await fs.stat(p);
        return true;
    }
    catch {
        return false;
    }
}
export async function ensureDir(p) {
    await fs.mkdir(p, { recursive: true });
}
export async function writeTextIfMissing(p, content) {
    if (await fileExists(p))
        return false;
    await fs.writeFile(p, content, "utf8");
    return true;
}
export async function writeTextIfMissingOrEmpty(p, content) {
    if (!(await fileExists(p))) {
        await fs.writeFile(p, content, "utf8");
        return true;
    }
    const raw = await fs.readFile(p, "utf8");
    if (raw.trim().length > 0)
        return false;
    await fs.writeFile(p, content, "utf8");
    return true;
}
export async function readText(p) {
    return fs.readFile(p, "utf8");
}
export async function writeText(p, content) {
    await fs.writeFile(p, content, "utf8");
}
