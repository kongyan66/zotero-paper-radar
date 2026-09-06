import assert from "node:assert/strict";
import test from "node:test";
import { AttachmentService } from "../../../src/application/attachmentService.ts";
import { PdfAttachmentError } from "../../../src/infrastructure/zotero/pdfAttacher.ts";
import type { ImportTaskRecord } from "../../../src/infrastructure/storage/importTaskRepository.ts";

test("PDF failure preserves completed core import and marks only attachment failed", async () => {
  let task: ImportTaskRecord = {
    taskID: "import-1",
    stableIntentKey: "arxiv:2608.24845:save",
    arxivID: "2608.24845",
    coreStatus: "completed",
    attachmentStatus: "not-requested",
    zoteroItemKey: "ITEM1",
    createdAt: "2026-08-27T00:00:00Z",
    updatedAt: "2026-08-27T00:00:00Z",
  };
  const attachmentStates: string[] = [];
  const tasks = {
    get: async () => task,
    update: async (_taskID: string, patch: Partial<ImportTaskRecord>) => {
      if (patch.attachmentStatus) attachmentStates.push(patch.attachmentStatus);
      task = { ...task, ...patch, updatedAt: "2026-08-27T00:00:01Z" };
      return task;
    },
  };
  const attacher = {
    findExisting: async () => undefined,
    attach: async () => {
      throw new PdfAttachmentError(
        "pdf-invalid-header",
        "下载内容不是有效 PDF 文件",
      );
    },
  };
  const service = new AttachmentService(tasks, attacher as never);

  await assert.rejects(
    service.attach({
      taskID: "import-1",
      candidate: {
        arxivId: "2608.24845",
        version: 1,
        title: "Title",
        abstract: "Abstract",
        authors: [],
        categories: ["cs.CV"],
        submittedAt: "2026-08-27T00:00:00Z",
        abstractUrl: "https://arxiv.org/abs/2608.24845",
        pdfUrl: "https://arxiv.org/pdf/2608.24845.pdf",
      },
      parentItemID: 1,
    }),
    /有效 PDF/,
  );
  assert.deepEqual(attachmentStates, ["running", "failed"]);
  assert.equal(task.coreStatus, "completed");
  assert.equal(task.zoteroItemKey, "ITEM1");
  assert.equal(task.attachmentStatus, "failed");
});
