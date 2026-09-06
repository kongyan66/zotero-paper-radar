import hooks from "./hooks";
import type { AddonLifecycle } from "./bootstrap/addonLifecycle";
import type { PluginDatabase } from "./infrastructure/storage/pluginDatabase";
import type { CorpusNotifier } from "./infrastructure/zotero/corpusNotifier";
import type { ProfileItemMenu } from "./infrastructure/zotero/profileItemMenu";
import type { OperationTaskRepository } from "./infrastructure/storage/operationTaskRepository";
import type { RecommendationWorkspaceController } from "./ui/recommendations/recommendationWorkspace";
import type { SettingsController } from "./ui/settings/settingsController";
import type { PluginRuntime } from "./application/pluginRuntime";

class Addon {
  public data: {
    initialized: boolean;
    lifecycle?: AddonLifecycle;
    database?: PluginDatabase;
    corpusNotifier?: CorpusNotifier;
    profileItemMenu?: ProfileItemMenu;
    operationTaskRepository?: OperationTaskRepository;
    runtime?: PluginRuntime;
    workspaceController?: RecommendationWorkspaceController;
    preferencesPaneID?: string;
    settingsControllers: Set<SettingsController>;
  };
  public hooks: typeof hooks;

  constructor() {
    this.data = {
      initialized: false,
      settingsControllers: new Set(),
    };
    this.hooks = hooks;
  }
}

export default Addon;
