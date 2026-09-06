import { config } from "../package.json";
import { AddonLifecycle } from "./bootstrap/addonLifecycle";
import {
  CorpusEstimator,
  ZoteroEligiblePaperCounter,
} from "./application/corpusEstimator";
import {
  ProfileEditor,
  type ProfileOverlay,
} from "./domain/profiles/profileEditor";
import { PreferencesRepository } from "./infrastructure/settings/preferences";
import { ItemSnapshotRepository } from "./infrastructure/storage/itemSnapshotRepository";
import { ProfileOverlayRepository } from "./infrastructure/storage/profileOverlayRepository";
import { OperationTaskRepository } from "./infrastructure/storage/operationTaskRepository";
import { PluginDatabase } from "./infrastructure/storage/pluginDatabase";
import { CorpusNotifier } from "./infrastructure/zotero/corpusNotifier";
import { ProfileItemMenu } from "./infrastructure/zotero/profileItemMenu";
import { validateZoteroVersion } from "./infrastructure/zotero/zoteroVersion";
import { RecommendationWorkspaceController } from "./ui/recommendations/recommendationWorkspace";
import { SettingsController } from "./ui/settings/settingsController";
import {
  SetupWizard,
  type InitialProfileTaskRequest,
} from "./ui/settings/setupWizard";
import { PluginRuntime } from "./application/pluginRuntime";

async function onStartup(): Promise<void> {
  const version = validateZoteroVersion(Zotero.version);
  if (!version.ok) {
    throw new Error(`${version.error.code}: ${version.error.message}`);
  }

  const lifecycle = new AddonLifecycle({
    initialization: Zotero.initializationPromise,
    unlocked: Zotero.unlockPromise,
    uiReady: Zotero.uiReadyPromise,
  });
  addon.data.lifecycle = lifecycle;
  await lifecycle.start();

  const database = new PluginDatabase();
  await database.open();
  addon.data.database = database;
  const operationTaskRepository = new OperationTaskRepository(database);
  await operationTaskRepository.markRunningInterrupted();
  addon.data.operationTaskRepository = operationTaskRepository;
  const preferences = new PreferencesRepository();
  const runtime = new PluginRuntime({
    database,
    tasks: operationTaskRepository,
    preferences,
  });
  addon.data.runtime = runtime;
  lifecycle.registerDisposer(() => {
    if (addon.data.operationTaskRepository === operationTaskRepository) {
      addon.data.operationTaskRepository = undefined;
    }
  });
  lifecycle.registerDisposer(async () => {
    await database.close();
    if (addon.data.database === database) addon.data.database = undefined;
  });

  const corpusNotifier = new CorpusNotifier({
    repository: new ItemSnapshotRepository(database),
  });
  corpusNotifier.register();
  addon.data.corpusNotifier = corpusNotifier;
  lifecycle.registerDisposer(() => {
    corpusNotifier.destroy();
    if (addon.data.corpusNotifier === corpusNotifier) {
      addon.data.corpusNotifier = undefined;
    }
  });

  const overlayRepository = new ProfileOverlayRepository(database);
  const profileItemMenu = new ProfileItemMenu({
    onInclude: (item) =>
      applyProfileItemAction(item, "include", overlayRepository),
    onExclude: (item) =>
      applyProfileItemAction(item, "exclude", overlayRepository),
  });
  addon.data.profileItemMenu = profileItemMenu;
  const firstWindow = Zotero.getMainWindow();
  if (firstWindow) profileItemMenu.register(firstWindow);
  lifecycle.registerDisposer(() => {
    profileItemMenu.destroy();
    if (addon.data.profileItemMenu === profileItemMenu) {
      addon.data.profileItemMenu = undefined;
    }
  });

  const preferencesPaneID = await Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    id: `${config.addonRef}-preferences`,
    src: rootURI + "content/preferences.xhtml",
    label: config.addonName,
    image: `chrome://${config.addonRef}/content/icons/${config.addonRef}.svg`,
  });
  addon.data.preferencesPaneID = preferencesPaneID;
  lifecycle.registerDisposer(() => {
    for (const controller of addon.data.settingsControllers) {
      controller.destroy();
    }
    addon.data.settingsControllers.clear();
    Zotero.PreferencePanes.unregister(preferencesPaneID);
    addon.data.preferencesPaneID = undefined;
  });

  const workspaceController = new RecommendationWorkspaceController({
    runtime,
    tasks: operationTaskRepository,
    profiles: await runtime.getProfileOptions(),
    initialCount: Number(preferences.get("recommendationCount")) || 5,
  });
  addon.data.workspaceController = workspaceController;
  for (const win of Zotero.getMainWindows()) {
    await onMainWindowLoad(win);
  }
  workspaceController.registerMenu();
  lifecycle.registerDisposer(() => {
    workspaceController.destroy();
    if (addon.data.workspaceController === workspaceController) {
      addon.data.workspaceController = undefined;
    }
  });

  addon.data.initialized = true;
  if (__env__ === "development") {
    Zotero.debug(`[${config.addonName}] plugin initialized`);
  }
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  win.MozXULElement.insertFTLIfNeeded(`${config.addonRef}-mainWindow.ftl`);
  addon.data.workspaceController?.mountWindow(win);
  addon.data.profileItemMenu?.register(win);
}

