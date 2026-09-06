# Task Center Recommendation Metrics Design

## Goal

Make recommendation-task volume visible without conflating retrieval, filtering,
Embedding reuse, and final output. The task row must remain readable in the
narrow resizable task pane.

## Metrics

Recommendation tasks expose two compact metric lines:

1. `检索 N篇 · 候选 N篇 · 推荐 N篇`
2. `向量复用 N篇 · 新计算 N篇 · 目标 N篇`

The values come from the existing persisted task checkpoint:

- `arxivCount`: papers returned by the configured arXiv date/category query.
- `candidateCount`: papers remaining after prefiltering, duplicate removal,
  seven-day history suppression, and feedback suppression.
- `runCandidateCount`: papers stored for the published recommendation run after
  scoring and diversity reranking.
- `cacheHits`: candidate vectors loaded from the local Embedding cache.
- `embeddingRequested`: candidate vectors requested from the configured model
  service.

`runCandidateCount` is added to the rerank-stage checkpoint so it cannot be
confused with the earlier filtered candidate count. Missing legacy fields render
as `--` instead of a misleading zero; true zero values remain visible.

## Layout

The task title, status, stage, progress bar, execution time, and actions keep
their existing positions. The current overloaded detail sentence is replaced
with a small metrics block below the progress bar:

- The recommendation-flow line is primary metadata.
- The Embedding line is secondary metadata with slightly quieter text.
- Elapsed time and final/error state remain on a separate status line.

Each line uses literal separators, wrapping with stable row gaps, and a compact
10.5px metadata size. The stage, short local time range, and elapsed duration
share one line; completed tasks do not repeat a separate completion sentence.
The progress bar is 4px high and task padding is reduced. The layout must not
horizontally scroll or force buttons into the metrics area when the task pane is
narrow. Non-recommendation tasks retain their current compact detail output.

## Data Flow

Pipeline stages already persist `arxivCount`, `candidateCount`, `cacheHits`, and
`embeddingRequested` through checkpoint merging. The rerank stage additionally
persists `runCandidateCount`. `TaskCenterController` maps these optional values
to the view model, and `TaskCenterView` renders the two-line block only for
recommendation tasks.

No database migration is required because task checkpoints are JSON. Existing
task history remains readable.

## Error Handling

- Missing metrics in older tasks display `--`.
- A legitimate zero displays `0 篇`.
- Failed tasks retain metrics completed before the failure and keep the failure
  message on the status line.
- Metrics do not change task success/failure semantics.

## Verification

- Unit/UI tests cover complete metrics, zero values, legacy missing fields, and
  non-recommendation tasks.
- Type checking, linting, unit tests, integration tests, and Zotero 9 host tests
  must pass.
- A narrow-pane DOM/layout check confirms wrapping without overlap or horizontal
  overflow.
