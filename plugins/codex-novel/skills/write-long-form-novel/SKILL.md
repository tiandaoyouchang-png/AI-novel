---
name: write-long-form-novel
description: Research market-backed topics, compare original story candidates, plan, write, continue, review, repair, recover, and export long serials or completed short fiction in a Codex-native local workspace. Use when Codex needs to find or validate a commercially positioned topic for Fanqie or Zhihu Salt, turn an idea into a resumable fiction project, maintain dynamic plot and character continuity, prevent accidental character resurrection, continue an existing manuscript, create chapter or section plans and prose, audit a draft, apply bounded repairs, or decide the next safe production step from novel-state.yaml.
---

# Write Long-Form Novel

## Operating boundary

Use Codex as the only creative reasoning, writing, and review engine. Use the bundled `novelctl` only for deterministic initialization, validation, state transitions, snapshots, and export.

Do not add model-provider SDKs, custom agent runtimes, queues, or database authorities. Treat Markdown and YAML as authoritative. Treat generated indexes and reports as disposable views.

Keep chapter production serial. Use read-only subagents only when the user explicitly requests parallel review or the task requires independent evidence gathering. Never let two agents write the same chapter or continuity files concurrently.

## Start from state

When a workspace exists:

1. Run `node <plugin-root>/dist/novelctl.cjs status <workspace>`.
2. Read `novel-state.yaml`.
3. Run `node <plugin-root>/dist/novelctl.cjs cards <workspace>` when the request involves character state, death, secrets, subplots, or current plot position.
4. Run `node <plugin-root>/dist/novelctl.cjs arcs <workspace>` for a long serial before planning a volume or when a plot line may have gone idle.
5. Run `node <plugin-root>/dist/novelctl.cjs guardrails <workspace>` before planning or repairing prose. Run `reveals <workspace>` whenever a clue, culprit, motive, secret, identity, or reversal may be exposed.
6. Run `node <plugin-root>/dist/novelctl.cjs search <workspace> --query "<terms>"` when an existing derived index can narrow older handoffs or continuity sources. Treat results only as candidates and read their authoritative files.
7. Read only the accepted artifacts needed for the current step.
8. Preserve user-edited prose and accepted decisions unless replacement is explicit.
9. Recommend one recoverable next action. Use `guide <workspace>` when the author needs a plain-language prompt.

When no workspace exists, remain in preview conversation until the user asks to create durable files. Then run:

```bash
node <plugin-root>/dist/novelctl.cjs init novels/<slug> --title "<title>"
```

Resolve `<plugin-root>` from this Skill's containing plugin directory. Use the bundled `dist/novelctl.cjs`; do not assume a globally installed command.

Read [artifact-contracts.md](references/artifact-contracts.md) before creating or changing authoritative artifacts.

## Route the request

- Market demand, topic research, idea comparison, or topic validation: read [topic-selection.md](references/topic-selection.md) and [artifact-contracts.md](references/artifact-contracts.md).
- Positioning, story engine, world, cast, or volume planning: read [artifact-contracts.md](references/artifact-contracts.md).
- Commercial positioning, opening design, reader payoff, hooks, pacing, or volume escalation: read [commercial-fiction.md](references/commercial-fiction.md).
- Drafting, continuing, reviewing, or repairing a chapter: read [chapter-production.md](references/chapter-production.md) and [commercial-fiction.md](references/commercial-fiction.md).
- Facts, timeline, resources, relationships, context selection, checkpoints, or recovery: read [continuity.md](references/continuity.md).
- Status or recovery: run `node <plugin-root>/dist/novelctl.cjs validate <workspace>`, then use the reported state.

`validate` proves structural and fingerprint consistency; it does not mean prose production is unlocked. Read `readiness.productionReady` in JSON output or the reported phase. Only `phase: production` permits chapter or section production.

## Select the topic before approving the brief

For a new commercial project, do not silently turn the first idea into the book:

1. Research current market demand with dated, attributable evidence. Prefer official industry, platform, and reader-research sources; use search trends and competitor products only as supporting evidence.
2. Write `discovery/market-scan.yaml`, then compare three to eight candidates in `discovery/topic-candidates.yaml`.
3. Record the selected candidate, rejected alternatives, trade-off, originality protections, and reader-test hypothesis in `discovery/topic-decision.yaml`.
4. For the selected topic, create two or three substantially different anonymous opening samples in `discovery/hook-experiments.yaml`. Define the target emotion, reader question, risks, blinded questions, minimum sample, and observable success signals. Record why every unselected hook was rejected.
5. Run `node <plugin-root>/dist/novelctl.cjs topics <workspace>` and `hooks <workspace>`.
6. Resolve every blocker before requesting brief approval. The selected topic's platform, form, target reader, and channel must match `planning/market-position.yaml` exactly.

