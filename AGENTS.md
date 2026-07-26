# Codex Novel Development

- New Codex-native work belongs under `plugins/codex-novel/`.
- Treat `opencode-plugins/oh-my-novel-tp/` as migration reference; do not extend it.
- Codex is the creative engine. Do not add model-provider SDKs or a custom agent runtime.
- Markdown/YAML are authoritative; indexes and reports must be rebuildable.
- Chapter production is serial. Commit continuity only after accepted prose.
- State changes must go through `novelctl` and remain atomic on failure.
- Keep changes small and cover every state transition or parser change with tests.
- Validate with `npm run typecheck`, `npm test`, the Skill validator, and the plugin validator.
