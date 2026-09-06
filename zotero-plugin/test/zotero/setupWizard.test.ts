import { assert } from "chai";
import {
  CorpusEstimator,
  ZoteroEligiblePaperCounter,
} from "../../src/application/corpusEstimator";

describe("setup wizard corpus estimate", function () {
  it("counts eligible local papers without invoking a model service", async function () {
    const originalRequest = Zotero.HTTP.request;
    let networkCalls = 0;
    Zotero.HTTP.request = (async () => {
      networkCalls += 1;
      throw new Error("unexpected network request");
    }) as typeof Zotero.HTTP.request;
    try {
      const estimate = await new CorpusEstimator(
        new ZoteroEligiblePaperCounter(),
      ).estimate(32);
      assert.isAtLeast(estimate.eligiblePaperCount, 0);
      assert.deepEqual(estimate.fieldsSent, ["title", "abstract"]);
      assert.equal(networkCalls, 0);
    } finally {
      Zotero.HTTP.request = originalRequest;
    }
  });
});
