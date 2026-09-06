# Changelog

All notable changes to the Zotero plugin are documented here. The project
follows Semantic Versioning.

## [Unreleased]

## [0.1.0-beta.5] - 2026-09-06

### Fixed

- Keep expired recommendation runs that are still referenced by feedback or persisted tasks, preventing refresh startup from failing with a foreign-key error.

## [0.1.0-beta.4] - 2026-09-06

### Changed

- Renamed the public plugin to Zotero Paper Radar (论文雷达), with `zotero-paper-radar.xpi` packages and repository links under `kongyan66/zotero-paper-radar`. The existing addon ID, preference keys, and database name are preserved for upgrades.

### Added

- Added SiliconFlow as an independent Embedding and LLM provider with editable model presets.
- Added provider-specific SiliconFlow documentation links and connection diagnostics.

### Fixed

- Let paper abstracts fill the recommendation column instead of leaving a large blank area beside a fixed-width text block.

- Reset Zotero platform control margins and heights in the recommendation toolbar, use opaque scoped filter surfaces, and fingerprint stylesheet URLs to refresh cached CSS after updates.

- Identified the upstream service in HTTP task errors so arXiv failures are not reported as model failures.
- Corrected arXiv `submittedDate` query formatting to use the documented UTC minute format.
- Made the interest profile panel collapsible and replaced the clipped multi-select filter with a checkbox menu.
- Kept the latest non-empty recommendation cache when a refresh returns no new papers, and clarified task stage counts.
- Added task execution timestamps, per-task history cleanup, and a protected one-click history clear.
- Added explicit profile and task-center collapse controls, a bounded task-center resize handle, keyboard resizing, and a compact task status rail.
- Fixed task-center collapse layout synchronization and stabilized the right-rail header into a two-row layout.
- Added seven-day recommendation history with local-day selection, automatic expiry, and cross-day arXiv de-duplication.
- Added a `推荐日` selector and an explicit recommendation date label so today's and previous days' results can be compared without re-running model requests.
- Split task-center recommendation metrics into compact arXiv retrieval, effective candidate, final recommendation, and Embedding reuse/request counts.
- Aligned recommendation toolbar controls and replaced the category text with a persistent common-AI multi-select that preserves custom arXiv categories.
- Kept profile and category menus in viewport-positioned overlays so opening them cannot expand or misalign the toolbar.
- Polished the recommendation workspace into a compact research workbench with visible relevance scores, clearer empty states, and responsive task/profile panels.
- Restored cached Chinese summaries after reopening the workspace, generated missing summaries when an empty arXiv refresh falls back to older papers, and surfaced LLM fallback reasons.
- Kept empty-refresh fallback summarization inside the visible task lifecycle and disabled duplicate refreshes while processing.

## [0.1.0-beta.3] - 2026-08-28

### Fixed

- Fixed blank Provider options in the Zotero mixed XUL/XHTML settings page by creating HTML options in the correct namespace.
- Fixed test actions when the Zotero preference-pane realm lacks a global `AbortController`; connection failures now include the active Provider and model for diagnosis.
- Added current Volcano Ark text embedding model suggestions, with `doubao-embedding-text-240715` as the default suggestion.

## [0.1.0-beta.2] - 2026-08-27

### Added

- Added independent model provider presets for Volcano Ark standard API and Coding Plan.
- Added editable model/Endpoint ID suggestions, provider-specific URL validation, and setup guidance.
- Included the provider in Embedding generation fingerprints so model services cannot share stale vectors.

## [0.1.0-beta.1] - 2026-08-26

### Added

- Initial Zotero 9 plugin scaffold.

[Unreleased]: https://github.com/kongyan66/zotero-paper-radar/compare/v0.1.0-beta.5...HEAD
[0.1.0-beta.5]: https://github.com/kongyan66/zotero-paper-radar/releases/tag/v0.1.0-beta.5
[0.1.0-beta.4]: https://github.com/kongyan66/zotero-paper-radar/releases/tag/v0.1.0-beta.4
[0.1.0-beta.3]: https://github.com/kongyan66/zotero-arxiv-daily/releases/tag/v0.1.0-beta.3
[0.1.0-beta.2]: https://github.com/kongyan66/zotero-arxiv-daily/releases/tag/v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/kongyan66/zotero-arxiv-daily/releases/tag/v0.1.0-beta.1
