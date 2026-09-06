# README Visual Demo Design

## Goal

Upgrade the repository README into a concise product page inspired by PaperRss while preserving Zotero Paper Radar's own identity, technical boundaries, upstream attribution, and AGPL-3.0 licensing. Add one real animated walkthrough that explains the complete recommendation workflow without exposing private configuration.

## Chosen Direction

Use a single primary workflow animation directly below the centered product header and badges. Keep later sections concise and use only a small number of static screenshots when they add information not already visible in the animation.

This direction was chosen over multiple feature GIFs because it gives visitors an immediate understanding of the product while keeping the README lightweight and easy to scan.

## README Structure

1. Centered product identity
   - Product logo
   - `Zotero Paper Radar` title
   - Chinese value proposition and short English description
   - Release, Zotero compatibility, license, and build badges
   - Direct links to download, installation, and issue reporting
2. Primary animated demonstration
3. Short product introduction
4. Core capabilities
5. How the recommendation workflow works
6. Selected real interface screenshots
7. Installation and model configuration
8. Local data, privacy, and upgrade behavior
9. Known boundaries
10. Development commands
11. Upstream attribution and license

## Animation Storyboard

The animation should be a silent, automatically looping GIF lasting approximately 14 to 18 seconds.

1. `0-4s`: Open the interest-profile selector and choose a research interest.
2. `4-8s`: Click refresh and show the task appearing in Task Center.
3. `8-13s`: Show a recommendation with relevance, matched profile, Chinese summary, and explanation.
4. `13-16s`: Click `保存到 Zotero` and show the resulting success feedback.

Use the real plugin UI and public paper metadata. Do not open provider settings, API-key fields, diagnostics containing secrets, local paths, or other private content.

## Capture And Presentation

- Capture only the plugin workspace and remove unrelated browser or desktop chrome where practical.
- Keep the viewport large enough for text to remain legible in GitHub's README column.
- Avoid rapid cursor movement and long waits; trim idle time between actions.
- Add restrained step captions only when the native UI does not make the action clear.
- Prefer a 16:9 or moderately wide crop near 1280 px in width.
- Optimize the final GIF for a practical repository size, targeting roughly 8 MB or less without making text unreadable.
- Store README-specific media under `assets/readme/` with stable descriptive filenames.

## Visual Language

- Reuse the plugin's restrained green accent and neutral surfaces.
- Keep the README clean and technical rather than promotional.
- Use the existing project logo where suitable; do not imitate PaperRss branding or copy its wording.
- Use consistent image widths and short captions.

## Content Boundaries

- Preserve accurate statements about local storage, API requests, and provider behavior.
- Do not claim that recommendation quality, translation, or provider availability is guaranteed.
- Keep the upstream-project acknowledgment prominent and retain all license notices.
- Do not include API keys, user library metadata, local file paths, or unpublished paper data in media.

## Verification

- Verify every README link against the public repository.
- Render the README locally or inspect it on GitHub to confirm image sizing and section hierarchy.
- Play the GIF through at least two complete loops and inspect the first/last-frame transition.
- Confirm that UI text is readable at typical GitHub desktop width.
- Inspect the GIF frames for secrets and unrelated desktop content.
- Run the repository's existing checks if README-linked commands or package metadata are changed.

## Deliverables

- Updated root `README.md`.
- Optimized workflow GIF under `assets/readme/`.
- A limited set of current screenshots under `assets/readme/` if needed.
- No functional plugin changes unless a recording-only issue blocks the documented workflow.
