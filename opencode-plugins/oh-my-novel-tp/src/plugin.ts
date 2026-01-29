import type { Plugin } from "@opencode-ai/plugin";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { resolveNovelRoot } from "./lib/paths.js";
import { createNovelTpInit } from "./tools/novelTpInit.js";
import { createNovelTpPreflight } from "./tools/novelTpPreflight.js";
import { createNovelTpHash } from "./tools/novelTpHash.js";
import { createNovelTpExtractSection } from "./tools/novelTpExtractSection.js";

export type ToolCtx = {
  projectDir: string;
  resolveRoot: (root?: string) => string;
  client?: OpencodeClient;
};

const plugin: Plugin = async (ctx) => {
  const toolCtx: ToolCtx = {
    projectDir: ctx.directory,
    resolveRoot: (root?: string) => resolveNovelRoot(ctx.directory, root),
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
