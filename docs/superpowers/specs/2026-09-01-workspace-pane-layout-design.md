# Research Workbench Pane Layout Design

**Date:** 2026-09-01
**Status:** Proposed
**Scope:** Recommendation workspace presentation and interaction only

## Goal

Make the Zotero arXiv Daily workspace easier to scan and configure during a
recommendation run. The interest profile area and task center should be
collapsible. The task center should also be resizable with the mouse while
keeping the recommendation list as the primary content area.

## Selected Approach

Use the existing CSS Grid layout with a small TypeScript layout controller.
The implementation stays within the current Zotero XHTML, CSS, and TypeScript
stack. It does not introduce a UI library, change recommendation ranking, or
change task persistence.

## Layout

The workspace keeps three visual bands:

1. A fixed top toolbar for recommendation controls.
2. A profile band followed by the main recommendation area and task center.
3. A full-width diagnostics band at the bottom.

The desktop content grid uses a flexible recommendation column and a task
column with a default width of 320px. The task column is constrained between
260px and 520px. A vertical resize handle sits between the two columns and is
only active while the task center is expanded.

The task center starts at the same vertical position as the recommendation
header and extends to the diagnostics band, so it remains flush with the main
content area. The profile band does not create an empty offset above either
main panel.

## Profile Collapse

The profile band remains visible as a compact summary row when collapsed. The
summary contains the total number of profiles and the counts of recent and
long-term profiles. A button in the summary row toggles the profile details.
The existing profile editing, merge, split, rollback, lock, and disable
actions remain available after expansion.

The collapsed state is the default because recommendations are the primary
workflow. Expanding or collapsing the band only changes layout; it never
reloads profiles or starts a task.

## Task Center Collapse and Resize

The expanded task center keeps its existing filters, active progress, task
history, retry, cancel, continue, per-task clear, and clear-history actions.
Its header receives a collapse button.

When collapsed, the task center becomes a 28px rail rather than disappearing.
The rail exposes a compact state indicator for the active task or the most
important recent status. A single expand button restores the previous expanded
view. Active tasks continue to run and their task records remain unchanged.

Dragging the resize handle changes only the task column width. Pointer movement
is clamped to 260px through 520px. The handle uses `role="separator"`,
`aria-orientation="vertical"`, `tabindex="0"`, and an `aria-valuenow` width.
ArrowLeft and ArrowRight adjust by 16px; Home and End move to the minimum and
maximum width. The handle has a visible focus ring and a `col-resize` cursor.

The initial implementation keeps the width and collapsed state in the active
workspace instance. It does not add new Zotero preference keys until there is
a demonstrated need to persist personal layout choices across sessions.

## Responsive Behavior

At widths below 900px the main panels use a single-column flow. The horizontal
resize handle is removed because the task center is no longer a side panel.
The task center remains collapsible, and the profile summary remains usable
without requiring horizontal scrolling. Long titles, profile names, task
messages, and controls must wrap without overlapping neighboring content.

## Error and Lifecycle Handling

- Collapse and resize controls must remain available while a task is queued,
  running, failed, or completed.
- Destroying a workspace removes pointer and keyboard listeners from the
  resize handle and removes any layout classes or inline variables from the
  workspace node.
- A missing task center or a read-only view degrades to the current expanded
  rendering without throwing.
- Resizing must never change task filter selection or trigger a refresh.

## Verification

Add or update tests for:

- Profile summary default state and toggle behavior.
- Task center collapse and expand controls.
- Resize pointer movement, keyboard movement, and min/max clamping.
- Active task controls remaining available while the task panel is collapsed.
- Narrow layout removing the horizontal resize handle.
- Workspace destruction removing layout listeners.

Run formatting, lint, type checking, unit tests, integration tests, and the
Zotero 9 UI test suite. Manually inspect the workspace at a desktop width and
at a width below 900px for clipping, overlap, focus visibility, and correct
panel alignment.

## Non-Goals

- No change to profile clustering or recommendation scoring.
- No change to model providers, LLM summaries, arXiv queries, or task storage.
- No new persistent preference or database migration in this iteration.
