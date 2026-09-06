import { assert } from "chai";
import { ProfileEditorView } from "../../src/ui/profiles/profileEditorView";

describe("profile editor view", function () {
  it("hides disabled profiles and exposes explainability fields", function () {
    const doc =
      Zotero.getMainWindow()!.document.implementation.createHTMLDocument(
        "profile-editor",
      );
    const parent = doc.createElement("div");
    doc.body.appendChild(parent);
    const view = new ProfileEditorView(doc);
    view.mount(parent, [
      {
        lineageId: "doc",
        name: "Document AI",
        horizon: "long-term",
        keywords: ["OCR"],
        memberCount: 10,
        confidence: 0.91,
        stability: 0.84,
        collectionShare: 0.7,
        representativeItemKeys: ["DOC1"],
        disabled: false,
      },
      {
        lineageId: "hidden",
        name: "Hidden",
        horizon: "recent",
        keywords: ["x"],
        memberCount: 2,
        confidence: 0.2,
        stability: 0.2,
        collectionShare: 0.2,
        representativeItemKeys: [],
        disabled: true,
      },
    ]);

    assert.include(parent.textContent, "Document AI");
    assert.notInclude(parent.textContent, "Hidden");
    assert.include(parent.textContent, "OCR");
    assert.include(parent.textContent, "91%");
    assert.include(parent.textContent, "近期 1 · 长期 1");
    assert.exists(parent.querySelector('[data-action="edit-profile"]'));
    const profileDetails = parent.querySelector(
      "details",
    )! as HTMLDetailsElement;
    const summary = profileDetails.querySelector("summary")!;
    const toggle = parent.querySelector<HTMLButtonElement>(
      "[data-action='toggle-profiles']",
    )!;
    assert.isFalse(profileDetails.open);
    assert.equal(toggle.textContent, "展开");
    toggle.click();
    assert.isTrue(profileDetails.open);
    assert.equal(toggle.textContent, "收起");
    toggle.click();
    assert.isFalse(profileDetails.open);
    summary.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.isTrue(profileDetails.open);
    summary.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.isFalse(profileDetails.open);
    view.destroy();
    assert.equal(parent.children.length, 0);
  });

  it("exposes confirmed structure-operation entry points", function () {
    const doc =
      Zotero.getMainWindow()!.document.implementation.createHTMLDocument(
        "profile-structure-actions",
      );
    const parent = doc.createElement("div");
    const view = new ProfileEditorView(doc);
    view.mount(parent, [], {
      actions: {
        onMerge: () => undefined,
        onSplit: () => undefined,
        onRollback: () => undefined,
      },
    });
    assert.exists(parent.querySelector('[data-action="merge-profiles"]'));
    assert.exists(parent.querySelector('[data-action="split-profile"]'));
    assert.exists(parent.querySelector('[data-action="rollback-profile"]'));
    view.destroy();
  });
});
