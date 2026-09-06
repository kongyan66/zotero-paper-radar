import {
  normalizeArxivIdentity,
  normalizeBibliographicURL,
  normalizeDoiIdentity,
  titleYearIdentity,
  type BibliographicIdentity,
} from "../../domain/importing/bibliographicNormalization.ts";

export type DuplicateMatchKind = "arxiv-id" | "doi" | "url" | "title-year";

export interface ExistingBibliographicItem extends BibliographicIdentity {
  readonly itemKey: string;
}

export interface DuplicateMatch {
  readonly itemKey: string;
  readonly kind: DuplicateMatchKind;
}

export type DuplicateDetectionResult =
  | { readonly status: "none" }
  | { readonly status: "match"; readonly match: DuplicateMatch }
  | {
      readonly status: "conflict";
      readonly matches: readonly DuplicateMatch[];
    };

export function detectDuplicate(
  candidate: BibliographicIdentity,
  existing: readonly ExistingBibliographicItem[],
): DuplicateDetectionResult {
  const levels: readonly [
    DuplicateMatchKind,
    (identity: BibliographicIdentity) => string | undefined,
  ][] = [
    ["arxiv-id", (identity) => normalizeArxivIdentity(identity.arxivID)],
    ["doi", (identity) => normalizeDoiIdentity(identity.doi)],
    ["url", (identity) => normalizeBibliographicURL(identity.url)],
    [
      "title-year",
      (identity) => titleYearIdentity(identity.title, identity.date),
    ],
  ];
  for (const [kind, key] of levels) {
    const candidateKey = key(candidate);
    if (!candidateKey) continue;
    const matches = existing
      .filter((item) => key(item) === candidateKey)
      .map((item) => ({ itemKey: item.itemKey, kind }));
    if (matches.length === 1) return { status: "match", match: matches[0] };
    if (matches.length > 1) return { status: "conflict", matches };
  }
  return { status: "none" };
}

export class ZoteroDuplicateDetector {
  async find(
    candidate: BibliographicIdentity,
    libraryID = Zotero.Libraries.userLibraryID,
  ): Promise<DuplicateDetectionResult> {
    const items = (await Zotero.Items.getAll(libraryID, false, false))
      .filter((item) => !item.isAttachment() && !item.isNote())
      .map((item) => ({
        itemKey: item.key,
        arxivID: String(item.getField("archiveID", false, true) || ""),
        doi: String(item.getField("DOI", false, true) || ""),
        url: String(item.getField("url", false, true) || ""),
        title: String(item.getField("title", false, true) || ""),
        date: String(item.getField("date", false, true) || ""),
      }));
    return detectDuplicate(candidate, items);
  }
}
