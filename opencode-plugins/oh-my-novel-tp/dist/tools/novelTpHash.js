import { tool } from "@opencode-ai/plugin/tool";
import crypto from "node:crypto";
import fs from "node:fs";
export function createNovelTpHash() {
    return tool({
        description: "Compute sha256 for file contents or provided text",
        args: {
            filePath: tool.schema.string().optional().describe("File path to hash"),
            text: tool.schema.string().optional().describe("Raw text to hash")
        },
        async execute(args) {
            const hasFile = typeof args.filePath === "string" && args.filePath.length > 0;
            const hasText = typeof args.text === "string";
            if ((hasFile && hasText) || (!hasFile && !hasText)) {
                throw new Error("Provide exactly one of filePath or text");
            }
            const buf = hasFile ? fs.readFileSync(args.filePath) : Buffer.from(args.text, "utf8");
            const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
            return JSON.stringify({ sha256 });
        }
    });
}
