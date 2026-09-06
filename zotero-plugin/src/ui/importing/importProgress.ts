export type ImportProgressStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface ImportProgressState {
  readonly status: ImportProgressStatus;
  readonly receivedBytes: number;
  readonly totalBytes?: number;
  readonly message?: string;
}

export class ImportProgressView {
  readonly #doc: Document;
  #root?: HTMLElement;
  #detail?: HTMLElement;
  #progress?: HTMLProgressElement;

  constructor(doc: Document) {
    this.#doc = doc;
  }

  mount(parent: Element): HTMLElement {
    const root = html<HTMLElement>(this.#doc, "section");
    root.className = "zad-import-progress";
    root.dataset.role = "import-progress";
    root.setAttribute("aria-label", "PDF 入库进度");
    const detail = html<HTMLElement>(this.#doc, "span");
    detail.dataset.role = "import-progress-detail";
    const progress = html<HTMLProgressElement>(this.#doc, "progress");
    progress.dataset.role = "import-progress-bar";
    progress.max = 1;
    progress.value = 0;
    root.append(detail, progress);
    parent.appendChild(root);
    this.#root = root;
    this.#detail = detail;
    this.#progress = progress;
    this.update({ status: "idle", receivedBytes: 0 });
    return root;
  }

  update(state: ImportProgressState): void {
    if (!this.#root || !this.#detail || !this.#progress) return;
    this.#root.dataset.status = state.status;
    const total = state.totalBytes;
    this.#detail.textContent =
      state.message ??
      (total
        ? `${formatBytes(state.receivedBytes)} / ${formatBytes(total)}`
        : formatBytes(state.receivedBytes));
    this.#progress.max = total && total > 0 ? total : 1;
    this.#progress.value = total
      ? Math.min(state.receivedBytes, total)
      : state.receivedBytes > 0
        ? 1
        : 0;
    this.#progress.setAttribute(
      "aria-valuetext",
      this.#detail.textContent ?? "",
    );
  }

  destroy(): void {
    this.#root?.remove();
    this.#root = undefined;
    this.#detail = undefined;
    this.#progress = undefined;
  }
}

function html<T extends HTMLElement>(doc: Document, tag: string): T {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as unknown as T;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}
