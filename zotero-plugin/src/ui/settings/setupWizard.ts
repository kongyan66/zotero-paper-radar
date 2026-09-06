import type {
  CorpusEstimate,
  CorpusEstimator,
} from "../../application/corpusEstimator.ts";
import type {
  ModelSettings,
  PreferencesRepository,
} from "../../infrastructure/settings/preferences.ts";

export interface InitialProfileTaskRequest {
  readonly reason: "setup-confirmed";
  readonly requestedAt: string;
  readonly estimatedPaperCount: number;
}

interface SetupWizardOptions {
  readonly estimator: CorpusEstimator;
  readonly preferences: PreferencesRepository;
  readonly enqueueInitialProfileBuild: (
    request: InitialProfileTaskRequest,
  ) => Promise<void>;
  readonly now?: () => Date;
}

export class SetupWizard {
  private lastEstimate?: CorpusEstimate;
  private readonly now: () => Date;
  private readonly options: SetupWizardOptions;

  constructor(options: SetupWizardOptions) {
    this.options = options;
    this.now = options.now ?? (() => new Date());
  }

  async inspectCorpus(batchSize: number): Promise<CorpusEstimate> {
    this.lastEstimate = await this.options.estimator.estimate(batchSize);
    return this.lastEstimate;
  }

  async confirm(settings: ModelSettings): Promise<void> {
    if (!this.lastEstimate) {
      throw new Error("请先估算本地论文数量");
    }
    this.options.preferences.saveModelSettings(settings);
    await this.options.enqueueInitialProfileBuild({
      reason: "setup-confirmed",
      requestedAt: this.now().toISOString(),
      estimatedPaperCount: this.lastEstimate.eligiblePaperCount,
    });
    this.options.preferences.set("setupComplete", true);
  }
}
