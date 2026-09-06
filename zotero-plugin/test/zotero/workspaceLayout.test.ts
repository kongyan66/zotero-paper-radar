import { assert } from "chai";
import {
  TASK_CENTER_MAX_WIDTH,
  TASK_CENTER_MIN_WIDTH,
  WorkspaceLayoutController,
} from "../../src/ui/recommendations/workspaceLayoutController";
import { TASK_CENTER_COLLAPSE_EVENT } from "../../src/ui/tasks/taskCenter";

describe("workspace layout controller", function () {
  it("resizes the task pane with pointer and keyboard input", function () {
    const doc = Zotero.getMainWindow()!.document;
    const content = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    const taskCenter = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "section",
    ) as unknown as HTMLElement;
    const diagnostics = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    content.append(taskCenter, diagnostics);
    const layout = new WorkspaceLayoutController(doc);
    layout.mount(content, taskCenter, diagnostics as unknown as HTMLElement);
    const handle = content.querySelector<HTMLElement>(
      "[data-role='task-center-resize']",
    )!;

    assert.equal(handle.getAttribute("role"), "separator");
    assert.equal(handle.getAttribute("aria-valuenow"), "320");
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    assert.equal(
      content.style.getPropertyValue("--zad-task-center-width"),
      "336px",
    );
    assert.equal(handle.getAttribute("aria-valuenow"), "336");
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    assert.equal(
      handle.getAttribute("aria-valuenow"),
      String(TASK_CENTER_MIN_WIDTH),
    );
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    assert.equal(
      handle.getAttribute("aria-valuenow"),
      String(TASK_CENTER_MAX_WIDTH),
    );

    handle.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 500 }),
    );
    doc.dispatchEvent(new MouseEvent("pointermove", { clientX: 1_000 }));
    doc.dispatchEvent(new MouseEvent("pointerup", { clientX: 1_000 }));
    assert.equal(
      handle.getAttribute("aria-valuenow"),
      String(TASK_CENTER_MIN_WIDTH),
    );

    handle.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 500 }),
    );
    doc.dispatchEvent(new MouseEvent("pointermove", { clientX: 1 }));
    doc.dispatchEvent(new MouseEvent("pointerup", { clientX: 1 }));
    assert.equal(
      handle.getAttribute("aria-valuenow"),
      String(TASK_CENTER_MAX_WIDTH),
    );
    assert.notExists(content.getAttribute("data-resizing"));
    layout.destroy();
    assert.notExists(content.querySelector("[data-role='task-center-resize']"));
    assert.equal(content.style.getPropertyValue("--zad-task-center-width"), "");
  });

  it("collapses the task pane without removing the task rail", function () {
    const doc = Zotero.getMainWindow()!.document;
    const content = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    const taskCenter = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "section",
    ) as unknown as HTMLElement;
    const diagnostics = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as unknown as HTMLElement;
    content.append(taskCenter, diagnostics);
    const layout = new WorkspaceLayoutController(doc);
    layout.mount(content, taskCenter, diagnostics);
    const handle = content.querySelector<HTMLElement>(
      "[data-role='task-center-resize']",
    )!;
    taskCenter.dataset.collapsed = "true";
    taskCenter.dispatchEvent(new Event(TASK_CENTER_COLLAPSE_EVENT));
    assert.equal(content.dataset.taskCollapsed, "true");
    assert.equal(handle.getAttribute("aria-hidden"), "true");
    assert.equal(handle.getAttribute("tabindex"), "-1");
    layout.destroy();
  });
});
