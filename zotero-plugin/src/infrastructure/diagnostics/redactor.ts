import { redactSensitiveText, redactURL } from "../network/httpTransport.ts";

export interface RedactionOptions {
  readonly includeSampleContent?: boolean;
}

const SECRET_KEY =
  /(?:api[-_]?key|authorization|password|secret|token|cookie|headers?)/i;
const CONTENT_KEY = /^(?:title|abstract|note|notes|annotation|fulltext|text)$/i;
const PRIVATE_KEY =
  /(?:path|filename|file[_-]?name|collection|folder|directory|(?:zotero|item|member|representative).*key)/i;
const JSON_KEY = /(?:^|_)json$/i;

export function redactDiagnostics<T>(
  value: T,
  options: RedactionOptions = {},
): T | undefined {
  return redactValue(value, options, undefined) as T | undefined;
}

export function redactDiagnosticsText(value: string): string {
  return redactSensitiveText(value).replace(/https?:\/\/[^\s"']+/gi, (url) =>
    redactURL(url),
  );
}

function redactValue(
  value: unknown,
  options: RedactionOptions,
  key: string | undefined,
): unknown {
  if (key && SECRET_KEY.test(key)) return undefined;
  if (key && PRIVATE_KEY.test(key)) return undefined;
  if (key && CONTENT_KEY.test(key) && !options.includeSampleContent) {
    return undefined;
  }
  if (key && JSON_KEY.test(key) && typeof value === "string") {
    return redactJSONText(value, options);
  }
  if (typeof value === "string") {
    return redactDiagnosticsText(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => redactValue(item, options, undefined))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return undefined;
  const result: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    const redacted = redactValue(childValue, options, childKey);
    if (redacted !== undefined) result[childKey] = redacted;
  }
  return result;
}

function redactJSONText(value: string, options: RedactionOptions): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    const redacted = redactValue(parsed, options, undefined);
    return JSON.stringify(redacted);
  } catch {
    return redactDiagnosticsText(value);
  }
}
