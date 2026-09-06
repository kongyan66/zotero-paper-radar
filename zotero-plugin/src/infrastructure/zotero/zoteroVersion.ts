import { permanentError } from "../../shared/errors.ts";
import { failure, success, type Result } from "../../shared/result.ts";

export interface ZoteroVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly raw: string;
}

export function parseZoteroVersion(version: string): ZoteroVersion | undefined {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (!match) return undefined;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
    raw: version,
  };
}

export function validateZoteroVersion(version: string): Result<ZoteroVersion> {
  const parsed = parseZoteroVersion(version);
  if (parsed?.major === 9) return success(parsed);

  return failure(
    permanentError(
      "zotero.unsupported_version",
      "Zotero Paper Radar requires Zotero 9.x",
      { version: version || null },
    ),
  );
}
