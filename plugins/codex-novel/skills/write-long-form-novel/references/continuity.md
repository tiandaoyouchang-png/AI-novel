# Continuity and Recovery

## Authoritative modules

- `continuity/facts.yaml`: durable facts with stable IDs and source chapters.
- `continuity/timeline.yaml`: ordered events and temporal constraints.
- `continuity/threads.yaml`: promises, mysteries, and foreshadowing status.
- `continuity/resources.yaml`: ownership, quantities, abilities, costs, and cooldowns.
- `continuity/relationships.yaml`: relationship state and evidence.
- `continuity/characters.yaml`: dynamic character cards with life status, current location, goal, condition, and visible/hidden knowledge IDs.
- `continuity/story-cards.yaml`: dynamic main-plot, subplot, and character-arc cards with current beat, next pressure, linked characters/threads, and payoff debt.

Each file uses `schemaVersion: 1` and an `entries` array. Every entry has a stable ID, active/retired status, structured value, source chapter, evidence, and update time. Do not store speculative next events as truth.

After the foundation is accepted and before production, seed only confirmed starting state with `sourceChapter: 0`: living/dead/missing status, starting location, current goal, known pre-story injuries, and active plot premises. Cite the accepted character roster or story bible. Empty cards are expected before this seed step or the first continuity commit.

Update character and story cards in the same chapter delta as facts and relationships. A dead character cannot return to another life state through a normal delta. If a dead character appears only in a memory, dream, portrait, recording, or flashback, list them in the chapter contract's `nonPresentParticipants`; otherwise context compilation blocks the chapter.

Example:

```yaml
participants: [现任调查者, 已故证人]
nonPresentParticipants: [已故证人]
```

Keep `knowledgeIds` and `hiddenKnowledgeIds` disjoint. Both must reference an active fact or thread. Chapter prose context redacts hidden knowledge IDs instead of leaking them into the draft.

Inspect the current cards without opening every YAML store:

```bash
node <plugin-root>/dist/novelctl.cjs cards <workspace>
```

Use `--json` for a machine-readable view. The command validates card references before displaying them.

## Context selection

Select context by current participants, locations, active threads, resources, and chapter obligations. Prefer exact YAML facts and recent handoffs over summaries. Use lexical or SQLite retrieval only to identify candidates, then read their authoritative sources.

An index may be deleted and rebuilt. It must never update continuity.

## Commit rule

Apply continuity deltas only after:

1. final prose is accepted;
2. every changed item cites the accepted chapter;
3. identifiers and enum values validate;
4. contradictions are resolved or explicitly blocked;
5. a pre-change snapshot exists.

Commit all related continuity modules as one journaled transaction. The CLI saves before/after snapshots, validates the final-prose fingerprint, applies all seven stores, and advances state last. On an interruption, keep the next chapter blocked and run `novelctl recover` to restore the before snapshot.

## Checkpoints

Create a checkpoint every ten chapters and at volume boundaries. Include the last committed chapter, active threads, character/resource state, known quality debt, and index fingerprint.

On recovery, trust `novel-state.yaml`, accepted prose, continuity YAML, and the latest valid checkpoint. Treat run logs as diagnostics, not authority.
