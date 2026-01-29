import { tool } from "@opencode-ai/plugin/tool";
import crypto from "node:crypto";
import fs from "node:fs";

function sha256Text(text: string) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function createNovelTpExtractSection() {
  return tool({
    description: "Extract a section from a file by start/end regex; return text + sha256",
    args: {
      filePath: tool.schema.string().describe("Absolute file path"),
      startPattern: tool.schema.string().describe("Regex (multiline) to find section start"),
      endPattern: tool.schema.string().optional().describe("Regex (multiline) to find section end"),
      maxChars: tool.schema.number().optional().describe("Max chars to return").default(20000)
    },
    async execute(args: { filePath: string; startPattern: string; endPattern?: string; maxChars: number }) {
      const text = fs.readFileSync(args.filePath, "utf8");
      const startRe = new RegExp(args.startPattern, "m");
      const startMatch = startRe.exec(text);
      if (!startMatch || startMatch.index == null) {
        return JSON.stringify({ found: false });
      }

      const startIdx = startMatch.index;
      let endIdx = text.length;
      if (args.endPattern) {
        const endRe = new RegExp(args.endPattern, "m");
        const slice = text.slice(startIdx + startMatch[0].length);
        const endMatch = endRe.exec(slice);
        if (endMatch && endMatch.index != null) {
          endIdx = startIdx + startMatch[0].length + endMatch.index;
        }
      }

      const section = text.slice(startIdx, endIdx);
      const clipped = section.length > args.maxChars ? section.slice(0, args.maxChars) : section;

      return JSON.stringify({
        found: true,
        sha256: sha256Text(section),
        text: clipped,
        clipped: section.length > args.maxChars
      });
    }
  });
}
