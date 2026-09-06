import { EmbeddingBatcher } from "../domain/embeddings/embeddingBatcher.ts";
import {
  createEmbeddingContentHash,
  createModelFingerprint,
  type ModelFingerprint,
} from "../domain/embeddings/modelFingerprint.ts";
import {
  createFeedbackDraft,
  type RecommendationFeedbackAction,
} from "../domain/feedback/feedbackPolicy.ts";
import type {
  ArxivCandidate,
  InterestProfile,
  ScoreBreakdown,
  ZoteroPaper,
} from "../domain/model.ts";
import {
  deduplicateCandidates,
  filterSuppressedCandidates,
} from "../domain/candidates/duplicateFilter.ts";
import { prefilterCandidates } from "../domain/candidates/candidatePrefilter.ts";
import { ProfileBuilder } from "../domain/profiles/profileBuilder.ts";
import {
  ProfileEditor,
  type ProfileOverlay,
} from "../domain/profiles/profileEditor.ts";
import {
  scoreCandidates,
  type ScoredCandidate,
} from "../domain/ranking/relevanceScorer.ts";
import {
  diversityRerank,
  type RerankedCandidate,
} from "../domain/ranking/diversityReranker.ts";
import { DEFAULT_RANKING_WEIGHTS } from "../domain/ranking/defaultWeights.ts";
import {
  RunCoordinator,
  type RunResult,
  type RunStage,
} from "./runCoordinator.ts";
import { ImportService } from "./importService.ts";
import { AttachmentService } from "./attachmentService.ts";
import { SummaryService, type SummaryResult } from "./summaryService.ts";
import type { RecommendationCardModel } from "../ui/recommendations/recommendationCard.ts";
import type { RecommendationToolbarState } from "../ui/recommendations/toolbar.ts";
import type { TaskCenterActions } from "../ui/tasks/taskCenterController.ts";
import { ArxivClient } from "../infrastructure/arxiv/arxivClient.ts";
import { OpenAIChatClient } from "../infrastructure/models/openAIChatClient.ts";
import { OpenAIEmbeddingClient } from "../infrastructure/models/openAIEmbeddingClient.ts";
import { HttpTransport } from "../infrastructure/network/httpTransport.ts";
import {
  DEFAULT_ARXIV_CATEGORIES,
  PreferencesRepository,
} from "../infrastructure/settings/preferences.ts";
import { CorpusReader } from "../infrastructure/zotero/corpusReader.ts";
import { CollectionWriter } from "../infrastructure/zotero/collectionWriter.ts";
import { ZoteroDuplicateDetector } from "../infrastructure/zotero/duplicateDetector.ts";
import { ZoteroItemWriter } from "../infrastructure/zotero/itemWriter.ts";
import {
  suggestCollection,
  type CollectionEvidence,
} from "../domain/importing/collectionClassifier.ts";
import { EmbeddingRepository } from "../infrastructure/storage/embeddingRepository.ts";
import { FeedbackRepository } from "../infrastructure/storage/feedbackRepository.ts";
import { ImportTaskRepository } from "../infrastructure/storage/importTaskRepository.ts";
import { OperationTaskRepository } from "../infrastructure/storage/operationTaskRepository.ts";
import {
  ProfileRepository,
  type PublishedProfileSnapshot,
} from "../infrastructure/storage/profileRepository.ts";
import { ProfileOverlayRepository } from "../infrastructure/storage/profileOverlayRepository.ts";
import {
  RecommendationRepository,
  type RecommendationRunRecord,
} from "../infrastructure/storage/recommendationRepository.ts";
import {
  CandidateRepository,
  type StoredCandidate,
} from "../infrastructure/storage/candidateRepository.ts";
import { SummaryRepository } from "../infrastructure/storage/summaryRepository.ts";
import {
  filterUnseenCandidates,
  recommendationHistoryStart,
  type RecommendationHistoryDay,
} from "../domain/recommendations/recommendationHistory.ts";
import { RankingWeightRepository } from "../infrastructure/storage/weightRepository.ts";
import { WeightLearningService } from "./weightLearningService.ts";
import { DiagnosticsService } from "./diagnosticsService.ts";
import {
  RunLogger,
  type DiagnosticsExport,
} from "../infrastructure/diagnostics/runLogger.ts";
import { ItemSnapshotRepository } from "../infrastructure/storage/itemSnapshotRepository.ts";
import type { PluginDatabase } from "../infrastructure/storage/pluginDatabase.ts";

export interface RuntimeProfileOption {
  readonly id: string;
  readonly name: string;
  readonly disabled?: boolean;
}

export interface PluginRuntimeOptions {
  readonly database: PluginDatabase;
  readonly tasks: OperationTaskRepository;
  readonly preferences?: PreferencesRepository;
  readonly now?: () => Date;
}

interface ProfileBuildState {
  reason: string;
  corpus?: Awaited<ReturnType<CorpusReader["read"]>>;
  generation?: ModelFingerprint;
  vectors?: ReadonlyMap<string, readonly number[]>;
  stageTimings: Record<string, number>;
}

interface RecommendationState {
  query: RecommendationToolbarState;
  corpus?: Awaited<ReturnType<CorpusReader["read"]>>;
  profile?: PublishedProfileSnapshot;
  generation?: ModelFingerprint;
  candidates?: readonly ArxivCandidate[];
  candidateVectors?: ReadonlyMap<string, readonly number[]>;
  scored?: readonly ScoredCandidate[];
  reranked?: readonly RerankedCandidate[];
  runID?: string;
  models?: readonly RecommendationCardModel[];
  stageTimings: Record<string, number>;
}

const NORMALIZATION_VERSION = "l2-v1";
const PROFILE_SEED = 42;

export class PluginRuntime {
  readonly #database: PluginDatabase;
  readonly #tasks: OperationTaskRepository;
  readonly #preferences: PreferencesRepository;
  readonly #now: () => Date;
  readonly #coordinator: RunCoordinator;
  readonly #profiles: ProfileRepository;
  readonly #embeddings: EmbeddingRepository;
  readonly #recommendations: RecommendationRepository;
  readonly #candidates: CandidateRepository;
  readonly #feedback: FeedbackRepository;
  readonly #imports: ImportService;
  readonly #importTasks: ImportTaskRepository;
  readonly #attachments: AttachmentService;
  readonly #weights: RankingWeightRepository;
  readonly #weightLearning: WeightLearningService;
  readonly #snapshots: ItemSnapshotRepository;
  readonly #logger = new RunLogger();
  readonly #diagnostics: DiagnosticsService;
  readonly #profileBuilds = new Map<string, ProfileBuildState>();
  readonly #recommendationRuns = new Map<string, RecommendationState>();
  #latestModels: readonly RecommendationCardModel[] = [];
  #idSequence = 0;

