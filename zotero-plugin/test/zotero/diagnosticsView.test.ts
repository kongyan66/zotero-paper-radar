import { assert } from "chai";
import { DiagnosticsView } from "../../src/ui/diagnostics/diagnosticsView";

describe("diagnostics view", function () {
  it("renders export, cache, and rebuild commands without exposing content by default", function () {
    const doc = Zotero.getMainWindow()!.document;
    const host = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    const calls: string[] = [];
    const view = new DiagnosticsView(doc, {
      export: (options) => calls.push(`export:${options.includeSampleContent}`),
      clearCache: () => calls.push("clear"),
      rebuildDerivedData: () => calls.push("rebuild"),
    });
    view.mount(host, {
      schemaVersion: 1,
      generatedAt: "2026-08-27T00:00:00Z",
      privacy: {
        sampleContentIncluded: false,
        sampleCandidateLimit: 0,
        redaction: "default",
      },
      environment: {},
      profiles: [],
      recentProfiles: [],
      longTermProfiles: [],
      candidates: [],
      feedback: [],
      operations: [],
      runs: [],
      events: [],
    });
    (
      host.querySelector(
        "[data-action='export-diagnostics']",
      ) as HTMLButtonElement
    ).click();
    (
      host.querySelector("[data-action='clear-cache']") as HTMLButtonElement
    ).click();
    (
      host.querySelector(
        "[data-action='rebuild-derived-data']",
      ) as HTMLButtonElement
    ).click();
    assert.deepEqual(calls, ["export:false", "clear", "rebuild"]);
    assert.exists(host.querySelector("[data-role='include-sample-content']"));
    view.destroy();
    assert.isEmpty(host.children);
  });
});
