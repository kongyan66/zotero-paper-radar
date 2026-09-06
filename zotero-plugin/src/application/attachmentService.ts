import type { ArxivCandidate } from "../domain/model.ts";
import type {
  ImportTaskRecord,
  ImportTaskRepository,
} from "../infrastructure/storage/importTaskRepository.ts";
import {
  PdfAttacher,
  type PdfAttachmentResult,
} from "../infrastructure/zotero/pdfAttacher.ts";

export class AttachmentService {
  readonly #tasks: ImportTaskRepository;
  readonly #attacher: PdfAttacher;

  constructor(tasks: ImportTaskRepository, attacher = new PdfAttacher()) {
    this.#tasks = tasks;
    this.#attacher = attacher;
  }

  async attach(input: {
    readonly taskID: string;
    readonly candidate: ArxivCandidate;
    readonly parentItemID: number;
    readonly libraryID?: number;
    readonly maxBytes?: number;
    readonly signal?: AbortSignal;
    readonly onProgress?: (receivedBytes: number, totalBytes?: number) => void;
  }): Promise<PdfAttachmentResult> {
    const task = await this.requireCompletedCore(input.taskID);
    if (task.attachmentStatus === "completed") {
      const existing = await this.#attacher.findExisting(
        input.parentItemID,
        input.candidate.arxivId,
      );
      if (existing) {
        return {
          attachment: existing,
          created: false,
          downloaded: false,
          sizeBytes: 0,
          latencyMs: 0,
        };
      }
    }

    await this.#tasks.update(input.taskID, {
      attachmentStatus: "running",
      errorCode: null,
    });
    try {
      const result = await this.#attacher.attach(input);
      await this.#tasks.update(input.taskID, {
        attachmentStatus: "completed",
        errorCode: null,
      });
      return result;
    } catch (error) {
      await this.#tasks.update(input.taskID, {
        attachmentStatus: "failed",
        errorCode: errorCode(error),
      });
      throw error;
    }
  }

  private async requireCompletedCore(
    taskID: string,
  ): Promise<ImportTaskRecord> {
    const task = await this.#tasks.get(taskID);
    if (!task) throw new Error(`未知入库任务 ${taskID}`);
    if (task.coreStatus !== "completed" || !task.zoteroItemKey) {
      throw new Error("元数据入库尚未完成，不能下载 PDF");
    }
    return task;
  }
}

function errorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return "pdf-download-failed";
}
