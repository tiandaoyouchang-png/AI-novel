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
       -> planning Markdown/YAML
       -> stable character and style profiles
       -> chapter artifacts
       -> continuity YAML
       -> runtime snapshots/events
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

Continuity commit is a journaled multi-file transaction. It validates the accepted prose fingerprint, snapshots every affected YAML store and state, writes a pending marker, applies deterministic changes, commits state last, and clears the marker. The seven stores cover facts, timeline, threads, resources, relationships, dynamic character cards, and dynamic story cards. `novelctl recover` restores the before snapshot after an interrupted commit.

## Implemented production safeguards

- accepted-artifact SHA-256 fingerprints and explicit stale propagation;
- dated multi-source market scans, scored candidate slates, explicit topic trade-offs, and originality gates;
- independent platform (`fanqie`/`zhihu-salt`) and form (`long-serial`/`short-complete`) selection;
- a topic-selection report whose source fingerprints are bound to brief approval;
- structured market positioning bound to the brief and enforced by chapter length contracts;
- strict chapter contracts, reviews, quality reports, continuity stores, and deltas;
- schema-v2 chapter contracts with emotional targets and scene-level goal/conflict/value-change plans;
- stable per-character motivation/voice profiles selected only for chapter participants;
- abstract style profiles plus user-owned, authorized, or public-domain scene examples;
- bounded context compilation using contract IDs, scene types, active continuity, structured handoffs, and verified retrieval candidates;
- dynamic character/story cards, dead-character onstage blocking, and redacted hidden-knowledge IDs;
- structured review checks for character voice, information boundaries, and scene value changes with a hard two-round repair budget;
- fingerprint-bound structured chapter handoffs instead of rolling free-text summaries;
- rebuildable SQLite full-text retrieval whose stale candidates are discarded before source re-read;
- interval/manual checkpoints and separate opening, short-complete, and volume milestones;
- deterministic length, paragraph, banned-word, duplicate, and repeated-phrase checks;
- source-bound opening-three metrics and structured commercial review;
- serial chapter locks and continuity-committed-only export;
- full committed-chapter integrity audit across final prose, review, quality report, and continuity delta;
- transaction snapshots, pending markers, recovery, and append-only diagnostic events;
- a three-chapter commercial-fiction regression fixture.

## Deferred features

- import of existing manuscripts;
- schema migration for version-1 workspaces;
- EPUB/DOCX and platform-specific publishing packages;
- opening-hook blind-test records before foundation approval;
- cross-chapter subplot and character-arc beat grids beyond current chapter scene beats and dynamic story cards;
- chapter-number reveal policies for facts beyond the current hidden-ID redaction;
- author-facing named revisions and safe restore;
- serial cadence and backlog-health reporting;
- anonymized post-publication learning records;
- optional read-only dashboard and author-facing scorecards.

These remain outside the verified V1 core. They should be added only with fixtures and migration-safe tests.
