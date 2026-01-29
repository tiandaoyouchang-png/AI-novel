import type { OpencodeClient } from "@opencode-ai/sdk";

type ModelRef = {
  providerID: string;
  modelID: string;
};

function parseModelRef(model: string): ModelRef {
  const trimmed = model.trim();
  const idx = trimmed.indexOf("/");
  if (idx <= 0 || idx === trimmed.length - 1) {
    throw new Error(`Invalid model id: ${model}. Expected provider/model.`);
  }
  return { providerID: trimmed.slice(0, idx), modelID: trimmed.slice(idx + 1) };
}

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  const chunks: string[] = [];
  for (const p of parts) {
    if (!p || typeof p !== "object") continue;
    const type = (p as { type?: unknown }).type;
    if (type !== "text" && type !== "reasoning") continue;
    const text = (p as { text?: unknown }).text;
    if (typeof text === "string" && text.length > 0) chunks.push(text);
  }
  return chunks.join("\n").trim();
}

export async function promptText(opts: {
  client: OpencodeClient;
  sessionID: string;
  directory: string;
  model: string;
  system: string;
  text: string;
}): Promise<string> {
  const modelRef = parseModelRef(opts.model);
  const res = await opts.client.session.prompt({
    path: { id: opts.sessionID },
    query: { directory: opts.directory },
    body: {
      model: modelRef,
      system: opts.system,
      parts: [{ type: "text", text: opts.text }]
    }
  });

  const data = (res as unknown as { data?: unknown }).data ?? res;
  const parts = (data as { parts?: unknown }).parts;
  const text = extractTextFromParts(parts);
  if (!text) throw new Error("Model response contained no text parts.");
  return text;
}
