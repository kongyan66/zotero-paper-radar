import type { RecommendationCardModel } from "./recommendationCard.ts";
import { renderRecommendationCard } from "./recommendationCard.ts";

export type { RecommendationCardModel } from "./recommendationCard.ts";

export class RecommendationListView {
  readonly #doc: Document;
  #root?: HTMLElement;

  constructor(doc: Document) {
    this.#doc = doc;
  }

  mount(parent: Element): HTMLElement {
    const root = this.#doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as unknown as HTMLElement;
    root.className = "zad-recommendation-list";
    root.dataset.role = "recommendation-list";
    parent.appendChild(root);
    this.#root = root;
    return root;
  }

  setRecommendations(models: readonly RecommendationCardModel[]): void {
    if (!this.#root) return;
    this.#root.replaceChildren();
    if (!models.length) {
      const empty = this.#doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div",
      ) as unknown as HTMLElement;
      empty.className = "zad-empty-state zad-recommendation-empty";
      empty.dataset.role = "recommendation-empty";
      const title = this.#doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "strong",
      ) as unknown as HTMLElement;
      title.textContent = "暂无推荐记录";
      const message = this.#doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "p",
      ) as unknown as HTMLElement;
      message.textContent = "刷新后将根据当前兴趣画像检索 arXiv。";
      empty.append(title, message);
      this.#root.appendChild(empty);
      return;
    }
    for (const model of models)
      this.#root.appendChild(renderRecommendationCard(this.#doc, model));
  }

  destroy(): void {
    this.#root?.remove();
    this.#root = undefined;
  }
}
