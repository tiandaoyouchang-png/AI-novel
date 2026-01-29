import { resolveNovelRoot } from "./lib/paths.js";
import { createNovelTpInit } from "./tools/novelTpInit.js";
import { createNovelTpPreflight } from "./tools/novelTpPreflight.js";
import { createNovelTpHash } from "./tools/novelTpHash.js";
import { createNovelTpExtractSection } from "./tools/novelTpExtractSection.js";
const plugin = async (ctx) => {
    const toolCtx = {
        projectDir: ctx.directory,
        resolveRoot: (root) => resolveNovelRoot(ctx.directory, root),
        client: ctx.client
    };
    return {
        tool: {
            novel_tp_init: createNovelTpInit(toolCtx),
            novel_tp_preflight: createNovelTpPreflight(toolCtx),
            novel_tp_hash: createNovelTpHash(),
            novel_tp_extract_section: createNovelTpExtractSection()
        }
    };
};
export default plugin;
