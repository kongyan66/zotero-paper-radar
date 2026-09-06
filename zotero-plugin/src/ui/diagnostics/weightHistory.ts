import type { RankingWeightVersionRecord } from "../../infrastructure/storage/weightRepository.ts";

export interface WeightHistoryActions {
  rollback(weightVersionID: string): void | Promise<void>;
}

export class WeightHistoryView {
  readonly #doc: Document;
  readonly #actions: WeightHistoryActions;
  #root?: HTMLElement;

  constructor(doc: Document, actions: WeightHistoryActions) {
    this.#doc = doc;
    this.#actions = actions;
  }

  mount(
    parent: Element,
    versions: readonly RankingWeightVersionRecord[],
  ): HTMLElement {
    this.destroy();
    const root = html<HTMLElement>(this.#doc, "section");
    root.className = "zad-weight-history";
    root.dataset.role = "weight-history";
    const heading = html<HTMLHeadingElement>(this.#doc, "h2");
    heading.textContent = "排序权重历史";
    root.appendChild(heading);
    for (const version of versions) root.appendChild(this.createRow(version));
    if (!versions.length) {
      const empty = html<HTMLParagraphElement>(this.#doc, "p");
      empty.textContent = "暂无权重版本";
      root.appendChild(empty);
    }
    parent.appendChild(root);
    this.#root = root;
    return root;
  }

  destroy(): void {
    this.#root?.remove();
    this.#root = undefined;
  }

  private createRow(version: RankingWeightVersionRecord): HTMLElement {
    const row = html<HTMLElement>(this.#doc, "article");
    row.className = "zad-weight-version";
    row.dataset.weightVersionID = version.weightVersionID;
    const title = html<HTMLElement>(this.#doc, "strong");
    title.textContent = version.isActive
      ? `${version.weightVersionID} · 当前使用`
      : version.weightVersionID;
    const detail = html<HTMLParagraphElement>(this.#doc, "p");
    detail.textContent = `${version.updateReason} · 样本 ${version.trainingSampleCount} · ${version.createdAt}`;
    const values = html<HTMLParagraphElement>(this.#doc, "p");
    values.textContent = formatWeights(version);
    row.append(title, detail, values);
    if (!version.isActive) {
      const rollback = html<HTMLButtonElement>(this.#doc, "button");
      rollback.type = "button";
      rollback.dataset.action = "rollback-weight";
      rollback.textContent = "回滚到此版本";
      rollback.addEventListener("click", () =>
        this.#actions.rollback(version.weightVersionID),
      );
      row.appendChild(rollback);
    }
    return row;
  }
}

function html<T extends HTMLElement>(doc: Document, tag: string): T {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as unknown as T;
}

function formatWeights(version: RankingWeightVersionRecord): string {
  const weights = version.weights;
  return `近期 ${weights.recentSimilarity.toFixed(3)} · 长期 ${weights.longTermSimilarity.toFixed(3)} · 代表 ${weights.representativeSimilarity.toFixed(3)} · 关键词 ${weights.keywordMatch.toFixed(3)} · 手动 ${weights.manualPriority.toFixed(3)} · 负反馈 ${weights.negativeSimilarity.toFixed(3)}`;
}
