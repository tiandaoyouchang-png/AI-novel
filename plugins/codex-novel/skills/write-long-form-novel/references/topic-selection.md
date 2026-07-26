# Market-Backed Topic Selection

## Purpose

Choose what to write before investing in a story bible or manuscript. Market evidence narrows the search space; it does not guarantee success or replace author judgment.

## Evidence rules

Create `discovery/market-scan.yaml` with:

- an `asOf` date and one narrow `targetMarket`;
- one or both target platforms: `fanqie`, `zhihu-salt`;
- one or both forms: `long-serial`, `short-complete`;
- at least three attributable sources;
- source ID, title, direct URL, publisher, publication/access dates, type, applicable platforms/forms, signal, evidence, and confidence;
- at least two independent publishers;
- at least two medium- or high-confidence industry, platform, or reader sources.

The scan must be no more than 30 days old when evaluated. A candidate must cite at least two independent publishers and at least one non-competitor demand source published within the last 550 days that applies to its platform and form.

Use official reports, platform data, and documented reader research as primary evidence. Search trends reveal attention, not willingness to keep reading. Competitor product pages establish product capabilities, not market quality. Never invent numbers, quotations, reader behavior, or sources.

When authoring these files for the first time, read [topic-selection-example.md](topic-selection-example.md) for a complete three-candidate field template. Replace every example value and date with researched project evidence.

## Candidate slate

Create three to eight candidates in `discovery/topic-candidates.yaml`. For each candidate, define:

- working title, target platform, work form, genre, target reader, and channel;
- a separate rationale for platform fit and form fit;
- reader need and emotional reward;
- core fantasy and repeatable story engine;
- differentiator and opening hook;
- comparable reader appeals, without copying expression;
- evidence IDs, saturation risks, and at least two originality boundaries;
- integer scores from 1 to 5 for demand, competition whitespace, channel fit, author fit, serial sustainability, differentiation, and evidence quality.

Score conservatively. The deterministic weighted score is:

```text
demand 25% + competition whitespace 15% + channel fit 15%
+ author fit 5% + serial sustainability 15%
+ differentiation 15% + evidence quality 10%
```

Demand, channel fit, serial sustainability, differentiation, and evidence quality must each score at least 3 for the selected topic. A high total cannot compensate for a failed gate.

Platform and form are independent. Support all four combinations:

- `fanqie` + `long-serial`;
- `fanqie` + `short-complete`;
- `zhihu-salt` + `long-serial`;
- `zhihu-salt` + `short-complete`.

For `long-serial`, require serial sustainability of at least 4. For `short-complete`, require channel fit and differentiation of at least 4. Do not assume every Fanqie work is long or every Zhihu Salt work is short.

## Decision record

Create `discovery/topic-decision.yaml` with:

- exactly one `selectedId`;
- a rationale and the trade-off consciously accepted;
- a reason for rejecting every other candidate;
- a target-reader hypothesis, minimum sample of at least three readers, and observable success signal;
- at least two protected-originality rules.

The highest score is a recommendation, not an automatic decision. The author may choose another passing candidate when the decision record explains the trade-off. The selected platform, form, target reader, and channel must match `planning/market-position.yaml` exactly.

## Validate and approve

Run:

```bash
node <plugin-root>/dist/novelctl.cjs topics <workspace>
```

Read `discovery/topic-selection-report.json`. Fix blocking evidence or originality issues; do not edit the report. Any change to the scan, slate, or decision makes the report stale. Regenerate it before brief approval.

After the report passes, present:

1. the ranked slate and score drivers;
2. the selected topic and accepted trade-off;
3. evidence limitations and saturation risks;
4. protected originality boundaries;
5. the proposed reader test.

Proceed only after explicit topic approval or delegated authority. The later opening-three milestone is readiness for reader testing, not proof of market demand.
