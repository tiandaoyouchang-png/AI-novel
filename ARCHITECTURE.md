# Codex Novel Architecture

## Product boundary

Codex Novel is a local-first long-form novel production system hosted by Codex.

- Codex performs creative understanding, planning, writing, review, and repair.
- The `write-long-form-novel` Skill defines workflow and acceptance contracts.
- `novelctl` performs deterministic workspace initialization, validation, state transitions, snapshots, and export.
- Markdown and YAML are the source of truth.
- Derived indexes, reports, and caches are disposable.

The system does not embed a second agent runtime or call model-provider SDKs.

## Components

```text
Codex
  -> Plugin manifest
  -> write-long-form-novel Skill
  -> novelctl deterministic CLI
  -> novels/<slug> workspace
       -> market evidence and topic decision
       -> opening-hook experiments
       -> planning Markdown/YAML
       -> cross-volume arc grid
       -> stable character and style profiles
       -> chapter artifacts
       -> continuity YAML
       -> runtime snapshots/events
       -> named author revisions
       -> publication cadence and local metrics
       -> quarantined manuscript imports
       -> derived indexes
       -> exports
```

## State machines

Book phases:

```text
preview + topic selection -> brief_approved -> foundation_approved -> production -> completed
```

Chapter states:

```text
not_started -> planned -> drafted -> reviewed -> accepted
                                             ^         |
                                             |         v
                                           drafted  continuity_committed
```

The `reviewed -> drafted` edge supports bounded repair and is limited to two review rounds. The next chapter stays locked until continuity and its fingerprint-bound handoff are committed.

## Transaction boundary

Every state transition:

1. reads and validates current state;
2. verifies required artifacts;
3. verifies accepted-artifact fingerprints and current quality reports;
4. constructs and validates the next state;
5. atomically replaces `novel-state.yaml`;
6. records before/after snapshots and an append-only event.

Failed validation must not modify authoritative state.

Continuity commit is a journaled multi-file transaction. It validates the accepted prose fingerprint, snapshots every affected YAML store, reveal policy, and state, writes a pending marker, applies deterministic changes, commits state last, and clears the marker. The eight stores cover facts, timeline, threads, resources, relationships, dynamic character cards, dynamic story cards, and graded evidence. Reveal statuses used by accepted prose are updated in the same transaction. `novelctl recover` restores the before snapshot after an interrupted commit.

## Implemented production safeguards

- accepted-artifact SHA-256 fingerprints and explicit stale propagation;
- dated multi-source market scans, scored candidate slates, explicit topic trade-offs, and originality gates;
- two-to-three-option opening-hook experiments with blinded signals and rejected-alternative records;
- independent platform (`fanqie`/`zhihu-salt`) and form (`long-serial`/`short-complete`) selection;
- a topic-selection report whose source fingerprints are bound to brief approval;
- structured market positioning bound to the brief and enforced by chapter length contracts;
- strict chapter contracts, reviews, quality reports, continuity stores, and deltas;
- schema-v3 chapter contracts with scope, capability, investigation, evidence, reveal, coincidence, agency, consequence, period, and scene-level obligations;
- foundation-level premise, scale, ability, period, consequence, and prohibited-shortcut guardrails;
- graded evidence records plus earliest/target/latest reveal windows and prerequisite checks;
- cross-volume main-plot, subplot, mystery, relationship, and character-arc grids with idle-line detection;
- stable per-character motivation/voice profiles selected only for chapter participants;
- abstract style profiles plus user-owned, authorized, or public-domain scene examples;
- bounded context compilation using contract IDs, scene types, active continuity, structured handoffs, and verified retrieval candidates;
- dynamic character/story cards, dead-character onstage blocking, and redacted hidden-knowledge IDs;
- ten structured review checks covering voice, information, scene change, premise, scope, abilities, evidence, period, supporting-character agency, and consequences, with a hard two-round repair budget;
- fingerprint-bound structured chapter handoffs instead of rolling free-text summaries;
- rebuildable SQLite full-text retrieval whose stale candidates are discarded before source re-read;
- interval/manual checkpoints and separate opening, short-complete, and volume milestones;
- deterministic length, paragraph, banned-word, duplicate, and repeated-phrase checks;
- source-bound opening-three metrics and structured commercial review;
- serial chapter locks and continuity-committed-only export;
- full committed-chapter integrity audit across final prose, review, quality report, and continuity delta;
- transaction snapshots, pending markers, recovery, and append-only diagnostic events;
- named immutable revisions with diff summaries, pre-restore safety snapshots, and derived-index invalidation;
- long-serial publication-frontier, inventory, buffer-health, and blocked-day records;
- local opt-in publication metric import and hypothesis-review reports;
- quarantined Markdown/TXT manuscript import that never promotes raw prose directly to canon;
- DOCX and EPUB export generated only from continuity-committed prose;
- Chinese diagnostics, environment doctor, and state-aware next-step guidance;
- a three-chapter commercial-fiction regression fixture.

## Deferred features

- schema migration for version-1 workspaces;
- platform-specific publishing packages;
- automatic platform publication and account integrations;
- centralized anonymous telemetry; current metrics remain local and author-supplied;
- semantic/vector retrieval beyond the current fingerprint-checked SQLite index;
- optional read-only dashboard and author-facing scorecards.

These remain outside the verified V1 core. They should be added only with fixtures and migration-safe tests.
