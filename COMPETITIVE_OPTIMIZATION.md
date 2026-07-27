# Competitive Optimization Plan

Reviewed on 2026-07-26. Product pages describe capabilities, not independently verified quality. Market reports establish broad demand signals, not a guarantee that any individual topic will succeed.

## Market signals that should influence topic selection

- The [2024 China Online Literature Blue Book](https://image.chinawriter.com.cn/n1/2025/0630/c404023-40511500.html) reports strong work across realistic, science-fiction, historical, and fantasy writing, growth in medium/short fiction, genre fusion, stronger character subjectivity, and movement beyond formulaic genre structures.
- The [2024 China Online Literature Development Report](https://www.cadpa.org.cn/3277/202507/41753.html) reports 638 million users, continued growth in IP and rights operations, stronger international reach for culturally distinctive work, and sustained popularity for suspense and mystery.
- The [2025 China Online Literature Development Research Report](https://www.cssn.cn/skgz/bwyc/202604/t20260420_5981165.shtml) lists active platform demand spanning urban fantasy, apocalyptic martial arts, history, fantasy, urban stories, ancient romance, suspense, healing stories, folk legends, and longer-form expansion on platforms previously known for short fiction.

Product implication: select a narrow reader need inside an active category, then win through a sustainable story engine and a differentiated cultural or occupational mechanism. Do not equate a popular genre label with an acceptable topic.

Channel implication: model platform and form separately. This implementation supports 番茄小说 or 知乎盐选 with either long-form serialization or a completed short story. The selected platform/form pair must have applicable evidence and an explicit rationale.

## Competitor baseline

- [Novelcrafter](https://www.novelcrafter.com/) combines planning views, an interconnected Codex, cross-book sharing, AI brainstorming/writing/review, collaboration, and revision history.
- [Sudowrite](https://docs.sudowrite.com/) combines Story Bible, scenes, chapter continuity, series support, rewriting, feedback, plugins, and a saliency engine that selects relevant context and supports visibility controls.
- [Dabble](https://www.dabblewriter.com/docs/getting-started/what-is-dabble) combines a scene-level manuscript, parallel plot/subplot/character-arc grids, notes, daily goals, import/export, and synchronization.
- [Yuewen Writer Assistant](https://www.yuewen.com/app/?type=appzj) combines outlines, search, correction, research assistance, cross-device writing, direct publishing, reader profiles, revenue, rewards, and subscription data.
- [302 AI Novel Writing](https://github.com/302ai/302_novel_writing) combines plot planning, AI-assisted chapters, manual editing, multilingual support, and automatic full-novel generation.

## Ten optimization points

Status note for `0.3.0`: points 1–10 now have tested command-line implementations. Reader tests and publication metrics remain author-supplied and local; the system never labels an AI judgment as market proof or silently rewrites canon from metrics.

| # | Gap | Competitor or market evidence | Optimization | Priority | Verification |
|---|---|---|---|---|---|
| 1 | No evidence-backed topic discovery | Platform tools expose reader data; industry reports show demand changes over time | Add dated market-signal records with source type, evidence, confidence, and freshness | P0 | Stale, weak, or single-source scans cannot pass topic selection |
| 2 | No candidate portfolio or explicit trade-off | AI tools brainstorm, but a single generated idea hides alternatives | Require at least three candidates scored on demand, whitespace, channel fit, author fit, sustainability, differentiation, and evidence quality | P0 | Deterministic ranking and score explanation |
| 3 | Market positioning begins after the topic is already chosen | Current `market-position.yaml` cannot explain why this topic beat alternatives | Bind the selected topic and source fingerprints into the accepted brief | P0 | Editing discovery evidence makes the brief stale |
| 4 | Trend copying and saturation risk are not gated | Broad demand signals do not prove whitespace; culturally distinctive work has stronger IP/export potential | Add originality boundary, saturation risk, prohibited imitation, and two-source support for the selected candidate | P0 | Candidate fails when differentiation or evidence quality is below threshold |
| 5 | Opening-hook experiment | Novelcrafter/Sudowrite support brainstorming and review | Generate 2–3 hook hypotheses, blind-test signals, a selection, and rejection records before brief approval | Implemented | One hook selected; every alternative has a rejection reason; fake reader evidence is prohibited |
| 6 | Cross-volume subplot/character-arc grid | Dabble exposes parallel plot lines against scenes | Add a cross-volume matrix with main plot, subplot, character arc, payoff, dependency, and idle-limit fields | Implemented | Active plot lines beyond their idle limit are reported without overwriting dynamic continuity |
| 7 | Context selection lacked dynamic character/plot state and explicit secret visibility | Sudowrite saliency supports card/trait visibility to prevent premature disclosure | Dynamic character/story cards, death-state blocking, knowledge separation, hidden-ID redaction; add chapter-number reveal policy next | P1 | Dead onstage participants are blocked; hidden IDs are redacted and cross-references validated |
| 8 | Author-facing revision history | Novelcrafter exposes field and scene revision restoration | Add named prose revisions, diff summaries, pre-restore backup, and safe restore | Implemented | Restore round-trip preserves a safety snapshot and invalidates disposable retrieval |
| 9 | Serial-production cadence and backlog health | Dabble tracks writing goals; Yuewen exposes publishing and performance data | Derive ready inventory and buffer health from committed versus confirmed-published chapters | Implemented | Drafts never count as stock; short-complete projects are excluded |
| 10 | Post-publication learning loop | Yuewen exposes reader profiles, subscriptions, rewards, and revenue | Import local author-provided chapter metrics and generate a hypothesis-review record | Implemented | Reports require author review and never rewrite canon automatically |

## Delivery order

1. Keep points 1–6 as hard planning gates before expensive long-form production.
2. Use point 8 before substantial author revisions and point 9 throughout long serialization.
3. Use point 10 only with author-provided publication data and an explicit sample-quality review.
4. Add platform APIs, visual dashboards, and semantic retrieval only after real usage proves the command-line core insufficient.

This order protects the expensive decision first: choosing a market-supported, original, serially sustainable book before generating large amounts of prose.
