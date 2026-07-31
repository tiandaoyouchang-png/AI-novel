# Chapter Production

## Chapter contract

Write schema-v3 `chapters/NNNN/contract.yaml` with:

- `schemaVersion: 3`;
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
- `scopeLevel` and `antagonistLayer`, which cannot exceed the accepted foundation ceilings;
- every `capabilityUse`, bound to an allowed character capability and required support;
- an `investigationChain` for investigation scenes: anomaly, at least two alternative explanations, elimination tests, result, and limitation;
- `evidenceMoves` that distinguish discover, hypothesize, test, corroborate, challenge, and admit;
- scheduled `revealIds`, never earlier than their reveal window and only after corroborated prerequisites;
- `logicDebtResolutions` for every open debt due in this chapter, with a concrete planned resolution;
- an explicit coincidence list within the chapter budget;
- an independent goal and decision for each configured supporting character who appears;
- `outcomeCost` and a lasting `failureConsequence`;
- physical, institutional, vocabulary, and antagonist-countermove checks.

Use arrays for required events, protected facts, prohibited crossings, participants, locations, thread IDs, resource IDs, relationship IDs, world-rule IDs, and keywords.

Compile `context.md` with `novelctl context`. It records selected sources, fingerprints, deliberate omissions, relevant continuity, and the previous-chapter handoff.
The same command writes `context-manifest.yaml`. The planned transition must reject the package when its contract, planning, continuity, previous handoff, or rendered context fingerprint has changed.

## Draft

Write the complete chapter as one coherent `draft.md`. Scene beats are obligations and value-change checks, not separate prose fragments to concatenate.

Run `novelctl quality --source draft` before review and `--source final` before acceptance. The deterministic gate checks:

- requested length range;
- banned words and explicit no-go rules;
- prohibited modern terms and literal narrative shortcuts from the accepted story guardrails;
- duplicate paragraphs or suspicious repeated n-grams;
- required names and events;
- obvious POV or tense drift;
- unresolved placeholders.

## Review

Write schema-v3 `review.yaml`:

```yaml
schemaVersion: 3
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
  corePremiseAlignment:
    status: pass | fail
    evidence: how the signature mechanism, not generic escalation, causes the turn
  scopeDiscipline:
    status: pass | fail
    evidence: why the conflict stays inside the approved scale
  capabilityBoundaries:
    status: pass | fail
    evidence: every decisive ability was declared or supported
  evidenceChain:
    status: pass | fail
    evidence: anomaly, alternatives, verification, corroboration, and limitation
  periodAuthenticity:
    status: pass | fail
    evidence: physical method, vocabulary, and institutional path
  supportingCharacterAgency:
    status: pass | fail
    evidence: each present supporting character makes an independent decision
  consequenceIntegrity:
    status: pass | fail
    evidence: failure is not an automatic reward and costs persist
blockingIssues:
  - id: issue-001
    category: continuity | causality | character | information | scene | pacing | style | contract | scope | capability | evidence | period | consequence
    evidence: concise location or fact
    repair: bounded instruction
warnings: []
debtChecks:
  - debtId: stable-debt-id
    status: pass | fail
    evidence: exact prose-bound evidence that satisfies or misses the acceptance criteria
```

Use `repair` for local problems and `replan` only when the chapter responsibility is structurally impossible. Do not rewrite prose inside the review.

A passing review requires all ten explicit checks and every declared logic-debt check to pass. A non-passing review must fail at least one check or debt check and identify a blocking issue. After any repair, recheck the complete causal chain rather than only the original failure. After review round two, do not start a third automatic rewrite; stop for author direction.

The review fingerprint is a hard acceptance boundary. `final.md` must be byte-for-byte identical to the passing reviewed draft. If a repair changes prose, return to `drafted`, rerun quality and review, then promote that exact candidate.

## Acceptance and delta

Write accepted prose to `final.md`. Preserve `draft.md` as evidence.

Write `delta.yaml` only from accepted prose:

```yaml
schemaVersion: 1
chapter: 1
sourceFingerprint: "<sha256 of final.md>"
changes:
  - domain: facts | timeline | threads | resources | relationships | characters | storyCards | evidence
    operation: upsert | retire
    id: stable-id
    value: {}
    evidence: chapter location or concise evidence
```

Do not commit a delta extracted from a rejected draft. Run the `continuity_committed` transition only after delta validation succeeds.

A logic debt is not resolved by mentioning it in a plan or review. The chapter contract must declare the resolution, the exact reviewed prose must pass its debt check, and the continuity transaction must commit. The same transaction then records the resolved chapter and review evidence in `planning/logic-debts.yaml`.

Evidence entries distinguish anomaly, directional, association, adjudicative, and foreshadowing roles. Record observed/contested/corroborated/admitted/discredited status, supported and contradicted claim IDs, source IDs, verification method, and at least one limitation. Every non-hypothesis evidence action in the chapter contract must have a matching evidence upsert in the delta with a compatible resulting status.

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

## External web second review

After continuity is committed, an opted-in workspace may require a ChatGPT web review before `next`. Generate the request with `novelctl external-review`; it includes the exact accepted prose and an editorial rubric for premise discipline, causality, evidence, capability boundaries, supporting-character agency, institutional logic, scene depth, pacing, and language.

Record the complete answer with `novelctl external-review-record`. A received response satisfies only the external-review receipt gate. Triage every suggestion against the accepted plan and reveal policy:

- `accepted`: a bounded current-chapter repair or genuinely new future obligation;
- `already-covered`: an existing contract, plan beat, reveal, or logic debt already handles it;
- `rejected`: it contradicts authority, reveals too early, enlarges scope, or is unsupported.

Only an accepted future obligation may be added manually to `planning/logic-debts.yaml`. If accepted feedback requires changing the current committed prose, use `novelctl revise`; never patch `final.md` in place.
