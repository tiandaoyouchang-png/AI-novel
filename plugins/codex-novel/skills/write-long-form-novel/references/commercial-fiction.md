# Commercial Long-Form Fiction

## Market-backed selection

Begin with a dated market scan and a slate of at least three original candidates. Look for the intersection of:

- a demonstrated reader need;
- a channel the project can actually serve;
- a repeatable engine that can sustain serialization;
- a differentiator grounded in culture, occupation, relationship, mechanism, or point of view;
- author capability and research access.

A popular category is not yet a viable topic. Reject candidates that depend on a genre label without a repeatable payoff, score below the minimum differentiation or evidence gate, or imitate a competitor's protected expression. Record saturation risk and the trade-off accepted when one candidate is selected.

## Platform and form profiles

Treat platform and form as separate decisions.

For `long-serial`, optimize for a sustainable action loop, recurring chapter reward, escalation capacity, backlog health, and a next-chapter question. Use the opening-three milestone after the first three committed chapters.

For `short-complete`, optimize for an immediate lead, compressed causality, a small cast, rising emotional pressure, a decisive reversal, and a complete ending payoff. Chapters may function as sections, but each still uses the same contract, review, handoff, and continuity transaction. Run `milestone --type short-complete` before `completed`; do not force the opening-three milestone onto a short work.

For `fanqie`, write toward the chosen long or short channel and define a recommendation/reader-retention test. For `zhihu-salt`, write toward the chosen long or short submission route and define a lead-to-finish or paid-continuation test. Verify current platform rules before publication; the workflow does not treat a product profile as a permanent rule.

## Commercial promise

Define commercial quality as a repeatable reader experience, not as trend imitation:

- a specific target reader and emotional reward;
- a protagonist with an active desire and a repeatable action loop;
- escalating opposition that can sustain the planned length;
- visible progress, cost, reversal, or revelation;
- chapter endings that create a concrete next question;
- recognizable voice without copying another author's expression.

Do not expand worldbuilding until the reader promise and story engine are clear.
Express style through `planning/style-profile.yaml` and licensed scene examples. Never turn a named author's distinctive expression into a configurable imitation target.

## Opening contract

The opening three chapters must collectively establish:

1. a disruptive situation or unanswered question;
2. the protagonist's immediate desire and practical constraint;
3. the story's distinctive mechanism, relationship, or danger;
4. an irreversible choice or consequence;
5. the repeatable payoff readers can expect.

Do not spend all three chapters explaining history, organizations, or power systems. Reveal rules through decisions, conflict, and consequences.

## Opening milestone

After three committed chapters, run `novelctl milestone --type opening-three`.

Keep two judgments separate:

1. Mechanical readiness: accepted prose, current quality reports, passing review fingerprints, and committed continuity all refer to the same files.
2. Commercial judgment: a source-bound Codex review scores audience fit, hook, agency, payoff density, escalation, emotional investment, prose distinctiveness, and continuation intent.

A commercial review must cite chapter evidence and name the next bounded action. It must also define a target-reader hypothesis and observable success signal. Internal `pass` means “ready for reader testing,” never “proven market success.”

Before brief approval, compare two or three genuinely different openings for the selected topic. Blind labels must hide the author's preferred option, and every alternative must preserve the same core premise so the test compares openings rather than unrelated books. Record selection and rejection reasons even when no external test is available.

## Chapter economics

Every chapter must earn its place. Require:

- one immediate goal;
- meaningful resistance;
- at least one turn that changes the reader's understanding or the character's options;
- a net change in fact, relationship, resource, risk, or commitment;
- a payoff or partial payoff;
- an ending pull tied to an existing desire, danger, secret, or choice.

Reject chapters that only relocate characters, repeat known information, summarize emotions, or postpone all consequences.

Every schema-v2 scene beat must achieve its declared value shift and contribute to the chapter emotional target. Review these explicitly instead of treating the scene list as a loose brainstorming note.

## Scene and prose standards

- Enter scenes near pressure and leave after the value shift.
- Prefer concrete action, sensory evidence, and character-specific choices over abstract explanation.
- Give dialogue different objectives and rhythms; do not make every speaker explain the plot.
- Vary paragraph and sentence rhythm according to tension.
- Preserve quiet scenes when they deepen attachment, reveal cost, or set up later pressure.
- Avoid mechanically adding noise, slang, fragments, or errors to appear human.
- Do not solve the central conflict early merely to make one chapter feel complete.

## Volume control

Give each volume:

- a reader-facing promise;
- an escalation ladder;
- a midpoint change that invalidates the easy plan;
- a climax that pays the volume promise;
- a consequence that opens the next stage.

Plan the current volume firmly and distant volumes lightly. Replan when the engine changes; do not force chapters to obey stale outlines.
At a volume boundary, run `novelctl milestone --type volume`; it generates form-specific review dimensions and a named continuity checkpoint.

Use `planning/arc-grid.yaml` to make cross-volume promises and payoff debt visible. An active line that exceeds its declared idle limit requires an explicit advance, dormancy reason, merge, payoff, or abandonment decision. Do not create a chapter merely to touch every subplot.

## Review priorities

Review in this order:

1. contract and continuity violations;
2. causality and character choice;
3. reader reward, pacing, and ending pull;
4. voice, specificity, repetition, and sentence craft.

Repair locally when possible. Limit full rewrites and review loops. A technically clean chapter still fails commercial review if nothing important changes or no next-page desire remains.
