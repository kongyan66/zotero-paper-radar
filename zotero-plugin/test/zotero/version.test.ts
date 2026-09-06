import { assert } from "chai";
import { validateZoteroVersion } from "../../src/infrastructure/zotero/zoteroVersion";

describe("Zotero version gate", function () {
  it("accepts the running Zotero 9 version", function () {
    const result = validateZoteroVersion(Zotero.version);

    assert.isTrue(result.ok, `Unexpected Zotero version: ${Zotero.version}`);
  });

  it("rejects Zotero 8 and missing versions", function () {
    assert.isFalse(validateZoteroVersion("8.0.0").ok);
    assert.isFalse(validateZoteroVersion("").ok);
  });
});
