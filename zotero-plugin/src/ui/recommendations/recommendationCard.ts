import type { ArxivCandidate, ScoreBreakdown } from "../../domain/model.ts";
import type { RecommendationFeedbackAction } from "../../domain/feedback/feedbackPolicy.ts";
import { renderScoreDetails } from "./scoreDetails.ts";

export interface RecommendationCardModel {
  readonly candidate: ArxivCandidate;
  readonly score: ScoreBreakdown;
  readonly profileName?: string;
  readonly profileID?: string;
  readonly profileLineageID?: string;
  readonly profileVersionID: string;
  readonly keywords: readonly string[];
  readonly representatives: readonly {
    readonly title: string;
    readonly similarity: number;
  }[];
  readonly summary?: {
    readonly text: string;
    readonly source: "arxiv" | "llm-cache" | "llm";
    readonly fallbackReason?: string;
  };
  readonly runID?: string;
  readonly rank?: number;
  readonly onSave?: () => void | Promise<void>;
  readonly onDefer?: () => void | Promise<void>;
  readonly onReject?: (
    action: Extract<
      RecommendationFeedbackAction,
      "rejected-topic" | "already-read" | "duplicate"
    >,
  ) => void | Promise<void>;
  readonly onRejectTopic?: () => void | Promise<void>;
}

export function renderRecommendationCard(
  doc: Document,
  model: RecommendationCardModel,
): HTMLElement {
  const article = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "article",
  ) as unknown as HTMLElement;
  article.className = "zad-recommendation-card";
  article.setAttribute("data-arxiv-id", model.candidate.arxivId);
  const headingRow = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  headingRow.className = "zad-card-heading-row";
  const heading = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "h3",
  ) as unknown as HTMLElement;
  heading.textContent = model.candidate.title;
  const score = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span",
  ) as unknown as HTMLElement;
  score.className = "zad-card-score";
  const displayScore = Math.round(
    Math.max(0, Math.min(100, model.score.displayScore)),
  );
  score.dataset.scoreBand =
    displayScore >= 80 ? "high" : displayScore < 50 ? "low" : "medium";
  score.textContent = `相关度 ${displayScore}/100`;
  score.title = "综合近期兴趣、长期兴趣、关键词和代表论文相似度计算";
  headingRow.append(heading, score);
  const metadata = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  metadata.className = "zad-card-metadata";
  metadata.textContent = `${model.candidate.authors.join(", ") || "作者未提供"} · arXiv ${model.candidate.arxivId}v${model.candidate.version}`;
  const match = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "p",
  ) as unknown as HTMLElement;
  match.className = "zad-card-match";
  match.textContent = model.profileName
    ? `命中画像：${model.profileName}`
    : "未匹配到已选画像";
  const keywordLine = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "p",
  ) as unknown as HTMLElement;
  keywordLine.className = "zad-card-keywords";
  keywordLine.textContent = model.keywords.length
    ? `关键词：${model.keywords.join("、")}`
    : "关键词：无直接命中";
  const representatives = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "p",
  ) as unknown as HTMLElement;
  representatives.className = "zad-card-representatives";
  representatives.textContent = model.representatives.length
    ? `代表论文：${model.representatives.map((item) => `${item.title} (${item.similarity.toFixed(2)})`).join("；")}`
    : "代表论文：暂无";
  const abstract = model.summary
    ? renderSummary(doc, model)
    : (() => {
        const original = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "p",
        ) as unknown as HTMLElement;
        original.className = "zad-card-abstract";
        original.textContent = model.candidate.abstract;
        return original;
      })();
  const version = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "p",
  ) as unknown as HTMLElement;
  version.className = "zad-card-version";
  version.textContent = `画像版本：${model.profileVersionID}`;
  const actions = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  actions.className = "zad-card-actions";
  appendAction(doc, actions, "保存到 Zotero", model.onSave);
  appendAction(doc, actions, "稍后", model.onDefer);
  if (model.onReject) {
    actions.appendChild(renderRejectControl(doc, model.onReject));
  } else {
    appendAction(doc, actions, "主题不相关", model.onRejectTopic);
  }
  const pdf = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "a",
  ) as unknown as HTMLAnchorElement;
  pdf.className = "zad-secondary-command";
  pdf.href = model.candidate.pdfUrl;
  pdf.target = "_blank";
  pdf.rel = "noreferrer";
  pdf.textContent = "PDF";
  actions.appendChild(pdf);
  article.append(
    headingRow,
    metadata,
    match,
    keywordLine,
    representatives,
    abstract,
    version,
    renderScoreDetails(doc, model.score),
    actions,
  );
  return article;
}

