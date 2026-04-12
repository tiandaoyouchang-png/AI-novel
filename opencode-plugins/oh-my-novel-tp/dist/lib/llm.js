/**
 * Parse a model reference string into provider and model IDs
 * @param model - Model reference in format "provider/model"
 * @throws Error if model format is invalid
 */
export function parseModelRef(model) {
    const trimmed = model.trim();
    const idx = trimmed.indexOf("/");
    if (idx <= 0 || idx === trimmed.length - 1) {
        throw new Error(`Invalid model id: ${model}. Expected provider/model.`);
    }
    return { providerID: trimmed.slice(0, idx), modelID: trimmed.slice(idx + 1) };
}
/**
 * Extract text content from response parts
 */
export function extractTextFromParts(parts) {
    if (!Array.isArray(parts))
        return "";
    const chunks = [];
    for (const p of parts) {
        if (!p || typeof p !== "object")
            continue;
        const type = p.type;
        if (type !== "text" && type !== "reasoning")
            continue;
        const text = p.text;
        if (typeof text === "string" && text.length > 0)
            chunks.push(text);
    }
    return chunks.join("\n").trim();
}
/**
 * Prompt the LLM and extract text response
 */
export async function promptText(opts) {
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
    const data = res.data ?? res;
    const parts = data.parts;
    const text = extractTextFromParts(parts);
    if (!text)
        throw new Error("Model response contained no text parts.");
    return text;
}
