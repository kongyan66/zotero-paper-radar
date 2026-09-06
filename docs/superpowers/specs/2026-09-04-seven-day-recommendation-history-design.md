# Seven-Day Recommendation History Design

**Date:** 2026-09-04
**Status:** Proposed
**Scope:** Recommendation history, date selection, and cross-day de-duplication

## Goal

Make recommendation results distinguishable by local calendar day, keep a
rolling seven-day window of recommendation records, allow users to inspect a
previous day, and prevent a paper already shown during the window from being
recommended again.

## Selected Approach

Reuse the existing `recommendation_runs` and `recommendation_candidates` tables.
No new snapshot table or external JSON store is introduced. A run's local day
is derived from its existing `created_at` timestamp for display and grouping.
The existing recommendation and candidate records remain the source of truth.

This keeps the change compatible with the current SQLite schema and avoids a
database migration. Existing records are grouped using the current machine
timezone when they are read.

## Seven-Day Window

The window contains today and the six preceding local calendar dates. The
window start is the local start of the date six days before today, converted to
an ISO timestamp for SQLite queries. Recommendation runs older than that
boundary are pruned during workspace hydration and after a recommendation
refresh. Only recommendation runs and their candidate rows are removed;
summary cache entries and task-center history remain available.

Pruning never removes the currently active recommendation task. If an old
record is still referenced by an active task, it is retained until that task
is no longer active and a later cleanup can remove it.

## Cross-Day De-Duplication

Before ranking new arXiv candidates, the runtime loads all arXiv IDs from
published recommendation runs inside the seven-day window. Candidates with a
matching arXiv ID are excluded before embedding and scoring. arXiv versions
share the same base arXiv ID and are treated as the same paper.

The existing candidate-level de-duplication remains in place for duplicate
results returned in one arXiv query. Saved, rejected, and deferred feedback
filters continue to apply independently.

If fewer unseen candidates remain than the requested count, the result contains
only the unseen candidates. The system never fills the requested count by
repeating a paper within the seven-day window.

## Daily History API

The recommendation repository exposes a read model containing:

- Local day key in `YYYY-MM-DD` form.
- User-facing date label.
- Candidate count.
- The latest non-empty published run for that day.

The repository also exposes candidates for a selected run and recent arXiv IDs
for de-duplication. The runtime adds methods to list available days and load a
selected day's candidates using summary cache only. Selecting a day never
starts an arXiv request, embedding request, LLM request, or task.

When multiple successful runs exist on one day, the latest non-empty run is the
day's displayed result. All published runs remain part of the de-duplication
set until they leave the seven-day window.

## Workspace Behavior

The toolbar receives a `推荐日` selector populated from the seven-day history.
Each option includes its local date and paper count. The current day is the
default when it has a non-empty result; otherwise the most recent available
day is selected.

The recommendation section displays the selected day beside its result count,
for example `推荐结果 · 2026-09-04`. Changing the day updates only the result
list and selected-day label. Existing profile filters remain visible and are
applied to the selected day's stored candidates.

A successful refresh returns the current day's result and refreshes the date
selector. If arXiv returns no unseen candidates, the existing non-empty result
remains visible and the selected day stays on the most recent non-empty record.

## Error and Empty States

- An empty seven-day history shows a clear local empty state.
- A selected day with zero candidates says that no recommendation was saved
  for that date.
- A failed refresh leaves the currently displayed day and result list intact.
- Pruning failures are reported in diagnostics but do not erase visible
  recommendations.
- Date parsing always falls back to the raw run timestamp if a stored timestamp
  is malformed.

## Verification

Add tests for:

- Local day grouping around midnight and the seven-day boundary.
- Listing the latest non-empty run for each day.
- Pruning old recommendation runs while retaining recent records.
- Collecting IDs from all published runs in the window.
- Excluding cross-day duplicates while allowing unseen candidates.
- Returning fewer than the requested count when the unseen pool is small.
- Loading a selected day without network calls.
- Toolbar date selection and selected-day rendering.
- Preserving the current result on failed refresh or empty history.

Run formatting, lint, type checking, unit tests, integration tests, and the
Zotero 9 UI test suite. Manually inspect today/yesterday selection, a seven-day
boundary, an empty date, and a repeated arXiv candidate.

## Non-Goals

- No changes to profile clustering, relevance scoring, feedback semantics, or
  LLM summary generation.
- No new database table or migration.
- No automatic scheduling or background task.
- No changes to task-center retention or cleanup behavior.
