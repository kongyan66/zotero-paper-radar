import { config } from "../../../package.json";

interface ProfileItemMenuOptions {
  readonly onInclude: (item: Zotero.Item) => void | Promise<void>;
  readonly onExclude: (item: Zotero.Item) => void | Promise<void>;
}

export class ProfileItemMenu {
  private menuID?: string;
  private legacyMenu?: Element;
  private readonly options: ProfileItemMenuOptions;

  constructor(options: ProfileItemMenuOptions) {
    this.options = options;
  }

  get isRegistered(): boolean {
    return Boolean(this.menuID || this.legacyMenu);
  }

  register(win: _ZoteroTypes.MainWindow): void {
    if (this.isRegistered) return;
    const menuManager = Reflect.get(Zotero, "MenuManager") as
      | typeof Zotero.MenuManager
      | undefined;
    if (menuManager) {
      const requestedMenuID = `${config.addonRef}-profile-item-menu`;
      const menuID = menuManager.registerMenu({
        menuID: requestedMenuID,
        pluginID: config.addonID,
        target: "main/library/item",
        menus: [
          {
            menuType: "submenu",
            l10nID: "zotero-arxiv-daily-profile-menu",
            menus: [
              {
                menuType: "menuitem",
                l10nID: "zotero-arxiv-daily-profile-include",
                onShowing: (_event, context) => {
                  context.setEnabled(this.isContextEligible(context.items));
                },
                onCommand: (_event, context) => {
                  const item = context.items?.[0];
                  if (item && this.isEligible(item))
                    void this.options.onInclude(item);
                },
              },
              {
                menuType: "menuitem",
                l10nID: "zotero-arxiv-daily-profile-exclude",
                onShowing: (_event, context) => {
                  context.setEnabled(this.isContextEligible(context.items));
                },
                onCommand: (_event, context) => {
                  const item = context.items?.[0];
                  if (item && this.isEligible(item))
                    void this.options.onExclude(item);
                },
              },
            ],
          },
        ],
      });
      // Zotero 9 registers the menu successfully but older 9.x builds may
      // return void instead of the requested identifier.
      this.menuID = menuID || requestedMenuID;
      return;
    }
    const parent = win.document.querySelector("#zotero-itemmenu");
    if (!parent) return;
    const menu = win.document.createXULElement("menu");
    menu.setAttribute("label", "兴趣画像");
    const popup = win.document.createXULElement("menupopup");
    for (const [label, callback] of [
      ["加入兴趣画像", this.options.onInclude],
      ["从兴趣画像排除", this.options.onExclude],
    ] as const) {
      const item = win.document.createXULElement("menuitem");
      item.setAttribute("label", label);
      item.addEventListener("command", () => {
        const selected = Zotero.getActiveZoteroPane()?.getSelectedItems()[0];
        if (selected && this.isEligible(selected)) void callback(selected);
      });
      popup.appendChild(item);
    }
    menu.appendChild(popup);
    parent.appendChild(menu);
    this.legacyMenu = menu;
  }

  destroy(): void {
    const menuManager = Reflect.get(Zotero, "MenuManager") as
      | typeof Zotero.MenuManager
      | undefined;
    if (this.menuID) menuManager?.unregisterMenu(this.menuID);
    this.menuID = undefined;
    this.legacyMenu?.remove();
    this.legacyMenu = undefined;
  }

  isEligible(item: Zotero.Item): boolean {
    return (
      ["journalArticle", "conferencePaper", "preprint"].includes(
        Zotero.ItemTypes.getName(item.itemTypeID),
      ) &&
      Boolean(String(item.getField("title", false, true) || "").trim()) &&
      Boolean(String(item.getField("abstractNote", false, true) || "").trim())
    );
  }

  private isContextEligible(items?: readonly Zotero.Item[]): boolean {
    return Boolean(
      items?.length === 1 && items[0] && this.isEligible(items[0]),
    );
  }
}
