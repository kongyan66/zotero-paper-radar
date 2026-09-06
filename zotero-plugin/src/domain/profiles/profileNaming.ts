import type { ZoteroPaper } from "../model.ts";
import { cosineSimilarity } from "./vectorMath.ts";

export interface ProfileNamingMember {
  readonly paper: ZoteroPaper;
  readonly vector: readonly number[];
}

export interface ProfileNamingResult {
  readonly systemName: string;
  readonly keywords: readonly string[];
  readonly representativeItemKeys: readonly string[];
  readonly phraseScores: Readonly<Record<string, number>>;
}

interface DomainRule {
  readonly name: string;
  readonly keywords: readonly string[];
  readonly patterns: readonly RegExp[];
}

const GENERIC_TERMS = new Set([
  "performance",
  "performances",
  "collection",
  "collections",
  "method",
  "methods",
  "study",
  "studies",
  "paper",
  "papers",
  "task",
  "tasks",
  "model",
  "models",
  "training",
  "technical",
  "report",
  "approach",
  "problem",
  "problems",
  "using",
  "based",
  "with",
  "from",
  "and",
  "the",
  "for",
]);

const DOMAIN_RULES: readonly DomainRule[] = [
  {
    name: "Document AI / PDF Parsing / OCR",
    keywords: ["document parsing", "PDF parsing", "OCR", "document AI"],
    patterns: [
      /document (?:parsing|understanding|intelligence)/i,
      /pdf (?:parsing|document)/i,
      /\bocr\b/i,
      /layout (?:analysis|understanding)/i,
      /scene text recognition/i,
    ],
  },
  {
    name: "Depth Estimation / 3D Vision",
    keywords: [
      "depth estimation",
      "3D vision",
      "monocular depth",
      "depth completion",
    ],
    patterns: [
      /depth (?:estimation|prediction|completion)/i,
      /monocular depth/i,
      /\b3d vision\b/i,
      /point cloud/i,
    ],
  },
  {
    name: "Long-tail Recognition / Noisy Labels",
    keywords: [
      "long-tail learning",
      "noisy labels",
      "class imbalance",
      "label noise",
    ],
    patterns: [
      /long[- ]tail(?:ed)?/i,
      /noisy labels?/i,
      /label noise/i,
      /class imbalance/i,
      /label refurbishment/i,
    ],
  },
  {
    name: "Vision-Language Models / Multimodal AI",
    keywords: [
      "vision-language models",
      "multimodal learning",
      "visual reasoning",
      "VLM",
    ],
    patterns: [
      /vision[- ]language/i,
      /multimodal/i,
      /visual reasoning/i,
      /\bvlm\b/i,
    ],
  },
  {
    name: "Large Language Models / Retrieval-Augmented Generation",
    keywords: [
      "large language models",
      "LLM",
      "retrieval-augmented generation",
      "RAG",
    ],
    patterns: [
      /large language models?/i,
      /\bllms?\b/i,
      /retrieval[- ]augmented generation/i,
      /\brag\b/i,
    ],
  },
];

export function nameProfile(
  members: readonly ProfileNamingMember[],
  centroid: readonly number[],
): ProfileNamingResult {
  if (members.length === 0) throw new Error("Cannot name an empty profile");
  const corpus = members
    .map(({ paper }) => [paper.title, paper.abstract, ...paper.tags].join(" "))
    .join(" ");
  const phraseScores = scorePhrases(corpus, members);
  const domain = chooseDomain(corpus);
  const fallbackKeywords = Object.entries(phraseScores)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, 5)
    .map(([phrase]) => phrase);
  const keywords = unique(domain?.keywords ?? fallbackKeywords).slice(0, 5);
  const systemName =
    domain?.name ??
    (keywords.length
      ? keywords.slice(0, 3).map(titleCase).join(" / ")
      : "Other Research Interests");
  const representativeItemKeys = [...members]
    .sort(
      (left, right) =>
        cosineSimilarity(right.vector, centroid) -
          cosineSimilarity(left.vector, centroid) ||
        left.paper.itemKey.localeCompare(right.paper.itemKey),
    )
    .slice(0, 3)
    .map(({ paper }) => paper.itemKey);
  return { systemName, keywords, representativeItemKeys, phraseScores };
}

function chooseDomain(corpus: string): DomainRule | undefined {
  return DOMAIN_RULES.map((rule) => ({
    rule,
    score: rule.patterns.reduce(
      (sum, pattern) => sum + (pattern.test(corpus) ? 1 : 0),
      0,
    ),
  }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.rule.name.localeCompare(right.rule.name),
    )[0]?.rule;
}

function scorePhrases(
  corpus: string,
  members: readonly ProfileNamingMember[],
): Readonly<Record<string, number>> {
  const scores = new Map<string, number>();
  const words = corpus.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  for (const word of words) {
    if (GENERIC_TERMS.has(word)) continue;
    scores.set(word, (scores.get(word) ?? 0) + 1);
  }
  for (const { paper } of members) {
    for (const tag of paper.tags) {
      const normalized = tag.toLowerCase().replace(/\s+/g, " ").trim();
      if (!normalized || GENERIC_TERMS.has(normalized)) continue;
      scores.set(normalized, (scores.get(normalized) ?? 0) + 3);
    }
  }
  return Object.fromEntries(
    [...scores].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}
