import type { ScoreBreakdown } from "../../domain/model.ts";

export function renderScoreDetails(
  doc: Document,
  score: ScoreBreakdown,
): HTMLElement {
  const details = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "details",
  ) as unknown as HTMLElement;
  details.className = "zad-score-details";
  const summary = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "summary",
  ) as unknown as HTMLElement;
  summary.textContent = `解释 · ${Math.round(score.displayScore)}/100`;
  details.appendChild(summary);
  const list = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "dl",
  ) as unknown as HTMLElement;
  const values: readonly [string, number][] = [
    ["近期兴趣", score.recentSimilarity],
    ["长期兴趣", score.longTermSimilarity],
    ["代表论文", score.representativeSimilarity],
    ["关键词", score.keywordMatch],
    ["人工优先级", score.manualPriority],
    ["主题负反馈", score.negativeSimilarity],
  ];
  for (const [label, value] of values) {
    const row = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as unknown as HTMLElement;
    row.className = "zad-score-row";
    const term = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "dt",
    ) as unknown as HTMLElement;
    term.textContent = label;
    const definition = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "dd",
    ) as unknown as HTMLElement;
    definition.textContent = value.toFixed(3);
    row.append(term, definition);
    list.appendChild(row);
  }
  const formula = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "p",
  ) as unknown as HTMLElement;
  formula.className = "zad-score-formula";
  formula.textContent = `原始分 ${score.rawScore.toFixed(3)} · 多样性调整 ${score.diversityAdjustment.toFixed(3)} · 最终分 ${score.rerankedScore.toFixed(3)}`;
  details.append(list, formula);
  return details;
}