async function onMainWindowUnload(win: Window): Promise<void> {
  addon.data.workspaceController?.unmountWindow(win);
}

async function onShutdown(): Promise<void> {
  addon.data.initialized = false;
  await addon.data.lifecycle?.shutdown();
  addon.data.lifecycle = undefined;
  addon.data.database = undefined;
  addon.data.corpusNotifier = undefined;
  addon.data.profileItemMenu = undefined;
  addon.data.operationTaskRepository = undefined;
  addon.data.runtime = undefined;
  addon.data.workspaceController = undefined;
  addon.data.preferencesPaneID = undefined;
  addon.data.settingsControllers.clear();
  // @ts-expect-error Plugin instances are intentionally attached by dynamic name.
  delete Zotero[config.addonInstance];
}

async function onPrefsEvent(
  type: string,
  data: { window: Window },
): Promise<void> {
  if (type !== "load") return;
  const preferences = new PreferencesRepository();
  const estimator = new CorpusEstimator(new ZoteroEligiblePaperCounter());
  const setupWizard = new SetupWizard({
    preferences,
    estimator,
    enqueueInitialProfileBuild: (request) =>
      enqueueInitialProfileBuild(request),
  });
  const controller = new SettingsController({
    window: data.window,
    preferences,
    setupWizard,
  });
  addon.data.settingsControllers.add(controller);
  await controller.mount();
}

async function enqueueInitialProfileBuild(
  request: InitialProfileTaskRequest,
): Promise<void> {
  const runtime = addon.data.runtime;
  if (!runtime) throw new Error("插件运行时尚未就绪");
  await runtime.enqueueInitialProfileBuild(request);
}

async function applyProfileItemAction(
  item: Zotero.Item,
  mode: "include" | "exclude",
  repository: ProfileOverlayRepository,
): Promise<void> {
  const connection = addon.data.database?.connection;
  const win = Zotero.getMainWindow();
  if (!connection || !win) return;
  const rows = (await connection.queryAsync(
    `SELECT p.lineage_id, p.system_name
     FROM profiles p JOIN profile_versions v
       ON v.profile_version_id = p.profile_version_id
     WHERE v.status = 'published' AND p.profile_type = 'long-term'
     ORDER BY p.sort_order, p.lineage_id`,
  )) as { lineage_id: string; system_name: string }[] | undefined;
  if (!rows?.length) {
    win.alert("请先完成一次兴趣画像构建。");
    return;
  }
  const selection = { value: 0 };
  const accepted = Services.prompt.select(
    win as unknown as mozIDOMWindowProxy,
    mode === "include" ? "加入兴趣画像" : "从兴趣画像排除",
    "选择要修改的画像",
    rows.map((row) => row.system_name),
    selection,
  );
  if (!accepted || !rows[selection.value]) return;
  const current: ProfileOverlay =
    (await repository.get(rows[selection.value].lineage_id)) ??
    emptyProfileOverlay(rows[selection.value].lineage_id);
  await repository.save(new ProfileEditor().addItem(current, item.key, mode));
}

function emptyProfileOverlay(lineageId: string): ProfileOverlay {
  return {
    lineageId,
    userName: "",
    keywords: [],
    weight: 1,
    locked: false,
    disabled: false,
    includeItemKeys: [],
    excludeItemKeys: [],
    structureOperations: [],
  };
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
