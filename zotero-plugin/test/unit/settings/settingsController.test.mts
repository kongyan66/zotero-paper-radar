import assert from "node:assert/strict";
import test from "node:test";
import { createXHTMLOption } from "../../../src/ui/settings/settingsDom.ts";

test("creates settings options in the XHTML namespace for Zotero's mixed document", () => {
  const calls: Array<{ namespace: string; localName: string }> = [];
  const option = { value: "", textContent: "", label: "" };
  const doc = {
    createElementNS(namespace: string, localName: string) {
      calls.push({ namespace, localName });
      return option;
    },
  } as unknown as Document;

  const created = createXHTMLOption(doc);

  assert.equal(created, option);
  assert.deepEqual(calls, [
    { namespace: "http://www.w3.org/1999/xhtml", localName: "option" },
  ]);
});