Treat broad genre popularity as a search direction, not proof that one premise has demand. Do not copy a competitor's plot, character system, organization, setting expression, or distinctive language. Keep raw market research out of chapter prose context; include only the accepted topic decision and its protected originality boundaries.

Do not present an AI review as a real reader blind test. When no target readers have participated, record the hook choice as an author decision or internal prediction.

Read [topic-selection.md](references/topic-selection.md) before creating or changing discovery artifacts.

## Advance through approval gates

Use this book-level chain:

`preview + topic selection -> brief_approved -> foundation_approved -> production -> completed`

Require explicit approval for the selected topic, novel brief, foundation, and current volume plan unless the user has delegated that decision. The brief gate also requires a current passing topic-selection report. Transition only after the corresponding accepted artifacts exist:

```bash
node <plugin-root>/dist/novelctl.cjs phase <workspace> --to brief_approved
node <plugin-root>/dist/novelctl.cjs phase <workspace> --to foundation_approved
node <plugin-root>/dist/novelctl.cjs phase <workspace> --to production
```

Do not treat chat-only previews as accepted files. When an accepted upstream decision changes, stop and report downstream artifacts that must become stale; never silently rewrite them.

Before foundation approval, create one structured `planning/characters/<character-id>.yaml` profile for every recurring character and complete `planning/style-profile.yaml`. Character profiles hold stable motivation, moral boundaries, decision patterns, voice rules, and OOC risks; `continuity/characters.yaml` holds only changing state. `planning/style-examples.yaml` may contain only user-owned, explicitly authorized, or public-domain excerpts. Never configure imitation of a named author's distinctive expression.

Also complete `planning/story-guardrails.yaml` and `planning/reveal-policy.yaml`. Lock the one-sentence premise, signature story mechanism, maximum scope, antagonist-layer ceiling, per-character allowed/prohibited abilities, coincidence budget, period/institution/physics constraints, supporting-character domains, permanent costs, prohibited shortcuts, and chapter-number reveal windows. For long serials, schedule at least one material reveal before foundation approval. Do not approve a foundation that says only “stay consistent”; use concrete, testable boundaries.

Before moving a `long-serial` project into production, complete `planning/arc-grid.yaml`. Give each main plot, subplot, mystery, relationship line, and recurring character arc a stable ID, volume beats, promises, dependencies, payoff target, last advanced chapter, and maximum idle chapters. The arc grid plans the future; `continuity/story-cards.yaml` remains authoritative for what has actually happened. Never overwrite committed continuity with a plan. A `short-complete` project may keep the grid empty or use a small scene-payoff map.

If an accepted brief, foundation, or volume plan was edited, run:

```bash
node <plugin-root>/dist/novelctl.cjs invalidate <workspace> --artifact <brief|foundation|current-volume-plan> --reason "<reason>"
```

Re-approve the affected chain before producing more prose.

Before a substantial author-directed prose or planning revision, create a named restore point:

```bash
node <plugin-root>/dist/novelctl.cjs revision create <workspace> --name "<purpose>"
```

Use `revision list` to inspect history. Use `revision restore --id <id>` only when the author asks to restore; it creates a safety revision first and invalidates the disposable retrieval index. Do not manually edit state to simulate a rollback.

## Produce one chapter safely

Use this chain:

`not_started -> planned -> drafted -> reviewed -> accepted -> continuity_committed`

For every chapter:

1. Create and validate `contract.yaml`; keep its length range inside the accepted `planning/market-position.yaml` policy.
   New work uses schema-v3. Include an `emotionalTarget`, structured scene beats, scope level, every capability use, investigation alternatives and tests, evidence moves, scheduled reveal IDs, coincidences, supporting-character decisions, lasting outcome/failure costs, and physical/institutional/vocabulary/antagonist-countermove checks. Investigation scenes require at least two plausible explanations and a stated proof limitation.