  constructor(options: PluginRuntimeOptions) {
    this.#database = options.database;
    this.#tasks = options.tasks;
    this.#preferences = options.preferences ?? new PreferencesRepository();
    this.#now = options.now ?? (() => new Date());
    this.#coordinator = new RunCoordinator({ tasks: this.#tasks });
    this.#profiles = new ProfileRepository(this.#database, {
      now: this.#now,
    });
    this.#embeddings = new EmbeddingRepository(this.#database, this.#now);
    this.#recommendations = new RecommendationRepository(this.#database);
    this.#candidates = new CandidateRepository(this.#database, this.#now);
    this.#feedback = new FeedbackRepository(this.#database);
    this.#importTasks = new ImportTaskRepository(this.#database);
    this.#imports = new ImportService({
      tasks: this.#importTasks,
      items: new ZoteroItemWriter(),
      feedback: this.#feedback,
      detect: (candidate) => new ZoteroDuplicateDetector().find(candidate),
      addCollection: async (item, collection) => {
        const result = await new CollectionWriter().addItemToCollection(
          item.itemKey,
          item.libraryID,
          collection.name ?? collection.key ?? "",
        );
        return result.collectionKey;
      },
    });
    this.#attachments = new AttachmentService(this.#importTasks);
    this.#weights = new RankingWeightRepository(this.#database);
    this.#weightLearning = new WeightLearningService(
      this.#feedback,
      this.#weights,
    );
    this.#snapshots = new ItemSnapshotRepository(this.#database);
    this.#diagnostics = new DiagnosticsService(this.#database, this.#logger);
  }

  isReady(): boolean {
    const settings = this.#preferences.getModelSettings();
    return Boolean(
      this.#preferences.get("setupComplete") &&
      settings.embeddingBaseURL.trim() &&
      settings.embeddingModel.trim(),
    );
  }

  getArxivCategories(): readonly string[] {
    return this.#preferences.getArxivCategories();
  }

  async getProfileOptions(): Promise<readonly RuntimeProfileOption[]> {
    const snapshot = await this.#profiles.getPublished();
    return (snapshot?.profiles ?? []).map((profile) => ({
      id: profile.lineageId,
      name: `${profile.horizon === "recent" ? "近期" : "长期"} · ${profile.name}`,
      disabled: profile.disabled,
    }));
  }

  async getProfileDetails(): Promise<readonly RuntimeProfileDetail[]> {
    const snapshot = await this.#profiles.getPublished();
    return (snapshot?.profiles ?? []).map((profile) => ({
      lineageId: profile.lineageId,
      name: profile.name,
      horizon: profile.horizon,
      keywords: profile.keywords,
      memberCount: profile.memberCount,
      confidence: profile.confidence,
      stability: profile.stability,
      collectionShare: profile.collectionShare,
      representativeItemKeys: profile.representativeItemKeys,
      representativeTitles: profile.representativeItemKeys.flatMap((key) => {
        const item = Zotero.Items.getByLibraryAndKey(
          Zotero.Libraries.userLibraryID,
          key,
        );
        const title = item && item.getField("title");
        return typeof title === "string" && title.trim() ? [title] : [];
      }),
      locked: profile.locked,
      disabled: profile.disabled,
    }));
  }

  async editProfile(lineageID: string): Promise<void> {
    const snapshot = await this.#profiles.getPublished();
    const profile = snapshot?.profiles.find(
      (candidate) => candidate.lineageId === lineageID,
    );
    const win = Zotero.getMainWindow();
    if (!profile || !win) return;
    const overlayRepository = new ProfileOverlayRepository(this.#database);
    const existing =
      (await overlayRepository.get(lineageID)) ?? emptyOverlay(lineageID);
    const name = win.prompt("编辑兴趣画像名称", profile.name);
    if (name === null) return;
    const keywords = win.prompt(
      "编辑关键词，用逗号分隔",
      profile.keywords.join(", "),
    );
    if (keywords === null) return;
    const overlay = new ProfileEditor().editOverlay(existing, {
      userName: name,
      keywords: keywords.split(","),
    });
    await overlayRepository.save(overlay);
  }

  async updateProfileFlags(
    lineageID: string,
    changes: { readonly locked?: boolean; readonly disabled?: boolean },
  ): Promise<void> {
    const repository = new ProfileOverlayRepository(this.#database);
    const overlay =
      (await repository.get(lineageID)) ?? emptyOverlay(lineageID);
    await repository.save(new ProfileEditor().editOverlay(overlay, changes));
  }

  async mergeProfiles(): Promise<void> {
    const snapshot = await this.#profiles.getPublished();
    const win = Zotero.getMainWindow();
    if (!snapshot || !win) return;
    const selected = selectProfilesByPrompt(win, snapshot, 2);
    if (selected.length < 2) {
      win.alert("合并至少需要两个画像，请使用画像 ID 或名称重试。");
      return;
    }
    const preview = new ProfileEditor().previewMerge(selected);
    const confirmed = win.confirm(
      `合并预览：${selected.map((profile) => profile.name).join(" + ")}，共 ${preview.memberItemKeys.length} 篇成员。确认后会写入 overlay 审计记录。`,
    );
    if (!confirmed) return;
    const target = selected[0];
    const repository = new ProfileOverlayRepository(this.#database);
    const overlay =
      (await repository.get(target.lineageId)) ??
      emptyOverlay(target.lineageId);
    await repository.save(
      new ProfileEditor().confirmStructureOperation(overlay, preview),
    );
    this.#logger.record({
      type: "user-action",
      occurredAt: this.#now().toISOString(),
      detail: {
        action: "merge-profiles",
        profileLineageIDs: preview.lineageIds,
        memberCount: preview.memberItemKeys.length,
      },
    });
  }

  async splitProfile(): Promise<void> {
    const snapshot = await this.#profiles.getPublished();
    const win = Zotero.getMainWindow();
    if (!snapshot || !win) return;
    const selected = selectProfilesByPrompt(win, snapshot, 1)[0];
    if (!selected) return;
    const groupsText = win.prompt(
      "拆分成员分组",
      "每组用逗号分隔，组之间用分号分隔",
    );
    if (groupsText === null) return;
    const groups = groupsText
      .split(";")
      .map((group) => group.split(","))
      .filter((group) => group.some((key) => key.trim()));
    let preview;
    try {
      preview = new ProfileEditor().previewSplit(selected, groups);
    } catch (error) {
      win.alert(error instanceof Error ? error.message : "拆分预览失败");
      return;
    }
    if (
      !win.confirm(
        `拆分预览：${selected.name} 将拆成 ${preview.groups.length} 组，共 ${preview.groups.flat().length} 篇成员。确认后会写入 overlay 审计记录。`,
      )
    ) {
      return;
    }
    const repository = new ProfileOverlayRepository(this.#database);
    const overlay =
      (await repository.get(selected.lineageId)) ??
      emptyOverlay(selected.lineageId);
    await repository.save(
      new ProfileEditor().confirmStructureOperation(overlay, preview),
    );
    this.#logger.record({
      type: "user-action",
      occurredAt: this.#now().toISOString(),
      detail: {
        action: "split-profile",
        profileLineageID: selected.lineageId,
        groupCount: preview.groups.length,
      },
    });
  }

  async rollbackProfileVersion(): Promise<void> {
    const versions = await this.#profiles.listVersions();
    const snapshot = await this.#profiles.getPublished();
    const win = Zotero.getMainWindow();
    if (!win || !versions.length) return;
    const previous = versions.find((version) => version.status === "archived");
    const choices = versions
      .map(
        (version) =>
          `${version.versionID} · ${version.status} · ${version.createdAt}`,
      )
      .join("\n");
    const selectedID = win.prompt(
      `选择要恢复的画像版本（当前列表）：\n${choices}`,
      previous?.versionID ?? "",
    );
    if (!selectedID?.trim()) return;
    const selected = versions.find(
      (version) => version.versionID === selectedID.trim(),
    );
    if (!selected) {
      win.alert("没有找到该画像版本。");
      return;
    }
    const preserveOverlay = win.confirm(
      "是否保留当前的人工画像覆盖（名称、关键词、锁定和停用状态）？",
    );
    await this.#profiles.rollback(selected.versionID);
    if (!preserveOverlay && snapshot) {
      const repository = new ProfileOverlayRepository(this.#database);
      for (const profile of snapshot.profiles)
        await repository.delete(profile.lineageId);
    }
    this.#latestModels = [];
    this.#logger.record({
      type: "user-action",
      occurredAt: this.#now().toISOString(),
      detail: {
        action: "rollback-profile-version",
        versionID: selected.versionID,
        preserveOverlay,
      },
    });
  }

  async getDiagnosticsSummary(): Promise<DiagnosticsExport> {
    return this.#diagnostics.export(this.diagnosticEnvironment());
  }

  async exportDiagnostics(options: {
    readonly includeSampleContent: boolean;
  }): Promise<string> {
    const value = await this.#diagnostics.export(
      this.diagnosticEnvironment(),
      options,
    );
    const file = Zotero.getProfileDirectory().clone();
    file.append(
      `zotero-arxiv-daily-diagnostics-${this.#now()
        .toISOString()
        .replace(/[^0-9]/g, "")}.json`,
    );
    await Zotero.File.putContentsAsync(file, JSON.stringify(value, null, 2));
    await Zotero.File.reveal(file.path);
    return file.path;
  }

  async clearDerivedCache(): Promise<void> {
    const connection = this.#database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    await connection.executeTransaction(async () => {
      await connection.queryAsync("DELETE FROM embedding_cache");
      await connection.queryAsync("DELETE FROM summary_cache");
    });
    this.#latestModels = [];
  }

  async rebuildDerivedData(): Promise<void> {
    await this.clearDerivedCache();
    const corpus = await new CorpusReader().read();
    await this.enqueueProfileBuild({
      reason: "diagnostics-rebuild",
      requestedAt: this.#now().toISOString(),
      estimatedPaperCount: corpus.papers.length,
    });
  }

  getCachedModels(): readonly RecommendationCardModel[] {
    return this.#latestModels;
  }

  async getRecommendationHistory(): Promise<
    readonly RecommendationHistoryDay[]
  > {
    const now = this.#now();
    await this.#recommendations.pruneBefore(
      recommendationHistoryStart(now).toISOString(),
    );
    return this.#recommendations.listHistoryDays(now);
  }

  async getLatestRecommendationDay(): Promise<string | undefined> {
    return (await this.getRecommendationHistory())[0]?.dayKey;
  }

  async loadRecommendationsForDay(
    dayKey: string,
    profileIDs: readonly string[] = [],
  ): Promise<readonly RecommendationCardModel[]> {
    const history = await this.getRecommendationHistory();
    const selectedDay = history.find((day) => day.dayKey === dayKey);
    if (!selectedDay) return [];
    const runs = await this.#recommendations.listPublishedRunsSince(
      recommendationHistoryStart(this.#now()).toISOString(),
    );
    const run = runs.find((candidate) => candidate.runID === selectedDay.runID);
    if (!run) return [];
    const models = await this.loadModelsForRun(
      run,
      await this.#profiles.getPublished(),
    );
    return filterModelsByProfileIDs(models, profileIDs);
  }

  async loadCachedModels(
    options: { readonly generateMissingSummaries?: boolean } = {},
  ): Promise<readonly RecommendationCardModel[]> {
    const latest = await this.#recommendations.latestPublished();
    if (!latest) return [];
    const snapshot = await this.#profiles.getPublished();
    const models = await this.loadModelsForRun(latest, snapshot, options);
    this.#latestModels = models;
    return models;
  }

  private async loadModelsForRun(
    run: RecommendationRunRecord,
    snapshot: PublishedProfileSnapshot | undefined,
    options: { readonly generateMissingSummaries?: boolean } = {},
  ): Promise<readonly RecommendationCardModel[]> {
    const stored = await this.#candidates.listRunCandidates(run.runID);
    const summaryService = this.createSummaryService();
    const models: RecommendationCardModel[] = [];
    for (const candidate of stored) {
      const summary = options.generateMissingSummaries
        ? await summaryService.summarize(candidate)
        : await summaryService.loadCached(candidate);
      models.push(
        this.modelFromStored(
          candidate,
          run.runID,
          run.profileVersionID,
          snapshot,
          recommendationSummary(summary),
        ),
      );
    }
    return models;
  }

  async enqueueInitialProfileBuild(request: {
    readonly reason: "setup-confirmed";
    readonly requestedAt: string;
    readonly estimatedPaperCount: number;
  }): Promise<void> {
    await this.enqueueProfileBuild(request);
  }

  async enqueueProfileBuild(request: {
    readonly reason: string;
    readonly requestedAt: string;
    readonly estimatedPaperCount: number;
  }): Promise<void> {
    const existing = (await this.#tasks.list()).find(
      (task) =>
        task.taskType === "build-profile" &&
        ["queued", "running", "interrupted"].includes(task.status),
    );
    if (existing) return;
    void this.buildProfiles(request).catch((error) => this.logError(error));
  }

  async refresh(
    query: RecommendationToolbarState,
  ): Promise<readonly RecommendationCardModel[]> {
    if (!this.isReady()) throw new Error("请先在 Zotero 设置中完成模型配置");
    await this.#recommendations.pruneBefore(
      recommendationHistoryStart(this.#now()).toISOString(),
    );
    const taskID = this.nextID("recommend");
    const normalizedQuery = normalizeQuery(query);
    this.#preferences.saveArxivCategories(normalizedQuery.categories.join(","));
    const state: RecommendationState = {
      query: normalizedQuery,
      stageTimings: {},
    };
    this.#recommendationRuns.set(taskID, state);
    try {
      const result = await this.#coordinator.start({
        taskID,
        taskType: "recommendation",
        total: 7,
        checkpoint: { query: state.query },
        stages: this.recommendationStages(taskID),
      });
      if (result.status !== "completed") {
        const task = await this.#tasks.get(taskID);
        throw new Error(task?.errorMessage ?? "推荐任务未完成");
      }
      const models = state.models ?? [];
      if (models.length) return models;
      return this.loadCachedModelsForQuery(state.query);
    } finally {
      this.#recommendationRuns.delete(taskID);
    }
  }

  taskActions(): TaskCenterActions {
    return {
      cancel: (taskID) => this.#coordinator.cancel(taskID),
      resume: (taskID) => this.resume(taskID),
      retry: (taskID) => this.resume(taskID),
    };
  }

  async saveRecommendation(model: RecommendationCardModel): Promise<void> {
    const runID = model.runID ?? "manual-import";
    const profile = await this.profileForModel(model);
    const collection = profile
      ? await this.chooseCollection(model, profile)
      : undefined;
    const imported = await this.#imports.save({
      candidate: model.candidate,
      runID,
      score: model.score.rerankedScore,
      rank: model.rank,
      targetCollectionKey: collection?.key,
      targetCollectionName: collection?.name,
    });
    const item = Zotero.Items.getByLibraryAndKey(
      Zotero.Libraries.userLibraryID,
      imported.itemKey,
    );
    if (!item) throw new Error("Zotero 条目已写入，但无法找到条目对象");
    await this.#importTasks.update(imported.taskID, {
      attachmentStatus: "queued",
    });
    try {
      await this.#attachments.attach({
        taskID: imported.taskID,
        candidate: model.candidate,
        parentItemID: item.id,
        libraryID: item.libraryID,
      });
    } catch (error) {
      this.logError(error);
      throw new Error("元数据已保存，但 PDF 下载失败，可在任务中心重试");
    }
    void this.learnWeights();
  }

  private async loadCachedModelsForQuery(
    query: RecommendationToolbarState,
    options: { readonly generateMissingSummaries?: boolean } = {},
  ): Promise<readonly RecommendationCardModel[]> {
    const models = await this.loadCachedModels(options);
    return filterModelsByProfileIDs(models, query.profileIDs);
  }

  async recordFeedback(
    model: RecommendationCardModel,
    action: RecommendationFeedbackAction,
  ): Promise<void> {
    const profile = await this.profileForModel(model);
    await this.#feedback.record(
      createFeedbackDraft({
        runID: model.runID ?? "manual-feedback",
        arxivID: model.candidate.arxivId,
        action,
        profileLineageIDs: profile ? [profile.lineageId] : [],
        score: model.score.rerankedScore,
        candidateRank: model.rank,
        occurredAt: this.#now().toISOString(),
      }),
    );
    void this.learnWeights();
  }

  private async buildProfiles(request: {
    readonly reason: string;
    readonly requestedAt: string;
    readonly estimatedPaperCount: number;
  }): Promise<RunResult> {
    const taskID = this.nextID("profile-build");
    const state: ProfileBuildState = {
      reason: request.reason,
      stageTimings: {},
    };
    this.#profileBuilds.set(taskID, state);
    try {
      const result = await this.#coordinator.start({
        taskID,
        taskType: "build-profile",
        total: 3,
        checkpoint: {
          reason: request.reason,
          estimatedPaperCount: request.estimatedPaperCount,
          requestedAt: request.requestedAt,
        },
        stages: this.profileStages(taskID),
      });
      if (result.status === "completed") this.#latestModels = [];
      return result;
    } finally {
      this.#profileBuilds.delete(taskID);
    }
  }

  private profileStages(taskID: string): RunStage[] {
    const state = this.#profileBuilds.get(taskID)!;
    const stages: RunStage[] = [
      {
        name: "corpus-check",
        run: async ({ report }) => {
          state.corpus = await new CorpusReader().read();
          await report(state.corpus.papers.length, state.corpus.papers.length, {
            corpusCount: state.corpus.papers.length,
          });
          return { corpusCount: state.corpus.papers.length };
        },
      },
      {
        name: "embedding",
        run: async ({ signal, report }) => {
          const corpus = state.corpus ?? (await new CorpusReader().read());
          state.corpus = corpus;
          if (!corpus.papers.length)
            throw new Error("Zotero 中没有可用于画像的论文");
          const clients = this.createClients();
          state.generation = await this.resolveGeneration(
            clients.embeddingClient,
            signal,
          );
          const result = await new EmbeddingBatcher({
            batchSize: this.#preferences.getModelSettings().embeddingBatchSize,
            onProgress: (progress) => {
              void report(progress.completed, progress.total, {
                cacheHits: progress.cacheHits,
                embeddingRequested: progress.requested,
              });
            },
          }).run({
            items: corpus.papers.map(toEmbeddingWorkItem),
            generation: state.generation,
            client: clients.embeddingClient,
            store: this.#embeddings,
            signal,
          });
          state.vectors = result.vectors;
          return {
            generationID: state.generation.generationID,
            cacheHits: result.cacheHits,
            embeddingRequested: result.requested,
          };
        },
      },
      {
        name: "publish",
        run: async ({ report }) => {
          if (!state.corpus || !state.generation || !state.vectors) {
            throw new Error("画像构建上下文不完整");
          }
          const previous = await this.#profiles.getPublished();
          const build = new ProfileBuilder({
            seed: PROFILE_SEED,
            now: this.#now,
          }).build({
            papers: state.corpus.papers,
            vectors: state.vectors,
            reason: state.reason,
            corpusFingerprint: state.corpus.fingerprint,
            previousProfiles: previous?.profiles,
          });
          await this.#profiles.saveDraft(
            build,
            state.generation.generationID,
            state.corpus.papers,
          );
          await this.#embeddings.publishGeneration(
            state.generation.generationID,
          );
          await this.#profiles.publish(build.versionId);
          await this.#snapshots.clearDirty();
          await report(1, 1, {
            profileVersionID: build.versionId,
            profileCount: build.profiles.length,
          });
          return {
            profileVersionID: build.versionId,
            profileCount: build.profiles.length,
          };
        },
      },
    ];
    return this.traceStages(taskID, state, stages);
  }

  private recommendationStages(taskID: string): RunStage[] {
    const state = this.#recommendationRuns.get(taskID)!;
    const stages: RunStage[] = [
      {
        name: "corpus-check",
        run: async () => {
          state.corpus = await new CorpusReader().read();
          return { corpusCount: state.corpus.papers.length };
        },
      },
      {
        name: "profile",
        run: async () => {
          state.profile = await this.#profiles.getPublished();
          if (!state.profile?.profiles.length) {
            throw new Error("请先完成一次兴趣画像构建");
          }
          state.generation = await this.generationForProfile(
            state.profile.generationID,
          );
          return {
            profileVersionID: state.profile.versionID,
            generationID: state.generation.generationID,
          };
        },
      },
      {
        name: "arxiv",
        run: async ({ signal }) => {
          if (!state.profile) throw new Error("兴趣画像尚未加载");
          const latest = await this.#recommendations.latestPublished();
          const query = state.query;
          const clients = this.createClients();
          const result = await new ArxivClient({
            transport: clients.transport,
          }).fetchCandidates({
            categories: query.categories,
            lastSuccessfulAt: query.lookbackDays
              ? undefined
              : latest?.createdAt,
            manualDays: query.lookbackDays,
            maxResults: Math.min(2_000, Math.max(50, query.count * 20)),
            signal,
          });
          const keywords = state.profile.profiles.flatMap(
            (profile) => profile.keywords,
          );
          const prefiltered = prefilterCandidates(result.candidates, {
            systemKeywords: keywords,
            seed: result.window.from.toISOString(),
          });
          const deduplicated = deduplicateCandidates(prefiltered.candidates);
          const previouslyRecommended = new Set(
            await this.#candidates.listRecommendedArxivIDsSince(
              recommendationHistoryStart(this.#now()).toISOString(),
            ),
          );
          const unseen = filterUnseenCandidates(
            deduplicated.candidates,
            previouslyRecommended,
          );
          const suppression = filterSuppressedCandidates(
            unseen,
            await this.#feedback.listSuppressions(),
            this.#now(),
          );
          state.candidates = suppression.candidates;
          return {
            arxivCount: result.candidates.length,
            candidateCount: state.candidates.length,
            suppressedCount: suppression.suppressed.length,
            historySuppressedCount:
              deduplicated.candidates.length - unseen.length,
          };
        },
      },
      {
        name: "candidate-embedding",
        run: async ({ signal, report }) => {
          if (!state.candidates || !state.generation) {
            throw new Error("候选论文上下文不完整");
          }
          const clients = this.createClients();
          const result = await new EmbeddingBatcher({
            batchSize: this.#preferences.getModelSettings().embeddingBatchSize,
            onProgress: (progress) => {
              void report(progress.completed, progress.total, {
                cacheHits: progress.cacheHits,
                embeddingRequested: progress.requested,
              });
            },
          }).run({
            items: state.candidates.map(toCandidateEmbeddingWorkItem),
            generation: state.generation,
            client: clients.embeddingClient,
            store: this.#embeddings,
            signal,
          });
          state.candidateVectors = result.vectors;
          return {
            cacheHits: result.cacheHits,
            embeddingRequested: result.requested,
          };
        },
      },
      {
        name: "scoring",
        run: async () => {
          if (
            !state.candidates ||
            !state.candidateVectors ||
            !state.profile ||
            !state.generation
          ) {
            throw new Error("排序上下文不完整");
          }
          const representatives = await this.loadRepresentatives(
            state.profile,
            state.corpus?.papers ?? [],
            state.generation,
          );
          const negativeSignals = await this.loadNegativeSignals(
            state,
            state.generation,
          );
          const activeWeights = await this.#weights.ensureDefault(
            DEFAULT_RANKING_WEIGHTS,
            this.#now().toISOString(),
          );
          state.scored = scoreCandidates(
            state.candidates.flatMap((candidate) => {
              const vector = state.candidateVectors!.get(candidate.arxivId);
              return vector ? [{ candidate, vector }] : [];
            }),
            {
              recentProfiles: state.profile.profiles.filter(
                (profile) => profile.horizon === "recent",
              ),
              longTermProfiles: state.profile.profiles.filter(
                (profile) => profile.horizon === "long-term",
              ),
              representatives,
              negativeSignals,
              now: this.#now(),
              selectedProfileIDs: state.query.profileIDs.length
                ? state.query.profileIDs
                : undefined,
            },
            activeWeights.weights,
          );
          return {
            scoredCount: state.scored.length,
            weightVersionID: activeWeights.weightVersionID,
          };
        },
      },
      {
        name: "rerank",
        run: async () => {
          if (
            !state.scored ||
            !state.candidateVectors ||
            !state.profile ||
            !state.generation
          ) {
            throw new Error("重排上下文不完整");
          }
          state.reranked = diversityRerank(
            state.scored.flatMap((candidate) => {
              const vector = state.candidateVectors!.get(
                candidate.candidate.arxivId,
              );
              return vector ? [{ ...candidate, vector }] : [];
            }),
            { limit: state.query.count },
          );
          state.runID = `run-${this.#now().getTime().toString(36)}`;
          const activeWeights = await this.#weights.ensureDefault(
            DEFAULT_RANKING_WEIGHTS,
            this.#now().toISOString(),
          );
          await this.#recommendations.createRun({
            runID: state.runID,
            queryScope: {
              categories: state.query.categories,
              count: state.query.count,
              lookbackDays: state.query.lookbackDays ?? null,
            },
            targetProfileIDs: state.query.profileIDs,
            generationID: state.generation.generationID,
            profileVersionID: state.profile.versionID,
            weightVersionID: activeWeights.weightVersionID,
            now: this.#now().toISOString(),
          });
          await this.#candidates.saveRunCandidates(
            state.runID,
            state.reranked.map((candidate, index) =>
              storedCandidate(candidate, index + 1),
            ),
          );
          return {
            runID: state.runID,
            runCandidateCount: state.reranked.length,
          };
        },
      },
      {
        name: "summary",
        run: async ({ signal }) => {
          if (!state.reranked || !state.profile || !state.runID) {
            throw new Error("摘要上下文不完整");
          }
          const summaryService = this.createSummaryService();
          const models: RecommendationCardModel[] = [];
          if (state.reranked.length === 0) {
            models.push(
              ...(await this.loadCachedModelsForQuery(state.query, {
                generateMissingSummaries: true,
              })),
            );
          } else {
            for (const candidate of state.reranked) {
              if (signal.aborted) signal.throwIfAborted?.();
              const summary = await summaryService.summarize(
                candidate.candidate,
                signal,
              );
              models.push(
                this.modelFromReranked(
                  candidate,
                  state,
                  summary,
                  models.length + 1,
                ),
              );
            }
          }
          state.models = models;
          this.#latestModels = models;
          await this.#recommendations.completeRun(
            state.runID,
            state.stageTimings,
            this.#now().toISOString(),
          );
          return {
            summaryCount: models.filter(
              (model) => model.summary?.source !== "arxiv",
            ).length,
            fallbackCount: models.filter(
              (model) => model.summary?.source === "arxiv",
            ).length,
          };
        },
      },
    ];
    return this.traceStages(taskID, state, stages);
  }

  private async resume(taskID: string): Promise<void> {
    const task = await this.#tasks.get(taskID);
    if (!task) throw new Error("未知任务");
    if (!(task.status === "interrupted" || task.status === "failed")) {
      throw new Error("只有中断或失败任务可以继续");
    }
    // Runtime stage data is intentionally in-memory. Re-enter from the first
    // stage so a restart never claims to resume with missing vectors or papers.
    await this.#tasks.update(taskID, {
      status: task.status,
      stage: "queued",
      completed: 0,
      retryCount: task.retryCount + 1,
      checkpoint: { ...task.checkpoint, resumedFrom: task.stage },
      now: this.#now().toISOString(),
    });
    if (task.taskType === "recommendation") {
      const query = readQuery(task.checkpoint.query);
      const state: RecommendationState = { query, stageTimings: {} };
      this.#recommendationRuns.set(taskID, state);
      try {
        await this.#coordinator.resume(
          taskID,
          this.recommendationStages(taskID),
        );
      } finally {
        this.#recommendationRuns.delete(taskID);
      }
      return;
    }
    if (task.taskType === "build-profile") {
      const state: ProfileBuildState = {
        reason:
          typeof task.checkpoint.reason === "string"
            ? task.checkpoint.reason
            : "resume",
        stageTimings: {},
      };
      this.#profileBuilds.set(taskID, state);
      try {
        await this.#coordinator.resume(taskID, this.profileStages(taskID));
      } finally {
        this.#profileBuilds.delete(taskID);
      }
      return;
    }
    throw new Error("当前任务类型不支持继续");
  }

  private createClients(): {
    transport: HttpTransport;
    embeddingClient: OpenAIEmbeddingClient;
    llmClient: OpenAIChatClient;
  } {
    const settings = this.#preferences.getModelSettings();
    const transport = new HttpTransport({
      defaultTimeoutMs: settings.networkTimeoutMs,
    });
    return {
      transport,
      embeddingClient: new OpenAIEmbeddingClient({
        provider: settings.embeddingProvider,
        baseURL: settings.embeddingBaseURL,
        apiKey: settings.embeddingAPIKey,
        model: settings.embeddingModel,
        allowInsecureLocalhost: settings.allowInsecureLocalhost,
        transport,
      }),
      llmClient: new OpenAIChatClient({
        provider: settings.llmProvider,
        enabled: settings.llmEnabled,
        baseURL: settings.llmBaseURL,
        apiKey: settings.llmAPIKey,
        model: settings.llmModel,
        allowInsecureLocalhost: settings.allowInsecureLocalhost,
        transport,
      }),
    };
  }

  private createSummaryService(): SummaryService {
    return new SummaryService({
      client: this.createClients().llmClient,
      repository: new SummaryRepository(this.#database),
      now: this.#now,
    });
  }

  private async resolveGeneration(
    client: OpenAIEmbeddingClient,
    signal?: AbortSignal,
  ): Promise<ModelFingerprint> {
    const settings = this.#preferences.getModelSettings();
    let dimensions = settings.embeddingDimensions ?? 0;
    if (dimensions < 1) {
      dimensions = (
        await client.embedDocuments(
          [
            {
              title: "Embedding dimension probe",
              abstract: "A one-time local model capability probe.",
            },
          ],
          signal,
        )
      ).dimensions;
      this.#preferences.set("embeddingDimensions", dimensions);
    }
    return createModelFingerprint({
      provider: settings.embeddingProvider,
      baseURL: settings.embeddingBaseURL,
      model: settings.embeddingModel,
      dimensions,
      normalizationVersion: NORMALIZATION_VERSION,
    });
  }

  private async generationForProfile(
    generationID: string,
  ): Promise<ModelFingerprint> {
    const stored = await this.#embeddings.getGeneration(generationID);
    if (!stored)
      throw new Error("画像使用的 Embedding 代次不存在，请重新构建画像");
    const settings = this.#preferences.getModelSettings();
    const current = createModelFingerprint({
      provider: settings.embeddingProvider,
      baseURL: settings.embeddingBaseURL,
      model: settings.embeddingModel,
      dimensions: stored.dimensions,
      normalizationVersion: NORMALIZATION_VERSION,
    });
    if (current.generationID !== generationID) {
      throw new Error("Embedding 模型配置已变化，请先重新构建兴趣画像");
    }
    return current;
  }

  private async loadRepresentatives(
    snapshot: PublishedProfileSnapshot,
    papers: readonly ZoteroPaper[],
    generation: ModelFingerprint,
  ): Promise<
    Readonly<
      Record<
        string,
        readonly { itemKey: string; title: string; vector: readonly number[] }[]
      >
    >
  > {
    const papersByKey = new Map(papers.map((paper) => [paper.itemKey, paper]));
    const result: Record<
      string,
      { itemKey: string; title: string; vector: readonly number[] }[]
    > = {};
    for (const profile of snapshot.profiles) {
      const representatives: {
        itemKey: string;
        title: string;
        vector: readonly number[];
      }[] = [];
      for (const itemKey of profile.representativeItemKeys) {
        const paper = papersByKey.get(itemKey);
        if (!paper) continue;
        const vector = await this.#embeddings.getCached(
          generation.generationID,
          "zotero-paper",
          paper.itemKey,
          createEmbeddingContentHash({
            itemVersion: paper.itemVersion,
            title: paper.title,
            abstract: paper.abstract,
          }),
        );
        if (vector)
          representatives.push({ itemKey, title: paper.title, vector });
      }
      result[profile.id] = representatives;
    }
    return result;
  }

  private async loadNegativeSignals(
    state: RecommendationState,
    generation: ModelFingerprint,
  ) {
    const rejected = (await this.#feedback.listSuppressions()).filter(
      (event) => event.kind === "rejected-topic",
    );
    const signals = [];
    for (const event of rejected) {
      const vector =
        state.candidateVectors?.get(event.arxivId) ??
        (await this.#embeddings.getLatestCached(
          generation.generationID,
          "arxiv-candidate",
          event.arxivId,
        ));
      if (vector) signals.push({ ...event, vector, weight: 1 });
    }
    return signals;
  }

  private traceStages(
    taskID: string,
    state: { readonly stageTimings: Record<string, number> },
    stages: readonly RunStage[],
  ): RunStage[] {
    return stages.map((stage) => ({
      name: stage.name,
      run: async (context) => {
        const startedAt = this.#now().getTime();
        this.#logger.record({
          type: "stage",
          taskID,
          stage: stage.name,
          occurredAt: this.#now().toISOString(),
        });
        try {
          const result = await stage.run(context);
          const durationMs = Math.max(0, this.#now().getTime() - startedAt);
          state.stageTimings[stage.name] = durationMs;
          this.#logger.record({
            type: "stage",
            taskID,
            stage: stage.name,
            durationMs,
            completed: 1,
            total: 1,
            occurredAt: this.#now().toISOString(),
          });
          return result;
        } catch (error) {
          const durationMs = Math.max(0, this.#now().getTime() - startedAt);
          state.stageTimings[stage.name] = durationMs;
          this.#logger.record({
            type: "error",
            taskID,
            stage: stage.name,
            durationMs,
            errorCode: runtimeErrorCode(error),
            occurredAt: this.#now().toISOString(),
          });
          throw error;
        }
      },
    }));
  }

  private async learnWeights(): Promise<void> {
    try {
      const result = await this.#weightLearning.evaluate(
        this.#now().toISOString(),
      );
      this.#logger.record({
        type: "user-action",
        occurredAt: this.#now().toISOString(),
        detail: {
          action: "feedback-weight-evaluation",
          status: result.status,
          sampleCount:
            result.status === "waiting"
              ? result.sampleCount
              : result.learning.sampleCount,
        },
      });
    } catch (error) {
      this.logError(error);
    }
  }

  private diagnosticEnvironment(): Readonly<Record<string, unknown>> {
    return {
      plugin: "zotero-arxiv-daily",
      zoteroVersion: String(Zotero.version),
      embeddingModel: this.#preferences.getModelSettings().embeddingModel,
      llmEnabled: this.#preferences.getModelSettings().llmEnabled,
    };
  }

  private nextID(prefix: string): string {
    this.#idSequence += 1;
    return `${prefix}-${this.#now().getTime().toString(36)}-${this.#idSequence}`;
  }

  private async profileForModel(
    model: RecommendationCardModel,
  ): Promise<PublishedProfileSnapshot["profiles"][number] | undefined> {
    const snapshot = await this.#profiles.getPublished();
    return snapshot?.profiles.find(
      (profile) =>
        profile.id === model.profileID ||
        profile.lineageId === model.profileLineageID,
    );
  }

  private async chooseCollection(
    model: RecommendationCardModel,
    profile: PublishedProfileSnapshot["profiles"][number],
  ): Promise<{ readonly key?: string; readonly name?: string } | undefined> {
    const suggestion = suggestCollection(
      this.collectionEvidence(model, profile),
      this.#now(),
    );
    const libraryID = Zotero.Libraries.userLibraryID;
    const collections = Zotero.Collections.getByLibrary(libraryID).map(
      (collection) => ({
        key: collection.key,
        name: collection.name,
      }),
    );
    const win = Zotero.getMainWindow();
    if (!win) return undefined;
    const suggestedIndex = suggestion.collectionKey
      ? collections.findIndex(({ key }) => key === suggestion.collectionKey)
      : -1;
    const suggestedName =
      suggestedIndex >= 0 ? collections[suggestedIndex].name : undefined;
    const choices = [
      "不归类",
      "新建收藏夹",
      ...collections.map(({ name }) => name),
    ];
    const selection = {
      value: suggestedIndex >= 0 ? suggestedIndex + 2 : 0,
    };
    const message =
      suggestion.status === "suggested"
        ? `推荐收藏夹：${suggestedName ?? suggestion.collectionKey ?? "待分类"}（置信度 ${Math.round(suggestion.confidence * 100)}%，领先 ${Math.round(suggestion.lead * 100)}%）`
        : "收藏夹建议不确定，请选择已有收藏夹或待分类";
    const accepted = Services.prompt.select(
      win as unknown as mozIDOMWindowProxy,
      "保存到 Zotero",
      message,
      choices,
      selection,
    );
    if (!accepted || selection.value === 0) return undefined;
    if (selection.value === 1) {
      const name = win.prompt("新建收藏夹名称", suggestedName ?? "");
      return name?.trim() ? { name: name.trim() } : undefined;
    }
    return collections[selection.value - 2];
  }

  private collectionEvidence(
    model: RecommendationCardModel,
    profile: PublishedProfileSnapshot["profiles"][number],
  ): readonly CollectionEvidence[] {
    const representativeTitles = new Set(
      model.representatives.map((representative) => representative.title),
    );
    const representativeScores = new Map(
      model.representatives.map((representative) => [
        representative.title,
        representative.similarity,
      ]),
    );
    const evidence: CollectionEvidence[] = [];
    for (const itemKey of profile.memberItemKeys.slice(0, 20)) {
      const item = Zotero.Items.getByLibraryAndKey(
        Zotero.Libraries.userLibraryID,
        itemKey,
      );
      if (!item) continue;
      const itemTitle = String(item.getField("title") || "");
      const baseSimilarity = profile.memberSimilarities[itemKey] ?? 0;
      for (const collectionID of item.getCollections()) {
        const collection = Zotero.Collections.get(collectionID);
        if (!collection) continue;
        evidence.push({
          collectionKey: collection.key,
          similarity: representativeScores.get(itemTitle) ?? baseSimilarity,
          isRepresentative: representativeTitles.has(itemTitle),
        });
      }
    }
    return evidence;
  }

  private modelFromReranked(
    candidate: RerankedCandidate,
    state: RecommendationState,
    summary: Awaited<ReturnType<SummaryService["summarize"]>>,
    rank: number,
  ): RecommendationCardModel {
    const profile = state.profile?.profiles.find(
      (item) => item.id === candidate.matchedProfileID,
    );
    return {
      candidate: candidate.candidate,
      score: candidate.score,
      profileID: profile?.id,
      profileLineageID: profile?.lineageId,
      profileName: candidate.matchedProfileName,
      profileVersionID: state.profile?.versionID ?? "unknown",
      keywords: candidate.features.matchedKeywords,
      representatives: candidate.features.representativeMatches,
      summary: {
        text: summary.text,
        source: summary.source,
        ...(summary.fallbackReason
          ? { fallbackReason: summary.fallbackReason }
          : {}),
      },
      runID: state.runID,
      rank,
      onSave: () =>
        this.saveRecommendation(
          this.modelFromReranked(candidate, state, summary, rank),
        ),
      onDefer: () =>
        this.recordFeedback(
          this.modelFromReranked(candidate, state, summary, rank),
          "deferred",
        ),
      onReject: (action) =>
        this.recordFeedback(
          this.modelFromReranked(candidate, state, summary, rank),
          action,
        ),
      onRejectTopic: () =>
        this.recordFeedback(
          this.modelFromReranked(candidate, state, summary, rank),
          "rejected-topic",
        ),
    };
  }

  private modelFromStored(
    candidate: StoredCandidate,
    runID: string,
    profileVersionID: string,
    snapshot?: PublishedProfileSnapshot,
    summary?: RecommendationCardModel["summary"],
  ): RecommendationCardModel {
    const score = scoreFromStored(
      candidate.scoreComponents,
      candidate.finalScore,
    );
    const profileID =
      candidate.explainability?.matchedProfileID ??
      Object.keys(candidate.profileScores)[0];
    const profile = snapshot?.profiles.find((item) => item.id === profileID);
    return {
      candidate,
      score,
      profileID,
      profileLineageID: profile?.lineageId,
      profileName:
        candidate.explainability?.matchedProfileName ?? profile?.name,
      profileVersionID,
      keywords: candidate.explainability?.matchedKeywords ?? [],
      representatives: candidate.explainability?.representativeMatches ?? [],
      ...(summary ? { summary } : {}),
      runID,
      rank: candidate.rank,
      onSave: () =>
        this.saveRecommendation(
          this.modelFromStored(
            candidate,
            runID,
            profileVersionID,
            snapshot,
            summary,
          ),
        ),
      onDefer: () =>
        this.recordFeedback(
          this.modelFromStored(
            candidate,
            runID,
            profileVersionID,
            snapshot,
            summary,
          ),
          "deferred",
        ),
      onReject: (action) =>
        this.recordFeedback(
          this.modelFromStored(
            candidate,
            runID,
            profileVersionID,
            snapshot,
            summary,
          ),
          action,
        ),
      onRejectTopic: () =>
        this.recordFeedback(
          this.modelFromStored(
            candidate,
            runID,
            profileVersionID,
            snapshot,
            summary,
          ),
          "rejected-topic",
        ),
    };
  }

  private logError(error: unknown): void {
    try {
      Zotero.logError(
        error instanceof Error ? error : new Error(String(error)),
      );
    } catch {
      // Logging must not mask a failed background task.
    }
  }
}

