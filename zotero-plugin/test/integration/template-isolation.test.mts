import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeFiles = [
  "../../package.json",
  "../../addon/manifest.json",
  "../../addon/prefs.js",
  "../../src/addon.ts",
  "../../src/hooks.ts",
  "../../src/index.ts",
];

test("does not retain template service configuration", async () => {
  const contents = await Promise.all(
    runtimeFiles.map((path) =>
      readFile(new URL(path, import.meta.url), "utf8"),
    ),
  );
  const runtimeText = contents.join("\n");

  assert.doesNotMatch(runtimeText, /hjfy\.top/i);
  assert.doesNotMatch(runtimeText, /arxiv2zh@kongyan66/i);
  assert.doesNotMatch(runtimeText, /serviceURL|pollInterval|session/i);
});