2. Run `node <plugin-root>/dist/novelctl.cjs context <workspace>` to compile bounded `context.md` and its machine-checkable source manifest. It selects only participating character profiles, relevant dynamic cards, matching authorized style examples, the prior structured handoff, and current indexed candidates.
3. Write one coherent `draft.md`.
4. Run `node <plugin-root>/dist/novelctl.cjs quality <workspace> --source draft`.
5. Write schema-v3 `review.yaml` bound to the exact draft SHA-256 fingerprint. Record review round 1 or 2 and explicit text-bound evidence for character voice, information boundaries, scene value changes, premise alignment, scope discipline, capability boundaries, evidence chain, period authenticity, supporting-character agency, and consequence integrity.
6. Apply targeted repair before considering a full rewrite. Then rerun the entire causal chain: physical possibility, institutional permission, character motive, simpler antagonist countermeasure, evidence status, reveal timing, and lasting consequence. A repair is not complete merely because the original issue disappeared.
7. Copy the passing reviewed draft exactly to candidate `final.md`, then run the final quality check. Any prose change requires another draft and review round; never patch `final.md` after review.
8. Extract `delta.yaml` from the final prose and include its SHA-256 fingerprint.
9. Write `handoff.yaml` from that exact accepted prose. Record resolved and unresolved items, character carry, emotional carry, and next-chapter constraints with the same fingerprint.
10. Commit continuity only after final prose is accepted.
11. Start the next chapter only after continuity is committed.

Use the bundled CLI's `advance <workspace> --to <status>` at each gate and `next <workspace>` after the commit. A failed transition is a real blocker; fix the missing artifact instead of editing `novel-state.yaml` by hand.

The CLI enforces a maximum of two review rounds. If blocking issues remain after round two, stop for author direction. Do not use an AI-detector score as the sole acceptance criterion.

For `long-serial`, after chapters 1-3 are continuity-committed, run:

```bash
node <plugin-root>/dist/novelctl.cjs milestone <workspace> --type opening-three
```

Read the generated metrics and commercial review template. Judge audience fit, hook, protagonist agency, payoff density, escalation, emotional investment, prose distinctiveness, and continuation intent with chapter-level evidence. Save the completed review as `reports/opening-three/review.yaml`. Treat the mechanical report as workflow evidence, not a market verdict; a passing internal review still requires a stated reader test.

For `short-complete`, use the same per-section production chain, then review the whole accepted story for opening pull, compression, causality, emotional escalation, reversal, ending payoff, and platform fit before moving to `completed`. Do not pad a short story to satisfy a long-serial milestone.

Run the form-specific milestone:

```bash
node <plugin-root>/dist/novelctl.cjs milestone <workspace> --type short-complete
```

For a long-serial volume boundary, run:

```bash
node <plugin-root>/dist/novelctl.cjs milestone <workspace> --type volume
```

The volume milestone also writes a named continuity checkpoint. The CLI automatically writes interval checkpoints after the configured number of committed chapters.

For a long serial, inspect release inventory with `cadence <workspace>`. Only continuity-committed, unpublished chapters count as ready inventory. Update `--published-through` from confirmed publication records; never infer publication from draft completion. Short completed fiction does not use the serial buffer calculation.

## Preserve bounded context

Prefer the smallest context package that preserves causality:

- current chapter contract;
- previous chapter handoff;
- current volume window;
- participating character profiles;
- active facts, resources, relationships, and unresolved threads;
- active graded evidence, with protected meanings redacted until their earliest chapter;
- relevant world-rule IDs;
- explicit omissions and uncertainties.

Do not load the entire manuscript merely because it exists. Never promote planned events or reviewer suggestions into continuity facts.

If validation reports an incomplete continuity transaction, run `node <plugin-root>/dist/novelctl.cjs recover <workspace>` before any other production action.

For book-scale search, rebuild the disposable SQLite full-text index after accepted continuity changes:

```bash
node <plugin-root>/dist/novelctl.cjs index <workspace>
```

The index can identify older handoffs, profiles, continuity entries, and authorized examples. A stale source fingerprint removes that result; the index never writes authoritative continuity.

## Import, learn, and export

To bring an existing Markdown or text manuscript into a new workspace, run:

```bash
node <plugin-root>/dist/novelctl.cjs import <workspace> --source <manuscript.md|txt> --title "<title>"
```

Imported sections stay under `imports/` with status `awaiting-continuity-extraction`. They are not accepted canon. Extract characters, aliases, life states, timeline, relationships, resources, and unresolved clues; mark uncertain facts for author confirmation before entering the normal approval chain.

Publication metrics are local and opt-in. Import an author-provided CSV with `metrics import`, then run `learn`. The generated report is a review base, not an automatic market verdict. Never upload metrics or silently modify the accepted brief from observed data.

Run `node <plugin-root>/dist/novelctl.cjs export <workspace> --format md|txt|docx|epub`. Export only continuity-committed chapters in numeric order. Never include plans, reviews, imported quarantine files, or rejected drafts.

## Finish clearly

Report:

- artifact created or changed;
- assumptions and protected decisions;
- state transition completed;
- unresolved quality or continuity risks;
- one recommended next action.
