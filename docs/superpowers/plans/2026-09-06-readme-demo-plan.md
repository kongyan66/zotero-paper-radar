# README Visual Demo Implementation Plan

## Scope

Implement the approved README redesign and one complete real-product workflow animation without changing plugin behavior.

## Steps

1. Audit the current README, package metadata, release links, logo, and available capture/encoding tools.
2. Capture or assemble privacy-safe frames for the approved workflow: select profile, refresh, inspect Chinese summary and explanation, save to Zotero.
3. Crop and normalize frames, add minimal step captions if required, and encode an optimized looping GIF under `assets/readme/`.
4. Rewrite the root README with centered product identity, badges, direct actions, the primary GIF, concise capabilities, workflow, installation, model configuration, privacy, limits, development, attribution, and license.
5. Verify media dimensions and size, links, Markdown structure, repository commands, and the final diff.

## Acceptance Criteria

- The GIF communicates the complete workflow in approximately 14 to 18 seconds.
- No API key, private local path, or unpublished library metadata appears in the media.
- The README remains concise, preserves upstream attribution, and uses accurate project/release links.
- The animation is readable at GitHub README width and is reasonably sized for repository loading.
- Existing checks remain green when documentation references project commands or metadata.
