import { assert } from "chai";
import { config } from "../../package.json";
import type { RecommendationWorkspaceController } from "../../src/ui/recommendations/recommendationWorkspace";

interface WorkspaceTestAddon {
  data: {
    workspaceController?: RecommendationWorkspaceController;
  };
}

const WORKSPACE_TAB_ID = `${config.addonRef}-workspace-tab`;

describe("recommendation workspace tab", function () {
  afterEach(async function () {
    const win = Zotero.getMainWindow();
    if (win?.Zotero_Tabs._tabs.some((tab) => tab.id === WORKSPACE_TAB_ID)) {
      win.Zotero_Tabs.close(WORKSPACE_TAB_ID);
      await Zotero.Promise.delay(25);
    }
  });

  it("does not open automatically and reuses a fixed tab", function () {
    const win = Zotero.getMainWindow();
    const instance = Zotero[
      config.addonInstance
    ] as unknown as WorkspaceTestAddon;
    assert.exists(win);
    assert.exists(instance.data.workspaceController);
    assert.notExists(win?.document.getElementById(WORKSPACE_TAB_ID));

    const first = instance.data.workspaceController!.open(win!);
    const second = instance.data.workspaceController!.open(win!);
    const matchingTabs = win?.Zotero_Tabs._tabs.filter(
      (tab) => tab.id === WORKSPACE_TAB_ID,
    );

    assert.equal(first, WORKSPACE_TAB_ID);
    assert.equal(second, WORKSPACE_TAB_ID);
    assert.lengthOf(matchingTabs || [], 1);
    assert.equal(win?.Zotero_Tabs.selectedID, WORKSPACE_TAB_ID);
    assert.exists(win?.document.getElementById(`${WORKSPACE_TAB_ID}-root`));
  });

  it("does not issue HTTP requests while opening the cached shell", function () {
    const win = Zotero.getMainWindow();
    const instance = Zotero[
      config.addonInstance
    ] as unknown as WorkspaceTestAddon;
    assert.exists(instance.data.workspaceController);
    const originalRequest = Zotero.HTTP.request;
    let requestCount = 0;
    Zotero.HTTP.request = ((..._args: unknown[]) => {
      requestCount += 1;
      throw new Error("Unexpected HTTP request");
    }) as typeof Zotero.HTTP.request;

    try {
      instance.data.workspaceController!.open(win!);
      assert.equal(requestCount, 0);
    } finally {
      Zotero.HTTP.request = originalRequest;
    }
  });

  it("removes workspace DOM when the tab closes", function () {
    const win = Zotero.getMainWindow();
    const instance = Zotero[
      config.addonInstance
    ] as unknown as WorkspaceTestAddon;
    assert.exists(instance.data.workspaceController);
    instance.data.workspaceController!.open(win!);

    win?.Zotero_Tabs.close(WORKSPACE_TAB_ID);

    assert.notExists(win?.document.getElementById(`${WORKSPACE_TAB_ID}-root`));
  });
});
