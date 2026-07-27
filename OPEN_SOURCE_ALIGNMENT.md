# Open-Source Alignment

Reviewed on 2026-07-26. This is an architecture comparison, not a claim that any referenced project proves commercial fiction quality.

## References and adopted patterns

### novelWriter

Source: [vkbo/novelWriter](https://github.com/vkbo/novelWriter)

The project assembles novels from smaller plain-text documents and emphasizes human-readable storage suitable for version control and file synchronization.

Adopted:

- many small Markdown/YAML artifacts instead of one opaque database document;
- human-editable source of truth;
- clean separation between manuscript, notes, and derived outputs.
- named, fingerprinted local revisions with safe restore.

Not adopted in V1:

- a dedicated desktop editor;
- its project format or UI implementation.

### GPTAuthor

Source: [dylanhogg/gptauthor](https://github.com/dylanhogg/gptauthor)

The workflow turns a human prompt into a synopsis, pauses for human review, then writes chapters iteratively using shared planning and the previous chapter to control context size.

Adopted:

- explicit approval before prose production;
- serial chapter generation;
- fingerprint-bound structured previous-chapter handoff plus shared planning.

Changed:

- Codex is the creative engine, so the plugin embeds no provider SDK or API-key layer;
- each chapter has a contract, quality report, source-bound review, and committed continuity transaction rather than a simple generate-next loop.

### SillyTavern

Sources: [SillyTavern](https://github.com/SillyTavern/SillyTavern) and [prompt/context documentation](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/Prompts/index.md)

World Info/lorebooks provide modular world, memory, character, and instruction entries that can be injected into a prompt when relevant.

Adopted:

- modular continuity entries with stable IDs;
- keyword and explicit-ID context selection;
- rebuildable SQLite full-text candidate retrieval with source revalidation;
- bounded context rather than loading the entire manuscript;
- visible source fingerprints so context can be inspected and invalidated.

Changed:

- continuity is committed only from accepted prose;
- context packages have machine-checkable source manifests;
- no multi-provider chat frontend or role-play preset layer.

### 302 AI Novel Writing

Source: [302ai/302_novel_writing](https://github.com/302ai/302_novel_writing)

The project exposes chapter generation, plot planning, manual editing, automatic full-novel generation, and a browser-based writing interface.

Adopted:

- planning and chapter writing are distinct operations;
- generated prose remains manually editable.

Deferred:

- browser editor, cover generation, themes, and one-click full-book generation;
- automatic full-book generation remains intentionally excluded until long-run continuity is proven.

## Resulting product decision

Codex Novel combines plain-text project durability, approval-gated serial production, modular relevant context, and manual editability. It adds stricter evidence boundaries that the comparison projects do not collectively provide:

- accepted-artifact and prose fingerprints;
- stale dependency propagation;
- exact-draft review binding;
- journaled multi-file continuity commits and recovery;
- committed-chapter integrity audits;
- structured market positioning and source-bound opening milestones.
- separate short-complete and long-volume milestone rubrics;
- schema-bound scene value changes, stable character voice profiles, and a two-round repair budget.
- multi-option opening-hook records, cross-volume arc grids, local publication learning, and committed-only DOCX/EPUB export.

The project deliberately remains a Codex-native production system rather than becoming another model-provider frontend.
