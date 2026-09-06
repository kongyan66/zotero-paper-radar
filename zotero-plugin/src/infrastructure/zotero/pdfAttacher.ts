import type { ArxivCandidate } from "../../domain/model.ts";
import {
  isCandidatePdfFileName,
  pdfFileName,
  validatePdfResponse,
  validatePdfURL,
  validatePdfLimit,
  type PdfPolicyError,
} from "../../domain/importing/pdfPolicy.ts";
import {
  HttpTransport,
  NetworkRequestError,
} from "../network/httpTransport.ts";

export interface ExistingPdfAttachment {
  readonly item: Zotero.Item;
  readonly fileName: string;
}

export interface PdfAttacherRuntime {
  listChildAttachments(
    parentItemID: number,
  ): Promise<readonly ExistingPdfAttachment[]>;
  writeTemporary(path: string, bytes: Uint8Array): Promise<void>;
  removeTemporary(path: string): Promise<void>;
  importFromFile(options: {
    readonly file: string;
    readonly parentItemID: number;
    readonly libraryID: number;
    readonly title: string;
    readonly fileBaseName: string;
    readonly contentType: "application/pdf";
  }): Promise<Zotero.Item>;
}

export interface PdfAttachmentResult {
  readonly attachment: Zotero.Item;
  readonly created: boolean;
  readonly downloaded: boolean;
  readonly sizeBytes: number;
  readonly latencyMs: number;
}

export class PdfAttachmentError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = "PdfAttachmentError";
    this.code = code;
  }
}

export class PdfAttacher {
  readonly #transport: HttpTransport;
  readonly #runtime: PdfAttacherRuntime;

  constructor(
    options: {
      readonly transport?: HttpTransport;
      readonly runtime?: PdfAttacherRuntime;
    } = {},
  ) {
    this.#transport =
      options.transport ??
      new HttpTransport({ defaultMaxResponseBytes: 100 * 1024 * 1024 });
    this.#runtime = options.runtime ?? zoteroRuntime();
  }

  async attach(input: {
    readonly candidate: ArxivCandidate;
    readonly parentItemID: number;
    readonly libraryID?: number;
    readonly maxBytes?: number;
    readonly signal?: AbortSignal;
    readonly onProgress?: (receivedBytes: number, totalBytes?: number) => void;
  }): Promise<PdfAttachmentResult> {
    const existing = await this.findExisting(
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

    const requestedURL = validatePdfURL(input.candidate.pdfUrl);
    const maxBytes = validatePdfLimit(input.maxBytes);
    const response = await this.download(requestedURL, maxBytes, input);
    validatePdfResponse({
      requestedURL,
      finalURL: response.finalURL,
      status: response.status,
      contentType: response.contentType,
      bytes: response.data,
      maxBytes,
    });

    const fileName = pdfFileName(
      input.candidate.arxivId,
      input.candidate.version,
    );
    const temporaryPath = PathUtils.join(
      PathUtils.tempDir,
      `zotero-arxiv-daily-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`,
    );
    await this.#runtime.writeTemporary(temporaryPath, response.data);
    try {
      const attachment = await this.#runtime.importFromFile({
        file: temporaryPath,
        parentItemID: input.parentItemID,
        libraryID: input.libraryID ?? Zotero.Libraries.userLibraryID,
        title: input.candidate.title,
        fileBaseName: fileName.replace(/\.pdf$/i, ""),
        contentType: "application/pdf",
      });
      if (!attachment?.key) {
        throw new PdfAttachmentError(
          "pdf-import-failed",
          "Zotero 未能创建 PDF 子附件",
        );
      }
      return {
        attachment,
        created: true,
        downloaded: true,
        sizeBytes: response.data.byteLength,
        latencyMs: response.latencyMs,
      };
    } finally {
      await this.#runtime.removeTemporary(temporaryPath);
    }
  }

  async findExisting(
    parentItemID: number,
    arxivID: string,
  ): Promise<Zotero.Item | undefined> {
    const attachments = await this.#runtime.listChildAttachments(parentItemID);
    return attachments.find((attachment) =>
      isCandidatePdfFileName(attachment.fileName, arxivID),
    )?.item;
  }

  private async download(
    url: string,
    maxBytes: number,
    input: {
      readonly signal?: AbortSignal;
      readonly onProgress?: (
        receivedBytes: number,
        totalBytes?: number,
      ) => void;
    },
  ) {
    try {
      return await this.#transport.requestBytes({
        url,
        maxResponseBytes: maxBytes,
        signal: input.signal,
        onProgress: input.onProgress,
      });
    } catch (error) {
      if (error instanceof PdfAttachmentError || isPdfPolicyError(error))
        throw error;
      if (error instanceof NetworkRequestError) {
        throw new PdfAttachmentError(`pdf-${error.code}`, error.message, {
          cause: error,
        });
      }
      throw new PdfAttachmentError("pdf-download-failed", "PDF 下载失败", {
        cause: error,
      });
    }
  }
}

function zoteroRuntime(): PdfAttacherRuntime {
  return {
    listChildAttachments: async (parentItemID) => {
      const parent = Zotero.Items.get(parentItemID);
      if (!parent) throw new Error(`找不到 Zotero 条目 ${parentItemID}`);
      const attachments = await Zotero.Items.getAsync(parent.getAttachments());
      return attachments
        .filter((item) => item?.isAttachment())
        .map((item) => ({
          item,
          fileName: String(item.attachmentFilename || ""),
        }));
    },
    writeTemporary: (path, bytes) =>
      IOUtils.write(path, bytes, { flush: true }).then(() => undefined),
    removeTemporary: async (path) => {
      if (await IOUtils.exists(path)) await IOUtils.remove(path);
    },
    importFromFile: (options) => Zotero.Attachments.importFromFile(options),
  };
}

function isPdfPolicyError(error: unknown): error is PdfPolicyError {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    String((error as { code?: unknown }).code).startsWith("pdf-"),
  );
}