function renderRejectControl(
  doc: Document,
  callback: (
    action: Extract<
      RecommendationFeedbackAction,
      "rejected-topic" | "already-read" | "duplicate"
    >,
  ) => void | Promise<void>,
): HTMLElement {
  const wrapper = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span",
  ) as unknown as HTMLElement;
  wrapper.className = "zad-reject-control";
  const select = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "select",
  ) as unknown as HTMLSelectElement;
  select.title = "选择不感兴趣原因";
  const placeholder = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "option",
  ) as unknown as HTMLOptionElement;
  placeholder.value = "";
  placeholder.textContent = "不感兴趣原因";
  placeholder.selected = true;
  select.appendChild(placeholder);
  const reasons = [
    ["rejected-topic", "主题不相关"],
    ["already-read", "已经读过"],
    ["duplicate", "重复论文"],
  ] as const;
  for (const [value, label] of reasons) {
    const option = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "option",
    ) as unknown as HTMLOptionElement;
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  const submit = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "button",
  ) as unknown as HTMLButtonElement;
  submit.type = "button";
  submit.textContent = "提交反馈";
  submit.disabled = true;
  select.addEventListener("change", () => {
    submit.disabled = !select.value;
  });
  submit.addEventListener("click", () => {
    if (select.value) {
      void callback(
        select.value as Extract<
          RecommendationFeedbackAction,
          "rejected-topic" | "already-read" | "duplicate"
        >,
      );
      submit.disabled = true;
      select.disabled = true;
    }
  });
  wrapper.append(select, submit);
  return wrapper;
}

function renderSummary(
  doc: Document,
  model: RecommendationCardModel,
): HTMLElement {
  const wrapper = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "div",
  ) as unknown as HTMLElement;
  wrapper.className = "zad-card-summary";
  const label = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "strong",
  ) as unknown as HTMLElement;
  label.textContent =
    model.summary?.source === "arxiv"
      ? "arXiv 原始摘要（中文摘要未生成）"
      : "AI 中文摘要";
  const note = model.summary?.fallbackReason
    ? (() => {
        const message = doc.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "p",
        ) as unknown as HTMLElement;
        message.className = "zad-card-summary-note";
        message.textContent = model.summary?.fallbackReason ?? "";
        return message;
      })()
    : undefined;
  const summary = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "p",
  ) as unknown as HTMLElement;
  summary.className = "zad-card-abstract";
  summary.textContent = model.summary?.text ?? model.candidate.abstract;
  wrapper.appendChild(label);
  if (note) wrapper.appendChild(note);
  wrapper.appendChild(summary);
  if (model.summary?.source !== "arxiv") {
    const original = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "details",
    ) as unknown as HTMLElement;
    const toggle = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "summary",
    ) as unknown as HTMLElement;
    toggle.textContent = "查看 arXiv 原始摘要";
    const originalText = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "p",
    ) as unknown as HTMLElement;
    originalText.className = "zad-card-abstract";
    originalText.textContent = model.candidate.abstract;
    original.append(toggle, originalText);
    wrapper.appendChild(original);
  }
  return wrapper;
}

function appendAction(
  doc: Document,
  parent: Element,
  label: string,
  callback?: () => void | Promise<void>,
): void {
  const button = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "button",
  ) as unknown as HTMLButtonElement;
  button.type = "button";
  button.textContent = label;
  button.disabled = !callback;
  if (callback) button.addEventListener("click", () => void callback());
  parent.appendChild(button);
}
