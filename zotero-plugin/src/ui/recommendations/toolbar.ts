import type { RecommendationHistoryDay } from "../../domain/recommendations/recommendationHistory.ts";

export interface RecommendationProfileOption {
  readonly id: string;
  readonly name: string;
  readonly disabled?: boolean;
}

export interface RecommendationToolbarState {
  readonly count: number;
  readonly profileIDs: readonly string[];
  readonly categories: readonly string[];
  readonly lookbackDays?: number;
}

export type RecommendationHistoryOption = RecommendationHistoryDay;

let profileFilterID = 0;
let categoryFilterID = 0;

const COMMON_ARXIV_CATEGORIES = [
  ["cs.CV", "Computer Vision"],
  ["cs.CL", "Computation and Language"],
  ["cs.AI", "Artificial Intelligence"],
  ["cs.LG", "Machine Learning"],
  ["cs.IR", "Information Retrieval"],
  ["cs.RO", "Robotics"],
] as const;

export class RecommendationToolbarView {
  readonly #doc: Document;
  #profiles: readonly RecommendationProfileOption[];
  readonly #categories: readonly string[];
  #historyDays: readonly RecommendationHistoryOption[];
  readonly #onRefresh?: (
    state: RecommendationToolbarState,
  ) => void | Promise<void>;
  readonly #onHistoryDayChange?: (
    dayKey: string,
    profileIDs: readonly string[],
  ) => void | Promise<void>;
  #countInput?: HTMLInputElement;
  #profileFilterButton?: HTMLButtonElement;
  #profileFilterMenu?: HTMLElement;
  #removeProfileFilterListeners?: () => void;
  #categoryFilterButton?: HTMLButtonElement;
  #categoryFilterMenu?: HTMLElement;
  #removeCategoryFilterListeners?: () => void;
  readonly #selectedProfileIDs = new Set<string>();
  readonly #selectedCategories = new Set<string>();
  #lookbackSelect?: HTMLSelectElement;
  #historySelect?: HTMLSelectElement;
  #refreshButton?: HTMLButtonElement;
  #setupState?: HTMLElement;
  #cacheSummary?: HTMLElement;
  #ready = true;
  #working = false;

  constructor(
    doc: Document,
    options: {
      readonly profiles?: readonly RecommendationProfileOption[];
      readonly categories?: readonly string[];
      readonly historyDays?: readonly RecommendationHistoryOption[];
      readonly initialCount?: number;
      readonly onRefresh?: (
        state: RecommendationToolbarState,
      ) => void | Promise<void>;
      readonly onHistoryDayChange?: (
        dayKey: string,
        profileIDs: readonly string[],
      ) => void | Promise<void>;
    } = {},
  ) {
    this.#doc = doc;
    this.#profiles = options.profiles ?? [];
    this.#categories = uniqueCategories(
      options.categories ?? ["cs.CV", "cs.CL"],
    );
    for (const category of this.#categories) {
      this.#selectedCategories.add(category);
    }
    this.#historyDays = options.historyDays ?? [];
    this.#onRefresh = options.onRefresh;
    this.#onHistoryDayChange = options.onHistoryDayChange;
    this.#initialCount = clampCount(options.initialCount ?? 5);
  }

  #initialCount: number;

  mount(parent: Element): HTMLElement {
    const toolbar = html<HTMLElement>(this.#doc, "header");
    toolbar.className = "zad-workspace-toolbar";
    const identity = html<HTMLDivElement>(this.#doc, "div");
    identity.className = "zad-workspace-identity";
    const title = html<HTMLHeadingElement>(this.#doc, "h1");
    title.textContent = "今日推荐";
    const state = html<HTMLSpanElement>(this.#doc, "span");
    state.className = "zad-setup-state";
    state.dataset.role = "setup-state";
    state.textContent = "尚未配置";
    this.#setupState = state;
    const cache = html<HTMLSpanElement>(this.#doc, "span");
    cache.className = "zad-cache-summary";
    cache.dataset.role = "cache-summary";
    cache.textContent = "缓存 0 篇 · 尚未更新";
    this.#cacheSummary = cache;
    identity.append(title, state, cache);

    const controls = html<HTMLDivElement>(this.#doc, "div");
    controls.className = "zad-workspace-controls";
    controls.append(
      this.profileFilterControl("画像"),
      this.historyControl("推荐日"),
      this.numberControl(),
      this.selectControl("时间", "lookback-days", [
        { value: "", label: "自上次检索" },
        { value: "1", label: "1 天" },
        { value: "3", label: "3 天" },
        { value: "7", label: "7 天" },
        { value: "14", label: "14 天" },
      ]),
      this.categoryFilterControl("分类"),
    );
    const refresh = html<HTMLButtonElement>(this.#doc, "button");
    refresh.type = "button";
    refresh.className = "zad-primary-command";
    refresh.dataset.role = "refresh-recommendations";
    refresh.title = "刷新推荐";
    refresh.textContent = "刷新推荐";
    refresh.disabled = !this.#onRefresh;
    refresh.addEventListener("click", () => {
      this.setProfileMenuOpen(false);
      this.setCategoryMenuOpen(false);
      void this.#onRefresh?.(this.readState());
    });
    this.#refreshButton = refresh;
    controls.append(refresh);
    toolbar.append(identity, controls);
    parent.appendChild(toolbar);
    if (this.#profileFilterMenu) parent.appendChild(this.#profileFilterMenu);
    if (this.#categoryFilterMenu) parent.appendChild(this.#categoryFilterMenu);
    return toolbar;
  }

  setReady(ready: boolean): void {
    this.#ready = ready;
    const state = this.#setupState;
    if (state) {
      state.textContent = ready ? "模型已就绪" : "尚未配置";
      state.style.borderLeftColor = ready
        ? "var(--zad-accent)"
        : "var(--zad-warning)";
    }
    this.updateRefreshDisabled();
  }

  setStatus(message: string, state: "ready" | "working" | "error"): void {
    if (!this.#setupState) return;
    this.#setupState.textContent = message;
    this.#setupState.dataset.state = state;
    this.#working = state === "working";
    this.updateRefreshDisabled();
  }

  setCacheSummary(count: number, updatedAt?: string): void {
    if (!this.#cacheSummary) return;
    const updated = updatedAt
      ? new Date(updatedAt).toLocaleString("zh-CN")
      : "尚未更新";
    this.#cacheSummary.textContent = `缓存 ${Math.max(0, count)} 篇 · ${updated}`;
  }

  setProfiles(profiles: readonly RecommendationProfileOption[]): void {
    this.#profiles = profiles;
    if (!this.#profileFilterMenu) return;
    const available = new Set(
      profiles
        .filter((profile) => !profile.disabled)
        .map((profile) => profile.id),
    );
    for (const profileID of this.#selectedProfileIDs) {
      if (!available.has(profileID)) this.#selectedProfileIDs.delete(profileID);
    }
    this.renderProfileMenu();
  }

  setHistoryDays(
    days: readonly RecommendationHistoryOption[],
    selectedDay?: string,
  ): void {
    this.#historyDays = days;
    const select = this.#historySelect;
    if (!select) return;
    const current = select.value;
    select.replaceChildren();
    for (const day of days) {
      const option = html<HTMLOptionElement>(this.#doc, "option");
      option.value = day.dayKey;
      option.textContent = `${day.label} · ${day.candidateCount} 篇`;
      select.appendChild(option);
    }
    if (!days.length) {
      const empty = html<HTMLOptionElement>(this.#doc, "option");
      empty.value = "";
      empty.textContent = "暂无历史推荐";
      select.appendChild(empty);
    }
    const available = new Set(days.map((day) => day.dayKey));
    const next = selectedDay ?? current;
    select.value = available.has(next) ? next : (days[0]?.dayKey ?? "");
    select.disabled = days.length === 0 || !this.#onHistoryDayChange;
  }

  readState(): RecommendationToolbarState {
    const lookback = this.#lookbackSelect?.value;
    return {
      count: clampCount(Number(this.#countInput?.value ?? this.#initialCount)),
      profileIDs: [...this.#selectedProfileIDs],
      categories: [...this.#selectedCategories],
      ...(lookback ? { lookbackDays: Number(lookback) } : {}),
    };
  }

  destroy(): void {
    this.#removeProfileFilterListeners?.();
    this.#removeCategoryFilterListeners?.();
    this.#removeProfileFilterListeners = undefined;
    this.#profileFilterButton = undefined;
    this.#profileFilterMenu?.remove();
    this.#profileFilterMenu = undefined;
    this.#categoryFilterButton = undefined;
    this.#categoryFilterMenu?.remove();
    this.#categoryFilterMenu = undefined;
    this.#historySelect = undefined;
    this.#selectedProfileIDs.clear();
    this.#selectedCategories.clear();
  }

  private profileFilterControl(label: string): Element {
    const wrapper = html<HTMLDivElement>(this.#doc, "div");
    wrapper.className = "zad-field zad-profile-filter";
    const name = html<HTMLSpanElement>(this.#doc, "span");
    name.textContent = label;
    const button = html<HTMLButtonElement>(this.#doc, "button");
    button.type = "button";
    button.className = "zad-profile-filter-button";
    button.dataset.role = "profile-filter";
    button.setAttribute("aria-haspopup", "true");
    const menu = html<HTMLDivElement>(this.#doc, "div");
    menu.className = "zad-profile-filter-menu";
    menu.dataset.role = "profile-filter-menu";
    menu.id = `zad-profile-filter-menu-${++profileFilterID}`;
    menu.setAttribute("hidden", "hidden");
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", "选择兴趣画像");
    button.setAttribute("aria-controls", menu.id);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      this.setProfileMenuOpen(button.getAttribute("aria-expanded") !== "true");
    });
    this.#profileFilterButton = button;
    this.#profileFilterMenu = menu;
    this.renderProfileMenu();

    const onDocumentClick = (event: Event) => {
      const target = event.target;
      if (!target) return;
      if (
        target === button ||
        target === menu ||
        menu.contains(target as Node) ||
        wrapper.contains(target as Node)
      )
        return;
      this.setProfileMenuOpen(false);
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !menu.hasAttribute("hidden")) {
        this.setProfileMenuOpen(false);
        button.focus();
      }
    };
    this.#doc.addEventListener("click", onDocumentClick);
    this.#doc.addEventListener("keydown", onDocumentKeyDown);
    this.#removeProfileFilterListeners = () => {
      this.#doc.removeEventListener("click", onDocumentClick);
      this.#doc.removeEventListener("keydown", onDocumentKeyDown);
    };
    wrapper.append(name, button);
    return wrapper;
  }

  private historyControl(label: string): Element {
    const wrapper = html<HTMLLabelElement>(this.#doc, "label");
    wrapper.className = "zad-field zad-history-field";
    const name = html<HTMLSpanElement>(this.#doc, "span");
    name.textContent = label;
    const select = html<HTMLSelectElement>(this.#doc, "select");
    select.dataset.role = "history-day";
    select.addEventListener("change", () => {
      if (select.value) {
        void this.#onHistoryDayChange?.(select.value, [
          ...this.#selectedProfileIDs,
        ]);
      }
    });
    this.#historySelect = select;
    wrapper.append(name, select);
    this.setHistoryDays(this.#historyDays);
    return wrapper;
  }

  private renderProfileMenu(): void {
    const menu = this.#profileFilterMenu;
    if (!menu) return;
    menu.replaceChildren();
    menu.appendChild(
      this.profileFilterOption(
        "",
        "全部兴趣",
        this.#selectedProfileIDs.size === 0,
      ),
    );
    for (const profile of this.#profiles.filter(
      (candidate) => !candidate.disabled,
    )) {
      menu.appendChild(
        this.profileFilterOption(
          profile.id,
          profile.name,
          this.#selectedProfileIDs.has(profile.id),
        ),
      );
    }
    this.updateProfileFilterButton();
  }

  private profileFilterOption(
    value: string,
    label: string,
    checked: boolean,
  ): HTMLLabelElement {
    const row = html<HTMLLabelElement>(this.#doc, "label");
    row.className = "zad-profile-filter-option";
    const input = html<HTMLInputElement>(this.#doc, "input");
    input.type = "checkbox";
    input.value = value;
    input.checked = checked;
    input.addEventListener("change", () => {
      if (!value) {
        if (input.checked) this.#selectedProfileIDs.clear();
        else if (this.#selectedProfileIDs.size === 0) input.checked = true;
      } else if (input.checked) {
        this.#selectedProfileIDs.add(value);
      } else {
        this.#selectedProfileIDs.delete(value);
      }
      this.renderProfileMenu();
    });
    const text = html<HTMLSpanElement>(this.#doc, "span");
    text.textContent = label;
    row.append(input, text);
    return row;
  }

  private updateProfileFilterButton(): void {
    const button = this.#profileFilterButton;
    if (!button) return;
    const selected = this.#profiles.filter((profile) =>
      this.#selectedProfileIDs.has(profile.id),
    );
    button.textContent =
      selected.length === 0
        ? "全部兴趣"
        : selected.length === 1
          ? selected[0].name
          : `已选 ${selected.length} 个兴趣`;
    button.setAttribute(
      "aria-expanded",
      button.getAttribute("aria-expanded") === "true" ? "true" : "false",
    );
  }

  private setProfileMenuOpen(open: boolean): void {
    if (!this.#profileFilterMenu) return;
    if (open) {
      this.#profileFilterMenu.removeAttribute("hidden");
      this.positionFilterMenu(
        this.#profileFilterButton,
        this.#profileFilterMenu,
        232,
      );
    } else this.#profileFilterMenu.setAttribute("hidden", "hidden");
    this.#profileFilterButton?.setAttribute("aria-expanded", String(open));
    this.updateProfileFilterButton();
  }

  private categoryFilterControl(label: string): Element {
    const wrapper = html<HTMLDivElement>(this.#doc, "div");
    wrapper.className = "zad-field zad-category-filter";
    const name = html<HTMLSpanElement>(this.#doc, "span");
    name.textContent = label;
    const button = html<HTMLButtonElement>(this.#doc, "button");
    button.type = "button";
    button.className = "zad-category-filter-button";
    button.dataset.role = "category-filter";
    button.setAttribute("aria-haspopup", "true");
    const menu = html<HTMLDivElement>(this.#doc, "div");
    menu.className = "zad-category-filter-menu";
    menu.dataset.role = "category-filter-menu";
    menu.id = `zad-category-filter-menu-${++categoryFilterID}`;
    menu.setAttribute("hidden", "hidden");
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", "选择 arXiv 分类");
    button.setAttribute("aria-controls", menu.id);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      this.setCategoryMenuOpen(button.getAttribute("aria-expanded") !== "true");
    });
    this.#categoryFilterButton = button;
    this.#categoryFilterMenu = menu;
    this.renderCategoryMenu();

    const onDocumentClick = (event: Event) => {
      const target = event.target;
      if (!target) return;
      if (
        target === button ||
        target === menu ||
        menu.contains(target as Node) ||
        wrapper.contains(target as Node)
      )
        return;
      this.setCategoryMenuOpen(false);
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !menu.hasAttribute("hidden")) {
        this.setCategoryMenuOpen(false);
        button.focus();
      }
    };
    this.#doc.addEventListener("click", onDocumentClick);
    this.#doc.addEventListener("keydown", onDocumentKeyDown);
    this.#removeCategoryFilterListeners = () => {
      this.#doc.removeEventListener("click", onDocumentClick);
      this.#doc.removeEventListener("keydown", onDocumentKeyDown);
    };
    wrapper.append(name, button);
    return wrapper;
  }

  private renderCategoryMenu(): void {
    const menu = this.#categoryFilterMenu;
    if (!menu) return;
    menu.replaceChildren();
    const labels = new Map<string, string>(COMMON_ARXIV_CATEGORIES);
    for (const category of this.#categories) {
      if (!labels.has(category)) labels.set(category, "自定义分类");
    }
    for (const [category, description] of labels) {
      const row = html<HTMLLabelElement>(this.#doc, "label");
      row.className = "zad-profile-filter-option";
      const input = html<HTMLInputElement>(this.#doc, "input");
      input.type = "checkbox";
      input.value = category;
      input.checked = this.#selectedCategories.has(category);
      input.addEventListener("change", () => {
        if (
          !input.checked &&
          this.#selectedCategories.size === 1 &&
          this.#selectedCategories.has(category)
        ) {
          input.checked = true;
          return;
        }
        if (input.checked) this.#selectedCategories.add(category);
        else this.#selectedCategories.delete(category);
        this.renderCategoryMenu();
      });
      const text = html<HTMLSpanElement>(this.#doc, "span");
      text.textContent = `${category} · ${description}`;
      row.append(input, text);
      menu.appendChild(row);
    }
    this.updateCategoryFilterButton();
  }

  private updateCategoryFilterButton(): void {
    const button = this.#categoryFilterButton;
    if (!button) return;
    const selected = [...this.#selectedCategories];
    button.textContent =
      selected.length <= 2
        ? selected.join(" + ")
        : `已选 ${selected.length} 个分类`;
  }

  private setCategoryMenuOpen(open: boolean): void {
    if (!this.#categoryFilterMenu) return;
    if (open) {
      this.#categoryFilterMenu.removeAttribute("hidden");
      this.positionFilterMenu(
        this.#categoryFilterButton,
        this.#categoryFilterMenu,
        250,
      );
    } else this.#categoryFilterMenu.setAttribute("hidden", "hidden");
    this.#categoryFilterButton?.setAttribute("aria-expanded", String(open));
    this.updateCategoryFilterButton();
  }

  private positionFilterMenu(
    button: HTMLButtonElement | undefined,
    menu: HTMLElement,
    minimumWidth: number,
  ): void {
    if (!button) return;
    menu.style.position = "fixed";
    menu.style.zIndex = "1000";
    const rect = button.getBoundingClientRect();
    const viewportWidth =
      this.#doc.defaultView?.innerWidth ||
      this.#doc.documentElement?.clientWidth ||
      minimumWidth + 16;
    const viewportHeight =
      this.#doc.defaultView?.innerHeight ||
      this.#doc.documentElement?.clientHeight ||
      600;
    const width = Math.min(
      Math.max(minimumWidth, Math.round(rect.width)),
      Math.max(minimumWidth, viewportWidth - 16),
    );
    menu.style.width = `${width}px`;
    const height = Math.min(260, menu.scrollHeight || 260);
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    const below = rect.bottom + 6;
    const top =
      below + height <= viewportHeight - 8
        ? below
        : Math.max(8, rect.top - height - 6);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  private selectControl(
    label: string,
    role: string,
    options: readonly { readonly value: string; readonly label: string }[],
  ): Element {
    const wrapper = html<HTMLLabelElement>(this.#doc, "label");
    wrapper.className = "zad-field";
    const name = html<HTMLSpanElement>(this.#doc, "span");
    name.textContent = label;
    const select = html<HTMLSelectElement>(this.#doc, "select");
    select.dataset.role = role;
    for (const optionData of options) {
      const option = html<HTMLOptionElement>(this.#doc, "option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      if (!optionData.value) option.selected = true;
      select.appendChild(option);
    }
    this.#lookbackSelect = select;
    wrapper.append(name, select);
    return wrapper;
  }

  private numberControl(): Element {
    const wrapper = html<HTMLLabelElement>(this.#doc, "label");
    wrapper.className = "zad-field zad-number-field";
    const name = html<HTMLSpanElement>(this.#doc, "span");
    name.textContent = "数量";
    const input = html<HTMLInputElement>(this.#doc, "input");
    input.type = "number";
    input.min = "1";
    input.max = "30";
    input.value = String(this.#initialCount);
    input.dataset.role = "recommendation-count";
    input.addEventListener("change", () => {
      input.value = String(clampCount(Number(input.value)));
    });
    this.#countInput = input;
    wrapper.append(name, input);
    return wrapper;
  }

  private updateRefreshDisabled(): void {
    if (!this.#refreshButton) return;
    this.#refreshButton.disabled =
      !this.#onRefresh || !this.#ready || this.#working;
  }
}

function html<T extends HTMLElement>(doc: Document, tag: string): T {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as unknown as T;
}

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(30, Math.max(1, Math.round(value)));
}

function uniqueCategories(categories: readonly string[]): string[] {
  const normalized = categories
    .map((category) => category.trim())
    .filter((category) => /^[a-zA-Z0-9.-]+$/.test(category));
  return [...new Set(normalized.length ? normalized : ["cs.CV", "cs.CL"])];
}
