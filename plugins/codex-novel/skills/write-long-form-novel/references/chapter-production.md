# Chapter Production

## Chapter contract

Write schema-v2 `chapters/NNNN/contract.yaml` with:

- `schemaVersion: 2`;
- chapter number and title;
- immediate goal and resistance;
- required events and protected facts;
- prohibited crossings;
- participating characters;
- relevant world-rule IDs;
- promised reader reward;
- key turn and net change;
- ending pull;
- one emotional target for the chapter;
- one or more scene beats, each with a stable ID, scene type, location, participants, goal, conflict, value shift, and emotional change;
- target length and acceptable range.

Use arrays for required events, protected facts, prohibited crossings, participants, locations, thread IDs, resource IDs, relationship IDs, world-rule IDs, and keywords.

Compile `context.md` with `novelctl context`. It records selected sources, fingerprints, deliberate omissions, relevant continuity, and the previous-chapter handoff.
The same command writes `context-manifest.yaml`. The planned transition must reject the package when its contract, planning, continuity, previous handoff, or rendered context fingerprint has changed.

## Draft

Write the complete chapter as one coherent `draft.md`. Scene beats are obligations and value-change checks, not separate prose fragments to concatenate.

Run `novelctl quality --source draft` before review and `--source final` before acceptance. The deterministic gate checks:

- requested length range;
- banned words and explicit no-go rules;
- duplicate paragraphs or suspicious repeated n-grams;
- required names and events;
- obvious POV or tense drift;
- unresolved placeholders.

## Review

Write schema-v2 `review.yaml`:

```yaml
schemaVersion: 2
reviewRound: 1 # or 2
sourceFingerprint: "<sha256 of the exact draft being reviewed>"
verdict: pass | repair | replan
checks:
  characterVoice:
    status: pass | fail
    evidence: concise source-bound evidence
  informationBoundaries:
    status: pass | fail
    evidence: concise source-bound evidence
  sceneValueChanges:
    status: pass | fail
    evidence: concise source-bound evidence
blockingIssues:
  - id: issue-001
    category: continuity | causality | character | information | scene | pacing | style | contract
    evidence: concise location or fact
    repair: bounded instruction
warnings: []
```

Use `repair` for local problems and `replan` only when the chapter responsibility is structurally impossible. Do not rewrite prose inside the review.

A passing review requires all three explicit checks to pass. A non-passing review must fail at least one check and identify a blocking issue. After review round two, do not start a third automatic rewrite; stop for author direction.

The review fingerprint is a hard acceptance boundary. `final.md` must be byte-for-byte identical to the passing reviewed draft. If a repair changes prose, return to `drafted`, rerun quality and review, then promote that exact candidate.

## Acceptance and delta

Write accepted prose to `final.md`. Preserve `draft.md` as evidence.

Write `delta.yaml` only from accepted prose:

```yaml
schemaVersion: 1
chapter: 1
sourceFingerprint: "<sha256 of final.md>"
changes:
  - domain: facts | timeline | threads | resources | relationships | characters | storyCards
    operation: upsert | retire
    id: stable-id
    value: {}
    evidence: chapter location or concise evidence
```

Do not commit a delta extracted from a rejected draft. Run the `continuity_committed` transition only after delta validation succeeds.

Write `handoff.yaml` from the same accepted `final.md`:

```yaml
schemaVersion: 1
chapter: 1
sourceFingerprint: "<sha256 of final.md>"
summary: concise causal summary
resolved: []
unresolved: []
characterCarry:
  - characterId: char-protagonist
    state: exact carried state
emotionalCarry: emotional pressure entering the next unit
nextConstraints: []
```

The next chapter reads this structured handoff instead of copying several prior chapters or trusting a free-running append-only summary.
