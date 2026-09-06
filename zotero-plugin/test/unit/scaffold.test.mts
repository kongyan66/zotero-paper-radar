import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJsonUrl = new URL("../../package.json", import.meta.url);
const manifestUrl = new URL("../../addon/manifest.json", import.meta.url);

test("uses an isolated Zotero 9 addon identity", async () => {
  const pkg = JSON.parse(await readFile(packageJsonUrl, "utf8"));
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(pkg.config.addonID, "zotero-arxiv-daily@kongyan66");
  assert.equal(pkg.config.addonInstance, "ZoteroArxivDaily");
  assert.equal(manifest.applications.zotero.strict_min_version, "9.0");
  assert.equal(manifest.applications.zotero.strict_max_version, "9.*");
});
