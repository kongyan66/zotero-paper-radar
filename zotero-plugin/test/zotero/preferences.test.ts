import { assert } from "chai";
import { config } from "../../package.json";

interface PreferencesTestAddon {
  data: {
    preferencesPaneID?: string;
  };
}

describe("plugin preferences", function () {
  it("registers a Zotero 9 preference pane with the model setup UI", function () {
    const instance = Zotero[
      config.addonInstance
    ] as unknown as PreferencesTestAddon;
    const paneID = instance.data.preferencesPaneID;
    assert.equal(paneID, `${config.addonRef}-preferences`);
    const pane = Zotero.PreferencePanes.pluginPanes.find(
      (candidate) => candidate.id === paneID,
    );
    assert.exists(pane);
    assert.match(pane!.src, /content\/preferences\.xhtml$/);
  });

  it("ships independent embedding and optional LLM preferences", function () {
    const prefix = config.prefsPrefix;
    assert.equal(
      Zotero.Prefs.get(`${prefix}.embeddingProvider`, true),
      "openai-compatible",
    );
    assert.isString(Zotero.Prefs.get(`${prefix}.embeddingBaseURL`, true));
    assert.isString(Zotero.Prefs.get(`${prefix}.embeddingModel`, true));
    assert.isBoolean(Zotero.Prefs.get(`${prefix}.llmEnabled`, true));
    assert.equal(
      Zotero.Prefs.get(`${prefix}.llmProvider`, true),
      "openai-compatible",
    );
    assert.isString(Zotero.Prefs.get(`${prefix}.llmBaseURL`, true));
    assert.equal(
      Zotero.Prefs.get(`${prefix}.arxivCategories`, true),
      "cs.CV,cs.CL",
    );
    assert.isAtLeast(
      Number(Zotero.Prefs.get(`${prefix}.networkTimeoutMs`, true)),
      1_000,
    );
  });
});
