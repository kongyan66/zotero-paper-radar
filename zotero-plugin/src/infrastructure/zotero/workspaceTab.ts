import { config } from "../../../package.json";

export const WORKSPACE_TAB_ID = `${config.addonRef}-workspace-tab`;
export const WORKSPACE_TAB_TYPE = `${config.addonRef}-recommendations`;
const WORKSPACE_ROOT_ID = `${WORKSPACE_TAB_ID}-root`;
declare const __workspaceStyleVersion__: string;
const WORKSPACE_STYLE_VERSION =
  typeof __workspaceStyleVersion__ === "string"
    ? __workspaceStyleVersion__
    : "development";

type ContentDisposer = () => void;
type ContentFactory = (container: Element) => ContentDisposer;

function html<T extends HTMLElement>(doc: Document, tag: string): T {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as unknown as T;
}

export class WorkspaceTab {
  readonly #win: _ZoteroTypes.MainWindow;
  readonly #contentFactory: ContentFactory;
  #disposeContent?: ContentDisposer;

  constructor(win: _ZoteroTypes.MainWindow, contentFactory: ContentFactory) {
    this.#win = win;
    this.#contentFactory = contentFactory;
  }

  mount(): void {
    this.addStyleSheet();
    this.addToolbarButton();
  }

  open(): string {
    const doc = this.#win.document;
    const existingTab = doc.getElementById(WORKSPACE_TAB_ID);
    if (existingTab && doc.getElementById(WORKSPACE_ROOT_ID)) {
      this.#win.Zotero_Tabs.select(WORKSPACE_TAB_ID);
      return WORKSPACE_TAB_ID;
    }
    if (existingTab) this.#win.Zotero_Tabs.close(WORKSPACE_TAB_ID);

    const { id, container } = this.#win.Zotero_Tabs.add({
      id: WORKSPACE_TAB_ID,
      type: WORKSPACE_TAB_TYPE,
      title: "今日推荐",
      data: {},
      select: true,
      onClose: () => this.cleanupContent(),
    });
    try {
      container.setAttribute("flex", "1");
      this.#disposeContent = this.#contentFactory(container);
    } catch (error) {
      this.cleanupContent();
      this.#win.Zotero_Tabs.close(id);
      throw new Error(
        `Failed to mount recommendation workspace: ${describeError(error)}`,
      );
    }
    return id;
  }

  destroy(): void {
    if (this.#win.document.getElementById(WORKSPACE_TAB_ID)) {
      this.#win.Zotero_Tabs.close(WORKSPACE_TAB_ID);
    } else {
      this.cleanupContent();
    }
    this.#win.document
      .getElementById(`${config.addonRef}-toolbar-button`)
      ?.remove();
    this.#win.document
      .getElementById(`${config.addonRef}-workspace-stylesheet`)
      ?.remove();
    this.#win.document
      .getElementById(`${config.addonRef}-profile-editor-stylesheet`)
      ?.remove();
  }

  private cleanupContent(): void {
    this.#disposeContent?.();
    this.#disposeContent = undefined;
  }

  private addStyleSheet(): void {
    const doc = this.#win.document;
    const stylesheets = [
      [
        `${config.addonRef}-workspace-stylesheet`,
        "recommendationWorkspace.css",
      ],
      [`${config.addonRef}-profile-editor-stylesheet`, "profileEditor.css"],
    ] as const;
    for (const [id, file] of stylesheets) {
      const href = `chrome://${config.addonRef}/content/${file}?v=${WORKSPACE_STYLE_VERSION}`;
      const existing = doc.getElementById(id);
      if (existing?.getAttribute("href") === href) continue;
      existing?.remove();
      const link = html<HTMLLinkElement>(doc, "link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = href;
      doc.documentElement?.appendChild(link);
    }
  }

  private addToolbarButton(): void {
    const doc = this.#win.document;
    if (doc.getElementById(`${config.addonRef}-toolbar-button`)) return;
    const button = html<HTMLButtonElement>(doc, "button");
    button.id = `${config.addonRef}-toolbar-button`;
    button.className = "zad-toolbar-button";
    button.type = "button";
    button.title = "打开今日推荐";
    button.setAttribute("aria-label", "打开今日推荐");
    const icon = html<HTMLImageElement>(doc, "img");
    icon.alt = "";
    icon.src = `chrome://${config.addonRef}/content/icons/zotero-arxiv-daily.svg`;
    button.appendChild(icon);
    button.addEventListener("click", () => this.open());

    const itemToolbar = doc.getElementById("zotero-items-toolbar");
    const spacer = itemToolbar?.querySelector("spacer[flex='1']");
    if (itemToolbar && spacer) {
      itemToolbar.insertBefore(button, spacer);
    } else {
      (itemToolbar || doc.getElementById("zotero-toolbar"))?.appendChild(
        button,
      );
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  }
  try {
    return String(error);
  } catch {
    return "Unknown error";
  }
}