function recommendationSummary(
  summary: SummaryResult,
): NonNullable<RecommendationCardModel["summary"]> {
  return {
    text: summary.text,
    source: summary.source,
    ...(summary.fallbackReason
      ? { fallbackReason: summary.fallbackReason }
      : {}),
  };
}

export interface RuntimeProfileDetail {
  readonly lineageId: string;
  readonly name: string;
  readonly horizon: InterestProfile["horizon"];
  readonly keywords: readonly string[];
  readonly memberCount: number;
  readonly confidence: number;
  readonly stability: number;
  readonly collectionShare: number;
  readonly representativeItemKeys: readonly string[];
  readonly representativeTitles: readonly string[];
  readonly locked: boolean;
  readonly disabled: boolean;
}

function selectProfilesByPrompt(
  win: Window,
  snapshot: PublishedProfileSnapshot,
  minimum: number,
): readonly PublishedProfileSnapshot["profiles"][number][] {
  const listing = snapshot.profiles
    .map((profile) => `${profile.lineageId} = ${profile.name}`)
    .join("\n");
  const value = win.prompt(
    `请输入画像 ID 或名称（用逗号分隔，至少 ${minimum} 个）：\n${listing}`,
    "",
  );
  if (value === null) return [];
  const selected: PublishedProfileSnapshot["profiles"][number][] = [];
  for (const token of value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    const profile = snapshot.profiles.find(
      (candidate) =>
        candidate.lineageId === token ||
        candidate.id === token ||
        candidate.name === token,
    );
    if (
      profile &&
      !selected.some((item) => item.lineageId === profile.lineageId)
    )
      selected.push(profile);
  }
  return selected;
}

