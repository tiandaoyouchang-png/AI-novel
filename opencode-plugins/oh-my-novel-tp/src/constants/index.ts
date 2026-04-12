/**
 * Template Pack version constant
 */
export const TEMPLATE_PACK_VERSION = "1.0" as const;

/**
 * Default model configurations
 */
export const DEFAULT_MODELS = {
  councilGpt: "openai/gpt-5.2",
  councilClaude: "google/antigravity-claude-sonnet-4-5-thinking",
  councilGemini: "google/antigravity-gemini-3-pro",
  writer: "google/antigravity-claude-sonnet-4-5",
  reviewer: "openai/gpt-5.2",
  auditorGpt: "openai/gpt-5.2",
  auditorClaude: "google/antigravity-claude-sonnet-4-5-thinking",
  auditorGemini: "google/antigravity-gemini-3-pro",
  humanizer: "google/antigravity-claude-sonnet-4-5",
} as const;

/**
 * Maximum rounds for various operations
 */
export const MAX_ROUNDS = {
  plan: 10,
  chapterWrite: 10,
  chapterHumanize: 10,
  default: 5,
} as const;

/**
 * Character limits for context truncation
 */
export const CONTEXT_LIMITS = {
  brief: 8000,
  constraints: 4000,
  styleProfile: 4000,
  world: 12000,
  characters: 12000,
  chronology: 6000,
  outline: 6000,
} as const;
