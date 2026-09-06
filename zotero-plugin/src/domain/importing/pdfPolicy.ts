export const DEFAULT_PDF_MAX_BYTES = 100 * 1024 * 1024;
export const MIN_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_MAX_BYTES = 500 * 1024 * 1024;

export type PdfPolicyErrorCode =
  | "pdf-invalid-url"
  | "pdf-insecure-redirect"
  | "pdf-http-error"
  | "pdf-content-type"
  | "pdf-invalid-header"
  | "pdf-too-large"
  | "pdf-empty";

export class PdfPolicyError extends Error {
  readonly code: PdfPolicyErrorCode;

  constructor(code: PdfPolicyErrorCode, message: string) {
    super(message);
    this.name = "PdfPolicyError";
    this.code = code;
  }
}

export function validatePdfURL(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new PdfPolicyError("pdf-invalid-url", "PDF 地址格式无效");
  }
  if (url.protocol !== "https:" || !url.hostname) {
    throw new PdfPolicyError(
      "pdf-invalid-url",
      "远程 PDF 只允许使用 HTTPS 地址",
    );
  }
  url.username = "";
  url.password = "";
  return url.toString();
}

export function validatePdfLimit(maxBytes = DEFAULT_PDF_MAX_BYTES): number {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < MIN_PDF_MAX_BYTES ||
    maxBytes > MAX_PDF_MAX_BYTES
  ) {
    throw new RangeError(
      `PDF 大小上限必须在 ${MIN_PDF_MAX_BYTES} 到 ${MAX_PDF_MAX_BYTES} 字节之间`,
    );
  }
  return maxBytes;
}

export interface PdfResponseMetadata {
  readonly requestedURL: string;
  readonly finalURL?: string;
  readonly status: number;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly maxBytes?: number;
}

export function validatePdfResponse(input: PdfResponseMetadata): void {
  validatePdfURL(input.requestedURL);
  if (input.finalURL) {
    validatePdfURL(input.finalURL);
  }
  const maxBytes = validatePdfLimit(input.maxBytes);
  if (input.status !== 200) {
    throw new PdfPolicyError(
      "pdf-http-error",
      `PDF 服务返回 HTTP ${input.status}`,
    );
  }
  if (!/^application\/pdf(?:\s*;|$)/i.test(input.contentType.trim())) {
    throw new PdfPolicyError(
      "pdf-content-type",
      "PDF 响应的 Content-Type 不是 application/pdf",
    );
  }
  if (!input.bytes.byteLength) {
    throw new PdfPolicyError("pdf-empty", "PDF 响应为空");
  }
  if (input.bytes.byteLength > maxBytes) {
    throw new PdfPolicyError(
      "pdf-too-large",
      `PDF 超过 ${maxBytes} 字节大小上限`,
    );
  }
  if (!hasPdfHeader(input.bytes)) {
    throw new PdfPolicyError("pdf-invalid-header", "下载内容不是有效 PDF 文件");
  }
}

export function hasPdfHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export function pdfFileName(arxivID: string, version: number): string {
  const normalized = arxivID
    .trim()
    .toLowerCase()
    .replace(/v\d+$/, "")
    .replace(/[\\/:]/g, "_");
  const safeVersion = Number.isInteger(version) && version > 0 ? version : 1;
  return `${normalized}v${safeVersion}.pdf`;
}

export function isCandidatePdfFileName(
  fileName: string,
  arxivID: string,
): boolean {
  const base = pdfFileName(arxivID, 1).replace(/v1\.pdf$/, "");
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?:arxiv[-_]?)?${escaped}v?\\d*\\.pdf$`, "i").test(
    fileName.trim(),
  );
}
