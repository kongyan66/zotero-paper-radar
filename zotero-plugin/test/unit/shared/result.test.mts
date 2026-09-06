import assert from "node:assert/strict";
import test from "node:test";
import {
  configurationError,
  permanentError,
  retryableError,
} from "../../../src/shared/errors.ts";
import { failure, success } from "../../../src/shared/result.ts";

test("Result represents successful values", () => {
  assert.deepEqual(success({ count: 3 }), {
    ok: true,
    value: { count: 3 },
  });
});

test("Result distinguishes retryable, configuration, and permanent errors", () => {
  const retryable = failure(
    retryableError("network.timeout", "The model request timed out", {
      attempt: 2,
    }),
  );
  const configuration = failure(
    configurationError("model.api_key_missing", "Configure an API key"),
  );
  const permanent = failure(
    permanentError("arxiv.invalid_id", "The arXiv identifier is invalid"),
  );

  assert.equal(retryable.error.kind, "retryable");
  assert.equal(retryable.error.retryable, true);
  assert.deepEqual(retryable.error.debugContext, { attempt: 2 });
  assert.equal(configuration.error.kind, "configuration");
  assert.equal(configuration.error.retryable, false);
  assert.equal(permanent.error.kind, "permanent");
  assert.equal(permanent.error.retryable, false);
});
