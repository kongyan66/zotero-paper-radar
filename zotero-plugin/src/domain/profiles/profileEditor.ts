export interface ProfileOverlay {
  readonly lineageId: string;
  readonly userName: string;
  readonly keywords: readonly string[];
  readonly weight: number;
  readonly locked: boolean;
  readonly disabled: boolean;
  readonly includeItemKeys: readonly string[];
  readonly excludeItemKeys: readonly string[];
  readonly structureOperations: readonly StructureOperation[];
}

export type StructureOperation =
  | { readonly type: "merge"; readonly lineageIds: readonly string[] }
  | {
      readonly type: "split";
      readonly lineageId: string;
      readonly groups: readonly (readonly string[])[];
    };

export interface MergePreview {
  readonly type: "merge";
  readonly lineageIds: readonly string[];
  readonly memberItemKeys: readonly string[];
  readonly confirmed: boolean;
}

export interface SplitPreview {
  readonly type: "split";
  readonly lineageId: string;
  readonly groups: readonly (readonly string[])[];
  readonly confirmed: boolean;
}

export class ProfileEditor {
  editOverlay(
    overlay: ProfileOverlay,
    changes: Partial<
      Pick<
        ProfileOverlay,
        "userName" | "keywords" | "weight" | "locked" | "disabled"
      >
    >,
  ): ProfileOverlay {
    return {
      ...overlay,
      userName:
        changes.userName === undefined
          ? overlay.userName
          : changes.userName.trim(),
      keywords:
        changes.keywords === undefined
          ? overlay.keywords
          : uniqueNonEmpty(changes.keywords),
      weight:
        changes.weight === undefined
          ? overlay.weight
          : Math.min(2, Math.max(0, Number(changes.weight))),
      locked: changes.locked ?? overlay.locked,
      disabled: changes.disabled ?? overlay.disabled,
    };
  }

  addItem(
    overlay: ProfileOverlay,
    itemKey: string,
    mode: "include" | "exclude",
  ): ProfileOverlay {
    const key = itemKey.trim();
    if (!key) return overlay;
    if (mode === "include") {
      return {
        ...overlay,
        includeItemKeys: uniqueNonEmpty([...overlay.includeItemKeys, key]),
        excludeItemKeys: overlay.excludeItemKeys.filter(
          (value) => value !== key,
        ),
      };
    }
    return {
      ...overlay,
      excludeItemKeys: uniqueNonEmpty([...overlay.excludeItemKeys, key]),
      includeItemKeys: overlay.includeItemKeys.filter((value) => value !== key),
    };
  }

  visibleProfiles<T extends { disabled: boolean }>(
    profiles: readonly T[],
  ): readonly T[] {
    return profiles.filter((profile) => !profile.disabled);
  }

  previewMerge(
    profiles: readonly {
      lineageId: string;
      name: string;
      memberItemKeys: readonly string[];
    }[],
  ): MergePreview {
    if (profiles.length < 2) throw new Error("至少选择两个画像才能合并");
    return {
      type: "merge",
      lineageIds: profiles.map(({ lineageId }) => lineageId).sort(),
      memberItemKeys: uniqueNonEmpty(
        profiles.flatMap(({ memberItemKeys }) => memberItemKeys),
      ),
      confirmed: false,
    };
  }

  previewSplit(
    profile: {
      lineageId: string;
      name: string;
      memberItemKeys: readonly string[];
    },
    groups: readonly (readonly string[])[],
  ): SplitPreview {
    const normalized = groups
      .map(uniqueNonEmpty)
      .filter((group) => group.length > 0);
    const union = uniqueNonEmpty(normalized.flat());
    if (
      normalized.length < 2 ||
      union.length !== uniqueNonEmpty(profile.memberItemKeys).length
    ) {
      throw new Error("拆分预览必须覆盖原画像的全部成员且至少分成两组");
    }
    return {
      type: "split",
      lineageId: profile.lineageId,
      groups: normalized,
      confirmed: false,
    };
  }

  confirmStructureOperation(
    overlay: ProfileOverlay,
    preview: MergePreview | SplitPreview,
  ): ProfileOverlay {
    const operation: StructureOperation =
      preview.type === "merge"
        ? { type: "merge", lineageIds: preview.lineageIds }
        : {
            type: "split",
            lineageId: preview.lineageId,
            groups: preview.groups,
          };
    return {
      ...overlay,
      structureOperations: [...overlay.structureOperations, operation],
    };
  }

  validateManualProfile(input: {
    name: string;
    keywords: readonly string[];
    representativeItemKeys: readonly string[];
  }): { readonly ok: boolean; readonly reason?: string } {
    if (!input.name.trim()) return { ok: false, reason: "画像名称不能为空" };
    if (
      !input.keywords.some((keyword) => keyword.trim()) &&
      !input.representativeItemKeys.length
    ) {
      return { ok: false, reason: "至少提供一个关键词或代表论文" };
    }
    return { ok: true };
  }
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
