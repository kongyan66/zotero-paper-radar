import MiniSearch from "minisearch";
import type { ArxivCandidate } from "../model.ts";
import { stableHash } from "../../shared/stableHash.ts";

export interface CandidatePrefilterResult {
  readonly candidates: readonly ArxivCandidate[];
  readonly selectedBy: Readonly<
    Record<string, "full" | "bm25" | "exploration">
  >;
  readonly usedLexicalPrefilter: boolean;
}

export function prefilterCandidates(
  candidates: readonly ArxivCandidate[],
  options: {
    readonly userKeywords?: readonly string[];
    readonly systemKeywords?: readonly string[];
    readonly seed?: string;
  } = {},
): CandidatePrefilterResult {
  if (candidates.length <= 1000) {
    return {
      candidates: [...candidates],
      selectedBy: Object.fromEntries(
        candidates.map((candidate) => [candidate.arxivId, "full"]),
      ),
      usedLexicalPrefilter: false,
    };
  }
  const documents = candidates.map((candidate) => ({
    id: candidate.arxivId,
    title: candidate.title,
    abstract: candidate.abstract,
  }));
  const index = new MiniSearch({
    fields: ["title", "abstract"],
    storeFields: [],
    idField: "id",
  });
  index.addAll(documents);
  const userTerms = [...(options.userKeywords ?? [])].filter(Boolean);
  const systemTerms = [...(options.systemKeywords ?? [])].filter(Boolean);
  const query = [...userTerms, ...userTerms, ...systemTerms].join(" ") || "*";
  const matches = index.search(query, {
    prefix: true,
    boost: { title: 2 },
    combineWith: "OR",
  });
  const candidateByID = new Map(
    candidates.map((candidate) => [candidate.arxivId, candidate]),
  );
  const chosen = new Set<string>();
  const selectedBy: Record<string, "full" | "bm25" | "exploration"> = {};
  for (const match of matches.slice(0, 800)) {
    if (!candidateByID.has(match.id)) continue;
    chosen.add(match.id);
    selectedBy[match.id] = "bm25";
  }
  const exploration = [...candidates]
    .filter((candidate) => !chosen.has(candidate.arxivId))
    .sort((left, right) =>
      stableHash(
        `${options.seed ?? "candidate-prefilter"}:${left.arxivId}`,
      ).localeCompare(
        stableHash(`${options.seed ?? "candidate-prefilter"}:${right.arxivId}`),
      ),
    )
    .slice(0, 200);
  for (const candidate of exploration) {
    chosen.add(candidate.arxivId);
    selectedBy[candidate.arxivId] = "exploration";
  }
  return {
    candidates: candidates.filter((candidate) => chosen.has(candidate.arxivId)),
    selectedBy,
    usedLexicalPrefilter: true,
  };
}
