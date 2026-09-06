import { assert } from "chai";
import { config } from "../../package.json";
import type { AddonLifecycle } from "../../src/bootstrap/addonLifecycle";

interface TestAddon {
  data: {
    initialized: boolean;
    lifecycle?: AddonLifecycle;
  };
}

describe("Zotero lifecycle", function () {
  it("starts only after Zotero is ready", function () {
    const instance = Zotero[config.addonInstance] as unknown as TestAddon;

    assert.isTrue(instance.data.initialized);
    assert.equal(instance.data.lifecycle?.state, "started");
  });
});
