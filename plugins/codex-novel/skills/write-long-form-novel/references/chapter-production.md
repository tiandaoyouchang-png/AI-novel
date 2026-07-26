# Chapter Production

## Chapter contract

Write `chapters/NNNN/contract.yaml` with:

- `schemaVersion: 1`;
- chapter number and title;
- immediate goal and resistance;
- required events and protected facts;
- prohibited crossings;
- participating characters;
- relevant world-rule IDs;
- promised reader reward;
- key turn and net change;
- ending pull;
- target length and acceptable range.

Use arrays for required events, protected facts, prohibited crossings, participants, locations, thread IDs, resource IDs, relationship IDs, world-rule IDs, and keywords.

Compile `context.md` with `novelctl context`. It records selected sources, fingerprints, deliberate omissions, relevant continuity, and the previous-chapter handoff.
The same command writes `context-manifest.yaml`. The planned transition must reject the package when its contract, planning, continuity, previous handoff, or rendered context fingerprint has changed.

## Draft

Write the complete chapter as one coherent `draft.md`. Use scene beats for planning, not as separate prose fragments to concatenate.

Run `novelctl quality --source draft` before review and `--source final` before acceptance. The deterministic gate checks:

- requested length range;
- banned words and explicit no-go rules;
- duplicate paragraphs or suspicious repeated n-grams;
- required names and events;
- obvious POV or tense drift;
- unresolved placeholders.

## Review

Write `review.yaml`:

```yaml
schemaVersion: 1
sourceFingerprint: "<sha256 of the exact draft being reviewed>"
verdict: pass | repair | replan
blockingIssues:
  - id: issue-001
    category: continuity | causality | character | pacing | style | contract
    evidence: concise location or fact
    repair: bounded instruction
warnings: []
```

Use `repair` for local problems and `replan` only when the chapter responsibility is structurally impossible. Do not rewrite prose inside the review.

The review fingerprint is a hard acceptance boundary. `final.md` must be byte-for-byte identical to the passing reviewed draft. If a repair changes prose, return to `drafted`, rerun quality and review, then promote that exact candidate.

## Acceptance and delta

Write accepted prose to `final.md`. Preserve `draft.md` as evidence.

Write `delta.yaml` only from accepted prose:

```yaml
schemaVersion: 1
chapter: 1
sourceFingerprint: "<sha256 of final.md>"
changes:
  - domain: facts | timeline | threads | resources | relationships
    operation: upsert | retire
    id: stable-id
    value: {}
    evidence: chapter location or concise evidence
```

Do not commit a delta extracted from a rejected draft. Run the `continuity_committed` transition only after delta validation succeeds.
