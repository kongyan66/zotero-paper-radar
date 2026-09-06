import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PDF_MAX_BYTES,
  MIN_PDF_MAX_BYTES,
  hasPdfHeader,
  isCandidatePdfFileName,
  validatePdfLimit,
  validatePdfResponse,
  validatePdfURL,
} from "../../../src/domain/importing/pdfPolicy.ts";

const validBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

test("PDF policy accepts HTTPS and rejects all HTTP URLs, including localhost", () => {
  assert.equal(
    validatePdfURL("https://arxiv.org/pdf/2608.24845.pdf"),
    "https://arxiv.org/pdf/2608.24845.pdf",
  );
  assert.throws(
    () => validatePdfURL("http://localhost:8080/paper.pdf"),
    /HTTPS/,
  );
});

test("PDF response requires status, content type, header, and size", () => {
  assert.doesNotThrow(() =>
    validatePdfResponse({
      requestedURL: "https://arxiv.org/pdf/2608.24845.pdf",
      finalURL: "https://export.arxiv.org/pdf/2608.24845.pdf",
      status: 200,
      contentType: "application/pdf; charset=binary",
      bytes: validBytes,
    }),
  );
  assert.throws(
    () =>
      validatePdfResponse({
        requestedURL: "https://arxiv.org/paper",
        status: 200,
        contentType: "text/html",
        bytes: validBytes,
      }),
    /Content-Type/,
  );
  assert.throws(
    () =>
      validatePdfResponse({
        requestedURL: "https://arxiv.org/paper",
        status: 200,
        contentType: "application/pdf",
        bytes: Uint8Array.from([1, 2, 3]),
      }),
    /有效 PDF/,
  );
  assert.throws(
    () =>
      validatePdfResponse({
        requestedURL: "https://arxiv.org/paper",
        finalURL: "http://arxiv.org/paper",
        status: 200,
        contentType: "application/pdf",
        bytes: validBytes,
      }),
    /HTTPS/,
  );
});

test("PDF limit is bounded and filenames recognize versioned arXiv attachments", () => {
  assert.equal(validatePdfLimit(), DEFAULT_PDF_MAX_BYTES);
  assert.throws(() => validatePdfLimit(MIN_PDF_MAX_BYTES - 1), /大小上限/);
  assert.equal(hasPdfHeader(validBytes), true);
  assert.equal(hasPdfHeader(Uint8Array.from([0x25, 0x50])), false);
  assert.equal(isCandidatePdfFileName("2608.24845v2.pdf", "2608.24845"), true);
  assert.equal(
    isCandidatePdfFileName("arxiv-2608.24845.pdf", "2608.24845v2"),
    true,
  );
  assert.equal(isCandidatePdfFileName("2608.24846.pdf", "2608.24845"), false);
});
