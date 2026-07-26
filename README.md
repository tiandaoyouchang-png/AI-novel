# Codex Novel

Codex-native, local-first long-form novel production.

The active implementation lives in [`plugins/codex-novel`](plugins/codex-novel). It combines:

- a Codex plugin manifest;
- the `write-long-form-novel` workflow Skill;
- a deterministic `novelctl` state and validation CLI;
- resumable Markdown/YAML novel workspaces.

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the product boundary and state model.
Read [`OPEN_SOURCE_ALIGNMENT.md`](OPEN_SOURCE_ALIGNMENT.md) for the verified open-source patterns adopted, changed, or deliberately deferred.
Read [`COMPETITIVE_OPTIMIZATION.md`](COMPETITIVE_OPTIMIZATION.md) for the ten-point competitor gap plan and the market evidence behind topic selection.

## Verified commercial-fiction fixture

[`examples/commercial-demo`](examples/commercial-demo) contains a three-chapter Chinese serial-fiction workspace for 《盐火照夜》. It is not a claim that mechanical checks can judge literary quality. It proves that one real opening arc can pass the complete production chain:

```text
market scan -> candidate slate -> topic decision -> positioning
-> foundation -> volume plan
-> contract -> bounded context -> draft quality -> review
-> final quality -> continuity transaction -> export
```

The fixture finishes with three continuity-committed chapters, structured facts, threads, resources, relationships, and timeline entries.
It also demonstrates independent platform/form selection plus dynamic character and story cards; dead characters cannot re-enter an onstage chapter unless the contract explicitly marks a non-present appearance.
Its source-bound commercial review passes the internal opening gate and defines a concrete target-reader test; this is readiness evidence, not a revenue claim.

## Development

```bash
cd plugins/codex-novel
npm install
npm run build
npm run typecheck
npm test
```

Validate the sample from the repository root:

```bash
node plugins/codex-novel/dist/novelctl.cjs validate examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs topics examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs cards examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs export examples/commercial-demo --format md
node plugins/codex-novel/dist/novelctl.cjs milestone examples/commercial-demo --type opening-three
```

The previous OpenCode proof of concept remains under `opencode-plugins/oh-my-novel-tp/` as migration reference and is no longer the active architecture.
