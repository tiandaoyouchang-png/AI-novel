# Oh My Novel (Template Pack)

Template Pack-driven novel workflow.

## Install

This plugin is already registered in `C:\\Users\\包公\\.config\\opencode\\opencode.json` on this machine.

## Tools

- `novel_tp_init root?`
  - Creates required structure under `novel/`:
    - `novel/meta/novel_id.txt`
    - `novel/meta/template_pack_version.txt`
    - `novel/templates/*.md`
    - `novel/bible/*.md`
    - `novel/chapters/`

- `novel_tp_preflight root?`
  - Validates required fields in `novel/bible/constraints.md` and `novel/bible/style_profile.md`.
  - Returns JSON with `missing` + `questions` (no file writes).

- `novel_tp_plan root? maxRounds?`
NOTE: This plugin intentionally does NOT implement multi-agent orchestration (council/writer/reviewer/auditor/humanizer) inside a single tool.

Use project-scoped OpenCode agents/commands under `.opencode/` for orchestration.

## Build Notes (Windows)

This repo had npm script-shell issues under MSYS. The plugin includes `.npmrc` forcing:

`script-shell=C:\\Windows\\System32\\cmd.exe`
