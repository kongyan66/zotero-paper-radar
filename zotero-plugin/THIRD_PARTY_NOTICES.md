# Third-Party Notices

Zotero Paper Radar is an independent community project. It is not affiliated
with or endorsed by Zotero, arXiv, or the model service configured by a user.

## Engineering foundation

- This repository originated as a fork of
  [TideDra/zotero-arxiv-daily](https://github.com/TideDra/zotero-arxiv-daily),
  distributed under the AGPLv3 license. Its Zotero-library-based paper
  recommendation workflow is the starting point for this project. The original
  email workflow and its documentation are retained alongside the Zotero plugin.

- The initial plugin scaffold, lifecycle shape, build configuration, and test
  conventions were adapted from the sibling `arxiv2zh` project by kongyan66,
  licensed under `AGPL-3.0-or-later`.
- [zotero-plugin-scaffold](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold)
  is used to develop, test, package, and release the plugin.
- The bootstrap structure follows Zotero's
  [Make It Red](https://github.com/zotero/make-it-red) example and Zotero plugin
  development documentation.

## Runtime dependencies

- [MiniSearch](https://github.com/lucaong/minisearch) `7.2.0`, used for local
  candidate prefiltering, under its MIT license.
- [ml-kmeans](https://github.com/mljs/kmeans) `7.0.1`, used for deterministic
  interest-profile clustering, under its MIT license.
- Zotero 9 APIs and the standard JavaScript runtime are host-provided; they are
  not bundled into the XPI.

## Product design reference

- [zotero-AI-Butler](https://github.com/steven-jianhao-li/zotero-AI-Butler)
  informed the setup, connection-test, and task-status interaction design. No
  AI Butler source code is bundled at this stage.

Development-only packages and their exact versions are listed in
`package-lock.json`. Third-party paper metadata, abstracts, and PDFs remain
subject to their respective licenses and applicable law.
