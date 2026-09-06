# Toolbar Alignment and Category Filter Design

## Goal

Align the recommendation toolbar controls and replace the read-only arXiv
category summary with a compact configurable multi-select. The toolbar must keep
its current height on a normal desktop window and wrap predictably at narrower
widths.

## Control Layout

The control order remains:

1. `画像`
2. `推荐日`
3. `数量`
4. `时间`
5. `分类`
6. `刷新推荐`

Every field uses the same two-row structure: a fixed label track above a 32px
control track. Buttons, selects, and numeric inputs share the same bottom
baseline. The refresh button occupies only the control track and aligns with
the field bottoms. Existing responsive wrapping remains enabled, but each field
wraps as one unit.

## Category Multi-Select

The category control follows the existing profile checkbox-menu interaction.
It provides these common AI categories:

- `cs.CV` - Computer Vision
- `cs.CL` - Computation and Language
- `cs.AI` - Artificial Intelligence
- `cs.LG` - Machine Learning
- `cs.IR` - Information Retrieval
- `cs.RO` - Robotics

Categories already configured in Zotero preferences are appended when they are
not in the common list, so custom values remain selectable and are never
dropped. At least one category must remain selected.

The closed button shows one or two selected category codes directly; for three
or more it shows `已选 N 个分类`. The menu uses checkboxes and closes on Escape,
outside click, or recommendation refresh.

## Persistence and Query Flow

`RecommendationToolbarState` gains a `categories` array. The workspace passes
the selected categories to the runtime for the next recommendation request.
Before starting the pipeline, the runtime normalizes and saves the selection as
the new local default. The arXiv request and persisted recommendation query
scope both use that same normalized selection.

Changing the category menu alone does not start a network request. Historical
recommendation loading remains cache-only and ignores the current category
selection.

## Compatibility and Errors

- Existing `cs.CV,cs.CL` preferences initialize the new control unchanged.
- Empty selection is prevented in the UI and rejected by normalization as a
  defensive check.
- Custom settings-page categories continue to work.
- No database migration is required; categories are already stored in plugin
  preferences and recommendation query JSON.

## Verification

- Toolbar tests verify field order, equal control heights, category selection,
  at-least-one enforcement, custom-category preservation, and refresh state.
- Runtime tests verify that selected categories drive the arXiv query and are
  persisted before the run.
- Formatting, lint, type checking, unit tests, integration tests, and Zotero 9
  host tests must pass.
