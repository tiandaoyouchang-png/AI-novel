/**
 * Model reference type for parsing provider/model strings
 */
export interface ModelRef {
  providerID: string;
  modelID: string;
}

/**
 * Options for prompting the LLM
 */
export interface PromptOptions {
  client: import("@opencode-ai/sdk").OpencodeClient;
  sessionID: string;
  directory: string;
  model: string;
  system: string;
  text: string;
}

/**
 * Tool context for novel template pack operations
 */
export interface ToolCtx {
  projectDir: string;
  resolveRoot: (root?: string) => string;
  client?: import("@opencode-ai/sdk").OpencodeClient;
}