function emptyOverlay(lineageID: string): ProfileOverlay {
  return {
    lineageId: lineageID,
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

function normalizeQuery(
  query: RecommendationToolbarState,
): RecommendationToolbarState {
  return {
    count: Math.min(30, Math.max(1, Math.round(query.count || 5))),
    profileIDs: [...new Set(query.profileIDs)],
    categories: normalizeArxivCategories(query.categories),
    ...(query.lookbackDays
      ? {
          lookbackDays: Math.min(
            14,
            Math.max(1, Math.round(query.lookbackDays)),
          ),
        }
      : {}),
  };
}

function readQuery(value: unknown): RecommendationToolbarState {
  if (!value || typeof value !== "object") {
    return {
      count: 5,
      profileIDs: [],
      categories: [...DEFAULT_ARXIV_CATEGORIES],
    };
  }
  const record = value as Record<string, unknown>;
  return normalizeQuery({
    count: typeof record.count === "number" ? record.count : 5,
    profileIDs: Array.isArray(record.profileIDs)
      ? record.profileIDs.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    categories: Array.isArray(record.categories)
      ? record.categories.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [...DEFAULT_ARXIV_CATEGORIES],
    ...(typeof record.lookbackDays === "number"
      ? { lookbackDays: record.lookbackDays }
      : {}),
  });
}

function normalizeArxivCategories(categories: readonly string[]): string[] {
  const normalized = categories
    .map((category) => category.trim())
    .filter((category) => /^[a-zA-Z0-9.-]+$/.test(category));
  return [
    ...new Set(normalized.length ? normalized : [...DEFAULT_ARXIV_CATEGORIES]),
  ];
}

function toEmbeddingWorkItem(paper: ZoteroPaper) {
  return {
    objectType: "zotero-paper",
    objectID: paper.itemKey,
    itemVersion: paper.itemVersion,
    title: paper.title,
    abstract: paper.abstract,
  };
}

function toCandidateEmbeddingWorkItem(candidate: ArxivCandidate) {
  return {
    objectType: "arxiv-candidate",
    objectID: candidate.arxivId,
    itemVersion: candidate.version,
    title: candidate.title,
    abstract: candidate.abstract,
  };
}

function storedCandidate(
  candidate: RerankedCandidate,
  rank: number,
): StoredCandidate {
  return {
    ...candidate.candidate,
    profileScores: {
      ...(candidate.matchedProfileID
        ? {
            [candidate.matchedProfileID]: Math.max(
              candidate.features.recentSimilarity,
              candidate.features.longTermSimilarity,
            ),
          }
        : {}),
    },
    scoreComponents: {
      recentSimilarity: candidate.score.recentSimilarity,
      longTermSimilarity: candidate.score.longTermSimilarity,
      representativeSimilarity: candidate.score.representativeSimilarity,
      keywordMatch: candidate.score.keywordMatch,
      manualPriority: candidate.score.manualPriority,
      negativeSimilarity: candidate.score.negativeSimilarity,
      rawScore: candidate.score.rawScore,
      diversityAdjustment: candidate.score.diversityAdjustment,
      rerankedScore: candidate.score.rerankedScore,
      displayScore: candidate.score.displayScore,
    },
    explainability: {
      matchedKeywords: candidate.features.matchedKeywords,
      representativeMatches: candidate.features.representativeMatches,
      ...(candidate.matchedProfileID
        ? { matchedProfileID: candidate.matchedProfileID }
        : {}),
      ...(candidate.matchedProfileName
        ? { matchedProfileName: candidate.matchedProfileName }
        : {}),
    },
    finalScore: candidate.score.rerankedScore,
    rank,
    displayStatus: "new",
  };
}

function scoreFromStored(
  components: Readonly<Record<string, number>>,
  finalScore: number,
): ScoreBreakdown {
  const value = (key: keyof ScoreBreakdown, fallback = 0) =>
    typeof components[key] === "number" ? components[key] : fallback;
  return {
    recentSimilarity: value("recentSimilarity"),
    longTermSimilarity: value("longTermSimilarity"),
    representativeSimilarity: value("representativeSimilarity"),
    keywordMatch: value("keywordMatch"),
    manualPriority: value("manualPriority"),
    negativeSimilarity: value("negativeSimilarity"),
    rawScore: value("rawScore", finalScore),
    diversityAdjustment: value("diversityAdjustment"),
    rerankedScore: value("rerankedScore", finalScore),
    displayScore: value("displayScore"),
  };
}

function runtimeErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.name : "runtime-error";
}

function filterModelsByProfileIDs(
  models: readonly RecommendationCardModel[],
  profileIDs: readonly string[],
): readonly RecommendationCardModel[] {
  if (!profileIDs.length) return models;
  const selected = new Set(profileIDs);
  return models.filter(
    (model) =>
      (model.profileID !== undefined && selected.has(model.profileID)) ||
      (model.profileLineageID !== undefined &&
        selected.has(model.profileLineageID)),
  );
}
