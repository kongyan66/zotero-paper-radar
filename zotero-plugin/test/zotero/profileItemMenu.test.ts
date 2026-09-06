import { assert } from "chai";
import { ProfileItemMenu } from "../../src/infrastructure/zotero/profileItemMenu";

describe("profile item menu", function () {
  it("registers a native menu and disables it for non-paper items", function () {
    const win = Zotero.getMainWindow()!;
    const calls: string[] = [];
    const menu = new ProfileItemMenu({
      onInclude: (item) => calls.push(`include:${item.key}`),
      onExclude: (item) => calls.push(`exclude:${item.key}`),
    });
    menu.register(win);
    assert.isTrue(menu.isRegistered);
    menu.destroy();
    assert.isFalse(menu.isRegistered);
    assert.deepEqual(calls, []);
  });
});
