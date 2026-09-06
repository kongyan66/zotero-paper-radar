import { TASK_CENTER_COLLAPSE_EVENT } from "../tasks/taskCenter.ts";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export const TASK_CENTER_MIN_WIDTH = 260;
export const TASK_CENTER_MAX_WIDTH = 520;
export const TASK_CENTER_DEFAULT_WIDTH = 320;
const TASK_CENTER_STEP = 16;

function html<T extends HTMLElement>(doc: Document, tag: string): T {
  return doc.createElementNS(HTML_NS, tag) as unknown as T;
}

export class WorkspaceLayoutController {
  readonly #doc: Document;
  #content?: HTMLElement;
  #taskCenter?: HTMLElement;
  #resizeHandle?: HTMLElement;
  #removeListeners?: () => void;
  #removeDragListeners?: () => void;
  #taskWidth = TASK_CENTER_DEFAULT_WIDTH;

  constructor(doc: Document) {
    this.#doc = doc;
  }

  mount(
    content: HTMLElement,
    taskCenter: HTMLElement,
    diagnostics: HTMLElement,
  ): void {
    this.destroy();
    this.#content = content;
    this.#taskCenter = taskCenter;
    const handle = html<HTMLDivElement>(this.#doc, "div");
    handle.className = "zad-task-resize-handle";
    handle.dataset.role = "task-center-resize";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("tabindex", "0");
    handle.title = "拖动调整任务中心宽度";
    this.#resizeHandle = handle;
    content.insertBefore(handle, diagnostics);
    content.style.setProperty(
      "--zad-task-center-width",
      `${this.#taskWidth}px`,
    );

    const onCollapse = () => this.syncCollapsedState();
    const onPointerDown = (event: PointerEvent) => this.startDrag(event);
    const onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
    taskCenter.addEventListener(TASK_CENTER_COLLAPSE_EVENT, onCollapse);
    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("keydown", onKeyDown);
    this.#removeListeners = () => {
      taskCenter.removeEventListener(TASK_CENTER_COLLAPSE_EVENT, onCollapse);
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("keydown", onKeyDown);
    };
    this.syncCollapsedState();
    this.updateAriaValue();
  }

  destroy(): void {
    this.#removeDragListeners?.();
    this.#removeDragListeners = undefined;
    this.#removeListeners?.();
    this.#removeListeners = undefined;
    this.#resizeHandle?.remove();
    this.#content?.style.removeProperty("--zad-task-center-width");
    if (this.#content) delete this.#content.dataset.taskCollapsed;
    delete this.#content?.dataset.resizing;
    this.#content = undefined;
    this.#taskCenter = undefined;
    this.#resizeHandle = undefined;
  }

  private startDrag(event: PointerEvent): void {
    if (this.isCollapsed()) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.#taskWidth;
    this.#content?.setAttribute("data-resizing", "true");
    const onMove = (move: PointerEvent) => {
      this.setWidth(startWidth - (move.clientX - startX));
    };
    const onUp = () => {
      this.#removeDragListeners?.();
      this.#removeDragListeners = undefined;
      this.#content?.removeAttribute("data-resizing");
    };
    this.#doc.addEventListener("pointermove", onMove);
    this.#doc.addEventListener("pointerup", onUp, { once: true });
    this.#removeDragListeners = () => {
      this.#doc.removeEventListener("pointermove", onMove);
      this.#doc.removeEventListener("pointerup", onUp);
    };
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.isCollapsed()) return;
    const next =
      event.key === "ArrowLeft"
        ? this.#taskWidth - TASK_CENTER_STEP
        : event.key === "ArrowRight"
          ? this.#taskWidth + TASK_CENTER_STEP
          : event.key === "Home"
            ? TASK_CENTER_MIN_WIDTH
            : event.key === "End"
              ? TASK_CENTER_MAX_WIDTH
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    this.setWidth(next);
  }

  private setWidth(value: number): void {
    this.#taskWidth = Math.min(
      TASK_CENTER_MAX_WIDTH,
      Math.max(TASK_CENTER_MIN_WIDTH, Math.round(value)),
    );
    this.#content?.style.setProperty(
      "--zad-task-center-width",
      `${this.#taskWidth}px`,
    );
    this.updateAriaValue();
  }

  private syncCollapsedState(): void {
    const collapsed = this.isCollapsed();
    this.#content?.setAttribute("data-task-collapsed", String(collapsed));
    if (this.#resizeHandle) {
      this.#resizeHandle.setAttribute("aria-hidden", String(collapsed));
      this.#resizeHandle.setAttribute("tabindex", collapsed ? "-1" : "0");
    }
  }

  private isCollapsed(): boolean {
    return this.#taskCenter?.dataset.collapsed === "true";
  }

  private updateAriaValue(): void {
    this.#resizeHandle?.setAttribute(
      "aria-valuemin",
      String(TASK_CENTER_MIN_WIDTH),
    );
    this.#resizeHandle?.setAttribute(
      "aria-valuemax",
      String(TASK_CENTER_MAX_WIDTH),
    );
    this.#resizeHandle?.setAttribute("aria-valuenow", String(this.#taskWidth));
  }
}
