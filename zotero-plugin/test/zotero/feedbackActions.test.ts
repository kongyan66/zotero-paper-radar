import { assert } from "chai";
import { renderFeedbackActions } from "../../src/ui/recommendations/feedbackActions";

describe("feedback actions", function () {
  it("requires an explicit reason before submitting disinterest", function () {
    const doc = Zotero.getMainWindow()!.document;
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    const actions: string[] = [];
    const root = renderFeedbackActions(doc, {
      onAction: (action) => actions.push(action),
    });
    host.appendChild(root);
    const submit = root.querySelector<HTMLButtonElement>("button:last-child");
    assert.isTrue(Boolean(submit?.disabled));
    const select = root.querySelector<HTMLSelectElement>(
      "[data-role='feedback-reason']",
    )!;
    select.value = "rejected-topic";
    select.dispatchEvent(new Event("change"));
    assert.isFalse(Boolean(submit?.disabled));
    submit?.click();
    assert.deepEqual(actions, ["rejected-topic"]);
  });
});
