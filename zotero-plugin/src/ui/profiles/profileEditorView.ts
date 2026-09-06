import type { InterestProfile } from "../../domain/model.ts";

export interface ProfileEditorRow {
  readonly lineageId: string;
  readonly name: string;
  readonly horizon: InterestProfile["horizon"];
  readonly keywords: readonly string[];
  readonly memberCount: number;
  readonly confidence: number;
  readonly stability: number;
  readonly collectionShare: number;
  readonly representativeItemKeys: readonly string[];
  readonly representativeTitles?: readonly string[];
  readonly locked?: boolean;
  readonly disabled: boolean;
  readonly onEdit?: () => void | Promise<void>;
  readonly onToggleLocked?: () => void | Promise<void>;
  readonly onToggleDisabled?: () => void | Promise<void>;
}

export interface ProfileStructureActions {
  readonly onMerge?: () => void | Promise<void>;
  readonly onSplit?: () => void | Promise<void>;
  readonly onRollback?: () => void | Promise<void>;
}

function html<T extends HTMLElement>(doc: Document, tag: string): T {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as unknown as T;
}

export class ProfileEditorView {
  #root?: HTMLElement;

  constructor(readonly doc: Document) {}

  mount(
    parent: Element,
    profiles: readonly ProfileEditorRow[],
    options: {
      readonly includeDisabled?: boolean;
      readonly actions?: ProfileStructureActions;
    } = {},
  ): void {
    this.destroy();
    const root = html<HTMLDetailsElement>(this.doc, "details");
    root.className = "zad-profile-editor";
    root.open = false;
    const summary = html<HTMLElement>(this.doc, "summary");
    summary.className = "zad-profile-summary";
    const heading = html<HTMLHeadingElement>(this.doc, "h2");
    heading.textContent = "兴趣画像";
    const summaryCount = html<HTMLSpanElement>(this.doc, "span");
    summaryCount.className = "zad-profile-summary-count";
    const recentCount = profiles.filter(
      (profile) => profile.horizon === "recent",
    ).length;
    const longTermCount = profiles.filter(
      (profile) => profile.horizon === "long-term",
    ).length;
    summaryCount.textContent = profiles.length
      ? `${profiles.length} 个画像 · 近期 ${recentCount} · 长期 ${longTermCount}`
      : "暂无画像";
    const toggle = html<HTMLButtonElement>(this.doc, "button");
    toggle.type = "button";
    toggle.className = "zad-profile-summary-toggle";
    toggle.dataset.action = "toggle-profiles";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "展开";
    toggle.title = "展开兴趣画像详情";
    const setOpen = (open: boolean): void => {
      root.open = open;
      toggle.textContent = open ? "收起" : "展开";
      toggle.title = open ? "收起兴趣画像详情" : "展开兴趣画像详情";
      toggle.setAttribute("aria-expanded", String(open));
    };
    summary.addEventListener("click", (event) => {
      if (event.target === toggle) return;
      event.preventDefault();
      setOpen(!root.open);
    });
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!root.open);
    });
    summary.append(heading, summaryCount, toggle);
    root.appendChild(summary);
    if (options.actions) {
      const actions = html<HTMLDivElement>(this.doc, "div");
      actions.className = "zad-profile-structure-actions";
      if (options.actions.onMerge) {
        actions.appendChild(
          actionButton(
            this.doc,
            "合并画像",
            "merge-profiles",
            options.actions.onMerge,
          ),
        );
      }
      if (options.actions.onSplit) {
        actions.appendChild(
          actionButton(
            this.doc,
            "拆分画像",
            "split-profile",
            options.actions.onSplit,
          ),
        );
      }
      if (options.actions.onRollback) {
        actions.appendChild(
          actionButton(
            this.doc,
            "回滚画像版本",
            "rollback-profile",
            options.actions.onRollback,
          ),
        );
      }
      root.appendChild(actions);
    }
    const visible = options.includeDisabled
      ? profiles
      : profiles.filter((profile) => !profile.disabled);
    if (!visible.length) {
      const empty = html<HTMLParagraphElement>(this.doc, "p");
      empty.textContent = "暂无启用的兴趣画像";
      root.appendChild(empty);
    }
    for (const profile of visible) root.appendChild(this.createRow(profile));
    parent.appendChild(root);
    this.#root = root;
  }

  destroy(): void {
    this.#root?.remove();
    this.#root = undefined;
  }

  private createRow(profile: ProfileEditorRow): HTMLElement {
    const row = html<HTMLElement>(this.doc, "article");
    row.className = "zad-profile-row";
    row.dataset.lineageId = profile.lineageId;
    const title = html<HTMLHeadingElement>(this.doc, "h3");
    title.textContent = profile.name;
    const horizon = html<HTMLSpanElement>(this.doc, "span");
    horizon.className = "zad-profile-horizon";
    horizon.textContent =
      profile.horizon === "recent" ? "近期兴趣" : "长期兴趣";
    const state = html<HTMLSpanElement>(this.doc, "span");
    state.className = "zad-profile-state";
    state.textContent = [
      profile.locked ? "已锁定" : "可自动更新",
      profile.disabled ? "已停用" : "已启用",
    ].join(" · ");
    const keywords = html<HTMLParagraphElement>(this.doc, "p");
    keywords.textContent = `关键词：${profile.keywords.join("、") || "未设置"}`;
    const evidence = html<HTMLParagraphElement>(this.doc, "p");
    evidence.textContent = `论文 ${profile.memberCount} 篇 · 组内相似度 ${formatPercent(profile.confidence)} · 稳定度 ${formatPercent(profile.stability)} · 主要收藏夹占比 ${formatPercent(profile.collectionShare)}`;
    const representatives = html<HTMLParagraphElement>(this.doc, "p");
    const representativeLabels = profile.representativeTitles?.length
      ? profile.representativeTitles
      : profile.representativeItemKeys;
    representatives.textContent = `代表论文：${representativeLabels.join("、") || "暂无"}`;
    const actions = html<HTMLDivElement>(this.doc, "div");
    actions.className = "zad-profile-actions";
    const edit = html<HTMLButtonElement>(this.doc, "button");
    edit.type = "button";
    edit.dataset.action = "edit-profile";
    edit.dataset.lineageId = profile.lineageId;
    edit.title = "编辑画像 overlay";
    edit.textContent = "编辑";
    if (profile.onEdit) {
      edit.addEventListener("click", () => void profile.onEdit?.());
    } else {
      edit.disabled = true;
    }
    actions.appendChild(edit);
    if (profile.onToggleLocked) {
      actions.appendChild(
        toggleButton(
          this.doc,
          profile.locked ? "解锁" : "锁定",
          "toggle-profile-lock",
          profile.onToggleLocked,
        ),
      );
    }
    if (profile.onToggleDisabled) {
      actions.appendChild(
        toggleButton(
          this.doc,
          profile.disabled ? "启用" : "停用",
          "toggle-profile-disabled",
          profile.onToggleDisabled,
        ),
      );
    }
    row.append(
      title,
      horizon,
      state,
      keywords,
      evidence,
      representatives,
      actions,
    );
    return row;
  }
}

function actionButton(
  doc: Document,
  label: string,
  action: string,
  callback: () => void | Promise<void>,
): HTMLButtonElement {
  const button = html<HTMLButtonElement>(doc, "button");
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  button.addEventListener("click", () => void callback());
  return button;
}

function toggleButton(
  doc: Document,
  label: string,
  action: string,
  callback: () => void | Promise<void>,
): HTMLButtonElement {
  const button = html<HTMLButtonElement>(doc, "button");
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  button.addEventListener("click", () => void callback());
  return button;
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
