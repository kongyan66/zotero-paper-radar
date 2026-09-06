import assert from "node:assert/strict";
import test from "node:test";
import {
  parseZoteroVersion,
  validateZoteroVersion,
} from "../../../src/infrastructure/zotero/zoteroVersion.ts";

test("accepts Zotero 9 stable and prerelease version strings", () => {
  assert.deepEqual(parseZoteroVersion("9.0.6"), {
    major: 9,
    minor: 0,
    patch: 6,
    raw: "9.0.6",
  });
  assert.equal(validateZoteroVersion("9.1-beta.2").ok, true);
});

test("rejects unsupported or missing Zotero versions", () => {
  for (const version of ["8.0.0", "10.0.0", "", "nightly"]) {
    const result = validateZoteroVersion(version);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "zotero.unsupported_version");
      assert.equal(result.error.retryable, false);
    }
  }
});
