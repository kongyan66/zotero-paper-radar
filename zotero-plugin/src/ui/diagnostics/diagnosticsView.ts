import type { DiagnosticsExport } from "../../infrastructure/diagnostics/runLogger.ts";

export interface DiagnosticsViewActions {
  export(value: {
    readonly includeSampleContent: boolean;
  }): void | Promise<void>;
  clearCache(): void | Promise<void>;
  rebuildDerivedData(): void | Promise<void>;
}

export class DiagnosticsView {
  readonly #doc: Document;
  readonly #actions: DiagnosticsViewActions;
  #root?: HTMLElement;

  constructor(doc: Document, actions: DiagnosticsViewActions) {
    this.#doc = doc;
    this.#actions = actions;
  }

  mount(parent: Element, summary: DiagnosticsExport): HTMLElement {
    this.destroy();
    const root = html<HTMLElement>(this.#doc, "section");
    root.className = "zad-diagnostics";
    root.dataset.role = "diagnostics-view";
    const heading = html<HTMLHeadingElement>(this.#doc, "h2");
    heading.textContent = "诊断与隐私";
    const details = html<HTMLParagraphElement>(this.#doc, "p");
    details.textContent = `导出版本 ${summary.schemaVersion} · 生成时间 ${summary.generatedAt}`;
    const sample = html<HTMLInputElement>(this.#doc, "input");
    sample.type = "checkbox";
    sample.dataset.role = "include-sample-content";
    const label = html<HTMLLabelElement>(this.#doc, "label");
    label.textContent = "包含少量样例标题和摘要";
    label.prepend(sample);
    const exportButton = button(this.#doc, "导出诊断", "export-diagnostics");
    exportButton.addEventListener("click", () => {
      const includeSampleContent = sample.checked;
      if (includeSampleContent && !confirmSample(this.#doc)) {
        return;
      }
      void this.#actions.export({ includeSampleContent });
    });
    const clearButton = button(this.#doc, "清理可推导缓存", "clear-cache");
    clearButton.addEventListener(
      "click",
      () => void this.#actions.clearCache(),
    );
    const rebuildButton = button(
      this.#doc,
      "重建画像和索引",
      "rebuild-derived-data",
    );
    rebuildButton.addEventListener(
      "click",
      () => void this.#actions.rebuildDerivedData(),
    );
    root.append(
      heading,
      details,
      label,
      exportButton,
      clearButton,
      rebuildButton,
    );
    parent.appendChild(root);
    this.#root = root;
    return root;
  }

  destroy(): void {
    this.#root?.remove();
    this.#root = undefined;
  }
}

function confirmSample(doc: Document): boolean {
  return (
    doc.defaultView?.confirm(
      "样例内容可能包含你的研究兴趣，只在明确同意后导出。继续吗？",
    ) ?? false
  );
}

function button(
  doc: Document,
  text: string,
  action: string,
): HTMLButtonElement {
  const result = html<HTMLButtonElement>(doc, "button");
  result.type = "button";
  result.dataset.action = action;
  result.textContent = text;
  return result;
}

function html<T extends HTMLElement>(doc: Document, tag: string): T {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as unknown as T;
}
