# Commercial Demo: 盐火照夜

This is a regression fixture for the Codex-native novel workflow, not a polished publication manuscript.

It demonstrates:

- a dated, five-source Chinese web-fiction market scan;
- three scored candidate topics across 番茄长篇 and 知乎盐选短篇, an explicit selection trade-off, originality protections, and a passing topic-selection report;
- three anonymous opening-hook alternatives with a selected option, test protocol, and recorded rejection reasons;
- a reader-positioned brief, story engine, world rules, cast, and current-volume plan;
- a cross-volume main-plot and character-arc grid with payoff debt and idle limits;
- stable per-character motivation/voice profiles and a rights-declared style profile/example library;
- three contracts with explicit reader payoff, emotional target, scene beats, value changes, protected facts, and ending pull;
- bounded context packages that select committed continuity from prior chapters;
- draft and final mechanical quality reports;
- structured review artifacts;
- prose-fingerprint-bound continuity deltas;
- prose-fingerprint-bound structured handoffs instead of rolling free-text summaries;
- three committed chapters with durable facts, threads, resources, relationships, and timeline.
- dynamic character and story cards that carry life status, injuries, goals, knowledge, plot beats, and payoff debt into chapter four;
- a rebuildable SQLite full-text index whose candidates are rechecked against source fingerprints;
- an opening-three mechanical report plus an evidence-based internal commercial review marked `pass`;
- a chapter-four contract and source manifest proving the next bounded context is ready without advancing production state.

Verify it from the repository root:

```bash
node plugins/codex-novel/dist/novelctl.cjs validate examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs topics examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs hooks examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs arcs examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs cards examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs cadence examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs index examples/commercial-demo
node plugins/codex-novel/dist/novelctl.cjs search examples/commercial-demo --query "青盐 夜航簿"
node plugins/codex-novel/dist/novelctl.cjs export examples/commercial-demo --format md
node plugins/codex-novel/dist/novelctl.cjs export examples/commercial-demo --format docx
node plugins/codex-novel/dist/novelctl.cjs export examples/commercial-demo --format epub
```

The fixture deliberately stops at the opening milestone. It proves workflow integrity and cross-chapter continuity, not market demand or publication revenue.
Its selected topic ranks first at 4.80/5 under the deterministic policy; that score means the evidence and originality gates pass, not that sales are predicted. The internal opening review's `pass` means ready for the stated target-reader test, not proven demand or revenue.
