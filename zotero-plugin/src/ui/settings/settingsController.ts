import { ModelConnectionTester } from "../../application/modelConnectionTester.ts";
import {
  HttpTransport,
  NetworkRequestError,
} from "../../infrastructure/network/httpTransport.ts";
import { createAbortController } from "../../infrastructure/network/abortController.ts";
import { OpenAIChatClient } from "../../infrastructure/models/openAIChatClient.ts";
import { OpenAIEmbeddingClient } from "../../infrastructure/models/openAIEmbeddingClient.ts";
import {
  getModelProviderDefinition,
  getProviderSuggestions,
  MODEL_PROVIDER_DEFINITIONS,
  normalizeModelProvider,
  type ModelProvider,
} from "../../infrastructure/models/modelProvider.ts";
import { createXHTMLOption } from "./settingsDom.ts";
import type {
  ModelSettings,
  PreferencesRepository,
} from "../../infrastructure/settings/preferences.ts";
import type { SetupWizard } from "./setupWizard.ts";

interface SettingsControllerOptions {
  readonly window: Window;
  readonly preferences: PreferencesRepository;
  readonly setupWizard: SetupWizard;
}

export class SettingsController {
  private readonly doc: Document;
  private readonly cleanups: (() => void)[] = [];
  private readonly options: SettingsControllerOptions;
  private readonly lastProviderByKind: Record<
    "embedding" | "llm",
    ModelProvider
  > = {
    embedding: "openai-compatible",
    llm: "openai-compatible",
  };
  private currentTest?: AbortController;

  constructor(options: SettingsControllerOptions) {
    this.options = options;
    this.doc = options.window.document;
  }

  async mount(): Promise<void> {
    const root = this.doc.getElementById("zad-preferences");
    if (!root || root.getAttribute("data-mounted") === "true") return;
    root.setAttribute("data-mounted", "true");
    const settings = this.options.preferences.getModelSettings();
    this.populateProviderSelect(
      "zad-embedding-provider",
      settings.embeddingProvider,
    );
    this.populateProviderSelect("zad-llm-provider", settings.llmProvider);
    this.writeSettings(settings);
    this.setValue(
      "zad-arxiv-categories",
      this.options.preferences.getArxivCategories().join(","),
    );
    this.toggleLLMFields();
    this.listen("zad-embedding-provider", "change", () =>
      this.applyProviderPreset("embedding"),
    );
    this.listen("zad-llm-provider", "change", () =>
      this.applyProviderPreset("llm"),
    );
    this.listen("zad-embedding-reset-provider", "click", () =>
      this.resetProviderPreset("embedding"),
    );
    this.listen("zad-llm-reset-provider", "click", () =>
      this.resetProviderPreset("llm"),
    );
    this.listen("zad-embedding-model-preset", "change", () =>
      this.applyModelPreset("embedding"),
    );
    this.listen("zad-llm-model-preset", "change", () =>
      this.applyModelPreset("llm"),
    );
    this.listen("zad-embedding-model", "input", () =>
      this.syncModelPreset("embedding"),
    );
    this.listen("zad-llm-model", "input", () => this.syncModelPreset("llm"));
    this.listen("zad-llm-enabled", "change", () => this.toggleLLMFields());
    this.listen("zad-save-settings", "click", () => this.save());
    this.listen("zad-test-connection", "click", () => this.testConnection());
    this.listen("zad-finish-setup", "click", () => this.finishSetup());
    await this.inspectCorpus();
  }

  destroy(): void {
    this.currentTest?.abort();
    this.currentTest = undefined;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  private async inspectCorpus(): Promise<void> {
    this.setStatus("正在统计本地合格论文，仅读取条目编号和类型……", "working");
    try {
      const estimate = await this.options.setupWizard.inspectCorpus(
        this.numberValue("zad-embedding-batch-size", 32),
      );
      this.text("zad-corpus-count", String(estimate.eligiblePaperCount));
      this.text(
        "zad-batch-estimate",
        String(estimate.estimatedEmbeddingBatches),
      );
      this.text(
        "zad-token-estimate",
        estimate.estimatedTokens.toLocaleString("zh-CN"),
      );
      this.setStatus("估算完成。确认前不会读取或发送论文标题与摘要。", "ready");
    } catch (error) {
      this.setStatus(errorMessage(error), "error");
    }
  }

  private save(): void {
    try {
      const settings = this.readSettings();
      this.createClients(settings);
      this.options.preferences.saveModelSettings(settings);
      this.options.preferences.saveArxivCategories(
        this.value("zad-arxiv-categories"),
      );
      this.options.preferences.set("embeddingDimensions", 0);
      this.setStatus("设置已保存在本机 Zotero 偏好设置中。", "success");
    } catch (error) {
      this.setStatus(errorMessage(error), "error");
    }
  }

  private async testConnection(): Promise<boolean> {
    this.currentTest?.abort();
    let abortController: AbortController | undefined;
    this.setBusy(true);
    this.setStatus("正在测试模型连接……", "working");
    try {
      abortController = createAbortController();
      this.currentTest = abortController;
      const settings = this.readSettings();
      const clients = this.createClients(settings);
      const result = await new ModelConnectionTester().test({
        ...clients,
        signal: abortController.signal,
      });
      if (!result.embedding.ok) {
        this.setStatus(
          formatFailure(
            "Embedding",
            result.embedding.error,
            settings.embeddingProvider,
            settings.embeddingModel,
          ),
          "error",
        );
        return false;
      }
      if (result.embedding.dimensions) {
        this.options.preferences.set(
          "embeddingDimensions",
          result.embedding.dimensions,
        );
      }
      if (result.llm.status === "failed") {
        this.setStatus(
          formatFailure(
            "LLM",
            result.llm.error,
            settings.llmProvider,
            settings.llmModel,
          ),
          "error",
        );
        return false;
      }
      const llmMessage =
        result.llm.status === "passed"
          ? `；LLM ${result.llm.model}，${Math.round(result.llm.latencyMs ?? 0)} ms`
          : "；LLM 未启用，推荐页将显示 arXiv 原始摘要";
      this.setStatus(
        `连接成功：Embedding ${result.embedding.model}，${result.embedding.dimensions} 维，${Math.round(result.embedding.latencyMs ?? 0)} ms${llmMessage}`,
        "success",
      );
      return true;
    } catch (error) {
      this.setStatus(errorMessage(error), "error");
      return false;
    } finally {
      if (this.currentTest === abortController) this.currentTest = undefined;
      this.setBusy(false);
    }
  }

  private async finishSetup(): Promise<void> {
    if (!(await this.testConnection())) return;
    try {
      await this.options.setupWizard.confirm(this.readSettings());
      this.setStatus("配置完成，首个兴趣画像任务已加入任务中心。", "success");
      const button = this.element<HTMLButtonElement>("zad-finish-setup");
      if (button) button.textContent = "重新构建画像";
    } catch (error) {
      this.setStatus(errorMessage(error), "error");
    }
  }

  private createClients(settings: ModelSettings): {
    embeddingClient: OpenAIEmbeddingClient;
    llmClient: OpenAIChatClient;
  } {
    const transport = new HttpTransport({
      defaultTimeoutMs: settings.networkTimeoutMs,
    });
    return {
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

  private readSettings(): ModelSettings {
    return {
      embeddingProvider: this.providerValue("embedding"),
      embeddingBaseURL: this.value("zad-embedding-base-url"),
      embeddingAPIKey: this.value("zad-embedding-api-key"),
      embeddingModel: this.value("zad-embedding-model"),
      embeddingBatchSize: clamp(
        this.numberValue("zad-embedding-batch-size", 32),
        1,
        256,
      ),
      allowInsecureLocalhost: this.checked("zad-allow-local-http"),
      llmEnabled: this.checked("zad-llm-enabled"),
      llmProvider: this.providerValue("llm"),
      llmBaseURL: this.value("zad-llm-base-url"),
      llmAPIKey: this.value("zad-llm-api-key"),
      llmModel: this.value("zad-llm-model"),
      networkTimeoutMs: clamp(
        this.numberValue("zad-network-timeout", 30) * 1_000,
        1_000,
        120_000,
      ),
    };
  }

  private writeSettings(settings: ModelSettings): void {
    this.setValue("zad-embedding-provider", settings.embeddingProvider);
    this.setValue("zad-llm-provider", settings.llmProvider);
    this.setValue("zad-embedding-base-url", settings.embeddingBaseURL);
    this.setValue("zad-embedding-api-key", settings.embeddingAPIKey);
    this.setValue("zad-embedding-model", settings.embeddingModel);
    this.setValue(
      "zad-embedding-batch-size",
      String(settings.embeddingBatchSize),
    );
    this.setChecked("zad-allow-local-http", settings.allowInsecureLocalhost);
    this.setChecked("zad-llm-enabled", settings.llmEnabled);
    this.setValue("zad-llm-base-url", settings.llmBaseURL);
    this.setValue("zad-llm-api-key", settings.llmAPIKey);
    this.setValue("zad-llm-model", settings.llmModel);
    this.setValue(
      "zad-network-timeout",
      String(Math.round(settings.networkTimeoutMs / 1_000)),
    );
    this.lastProviderByKind.embedding = settings.embeddingProvider;
    this.lastProviderByKind.llm = settings.llmProvider;
    this.updateProviderUI("embedding", settings.embeddingProvider);
    this.updateProviderUI("llm", settings.llmProvider);
    const button = this.element<HTMLButtonElement>("zad-finish-setup");
    if (button && this.options.preferences.get("setupComplete")) {
      button.textContent = "重新构建画像";
    }
  }

  private toggleLLMFields(): void {
    const enabled = this.checked("zad-llm-enabled");
    for (const id of [
      "zad-llm-base-url",
      "zad-llm-api-key",
      "zad-llm-model-preset",
      "zad-llm-model",
    ]) {
      const input = this.element<HTMLInputElement>(id);
      if (input) input.disabled = !enabled;
    }
    this.text(
      "zad-summary-mode",
      enabled ? "开启后生成处理过的中文摘要" : "关闭时显示 arXiv 原始摘要",
    );
  }

  private applyProviderPreset(kind: "embedding" | "llm"): void {
    const provider = this.providerValue(kind);
    const previous = this.lastProviderByKind[kind];
    const previousDefinition = getModelProviderDefinition(previous);
    const definition = getModelProviderDefinition(provider);
    const baseURLID =
      kind === "embedding" ? "zad-embedding-base-url" : "zad-llm-base-url";
    const modelID =
      kind === "embedding" ? "zad-embedding-model" : "zad-llm-model";
    const previousModel =
      kind === "embedding"
        ? previousDefinition.embeddingSuggestions[0]?.value
        : previousDefinition.llmSuggestions[0]?.value;
    const nextModel =
      kind === "embedding"
        ? definition.embeddingSuggestions[0]?.value
        : definition.llmSuggestions[0]?.value;
    const baseURL = this.value(baseURLID);
    const model = this.value(modelID);
    if (!baseURL || baseURL === previousDefinition.defaultBaseURL) {
      this.setValue(baseURLID, definition.defaultBaseURL);
    }
    if (nextModel && (!model || model === previousModel)) {
      this.setValue(modelID, nextModel);
    }
    this.lastProviderByKind[kind] = provider;
    this.updateProviderUI(kind, provider);
  }

  private resetProviderPreset(kind: "embedding" | "llm"): void {
    const provider = this.providerValue(kind);
    const definition = getModelProviderDefinition(provider);
    const baseURLID =
      kind === "embedding" ? "zad-embedding-base-url" : "zad-llm-base-url";
    const modelID =
      kind === "embedding" ? "zad-embedding-model" : "zad-llm-model";
    const suggestion =
      kind === "embedding"
        ? definition.embeddingSuggestions[0]
        : definition.llmSuggestions[0];
    this.setValue(baseURLID, definition.defaultBaseURL);
    if (suggestion) this.setValue(modelID, suggestion.value);
    this.updateProviderUI(kind, provider);
  }

  private applyModelPreset(kind: "embedding" | "llm"): void {
    const presetID =
      kind === "embedding"
        ? "zad-embedding-model-preset"
        : "zad-llm-model-preset";
    const modelID =
      kind === "embedding" ? "zad-embedding-model" : "zad-llm-model";
    const preset = this.element<HTMLSelectElement>(presetID);
    if (preset?.value) this.setValue(modelID, preset.value);
    this.syncModelPreset(kind);
  }

  private syncModelPreset(kind: "embedding" | "llm"): void {
    const presetID =
      kind === "embedding"
        ? "zad-embedding-model-preset"
        : "zad-llm-model-preset";
    const modelID =
      kind === "embedding" ? "zad-embedding-model" : "zad-llm-model";
    const preset = this.element<HTMLSelectElement>(presetID);
    if (!preset) return;
    const model = this.value(modelID);
    const options = [...preset.options] as HTMLOptionElement[];
    preset.value = options.some(
      (option) => option.value !== "" && option.value === model,
    )
      ? model
      : "";
  }

  private populateProviderSelect(id: string, selected: ModelProvider): void {
    const select = this.element<HTMLSelectElement>(id);
    if (!select) return;
    select.replaceChildren();
    for (const definition of MODEL_PROVIDER_DEFINITIONS) {
      const option = createXHTMLOption(this.doc);
      option.value = definition.id;
      option.textContent = definition.label;
      select.append(option);
    }
    select.value = selected;
  }

  private updateProviderUI(
    kind: "embedding" | "llm",
    provider: ModelProvider,
  ): void {
    const definition = getModelProviderDefinition(provider);
    const helpID =
      kind === "embedding"
        ? "zad-embedding-provider-help"
        : "zad-llm-provider-help";
    const linkID =
      kind === "embedding"
        ? "zad-embedding-provider-doc"
        : "zad-llm-provider-doc";
    const listID =
      kind === "embedding"
        ? "zad-embedding-model-suggestions"
        : "zad-llm-model-suggestions";
    this.text(
      helpID,
      kind === "embedding" ? definition.embeddingHelp : definition.llmHelp,
    );
    const link = this.element<HTMLAnchorElement>(linkID);
    if (link) {
      const capabilityDocumentationURL =
        kind === "embedding"
          ? definition.embeddingDocumentationURL
          : definition.llmDocumentationURL;
      link.href =
        capabilityDocumentationURL ??
        definition.documentationURL ??
        "https://www.volcengine.com/docs/82379";
      link.hidden = provider === "openai-compatible";
    }
    const datalist = this.element<HTMLDataListElement>(listID);
    if (datalist) {
      datalist.replaceChildren();
      for (const suggestion of getProviderSuggestions(
        provider,
        kind === "embedding" ? "embedding" : "llm",
      )) {
        const option = createXHTMLOption(this.doc);
        option.value = suggestion.value;
        option.label = suggestion.label;
        datalist.append(option);
      }
    }
    this.populateModelPresetSelect(kind, provider);
  }

  private populateModelPresetSelect(
    kind: "embedding" | "llm",
    provider: ModelProvider,
  ): void {
    const id =
      kind === "embedding"
        ? "zad-embedding-model-preset"
        : "zad-llm-model-preset";
    const modelID =
      kind === "embedding" ? "zad-embedding-model" : "zad-llm-model";
    const select = this.element<HTMLSelectElement>(id);
    if (!select) return;
    const currentModel = this.value(modelID);
    const suggestions = getProviderSuggestions(
      provider,
      kind === "embedding" ? "embedding" : "llm",
    );
    select.replaceChildren();
    const custom = createXHTMLOption(this.doc);
    custom.value = "";
    custom.textContent = "自定义 / Endpoint ID";
    select.append(custom);
    for (const suggestion of suggestions) {
      const option = createXHTMLOption(this.doc);
      option.value = suggestion.value;
      option.textContent = suggestion.label;
      select.append(option);
    }
    this.syncModelPreset(kind);
    if (!currentModel) select.value = "";
  }

  private providerValue(kind: "embedding" | "llm"): ModelProvider {
    const id =
      kind === "embedding" ? "zad-embedding-provider" : "zad-llm-provider";
    return normalizeModelProvider(this.value(id));
  }

  private setBusy(busy: boolean): void {
    for (const id of ["zad-test-connection", "zad-finish-setup"]) {
      const button = this.element<HTMLButtonElement>(id);
      if (button) button.disabled = busy;
    }
  }

  private setStatus(message: string, state: string): void {
    const status = this.element<HTMLElement>("zad-settings-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  private listen(id: string, type: string, listener: () => void): void {
    const element = this.doc.getElementById(id);
    if (!element) return;
    element.addEventListener(type, listener);
    this.cleanups.push(() => element.removeEventListener(type, listener));
  }

  private element<T extends HTMLElement>(id: string): T | null {
    return this.doc.getElementById(id) as T | null;
  }

  private value(id: string): string {
    return this.element<HTMLInputElement>(id)?.value.trim() ?? "";
  }

  private numberValue(id: string, fallback: number): number {
    const value = Number(this.value(id));
    return Number.isFinite(value) ? value : fallback;
  }

  private checked(id: string): boolean {
    return this.element<HTMLInputElement>(id)?.checked ?? false;
  }

  private setValue(id: string, value: string): void {
    const input = this.element<HTMLInputElement>(id);
    if (input) input.value = value;
  }

  private setChecked(id: string, value: boolean): void {
    const input = this.element<HTMLInputElement>(id);
    if (input) input.checked = value;
  }

  private text(id: string, value: string): void {
    const element = this.doc.getElementById(id);
    if (element) element.textContent = value;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function errorMessage(error: unknown): string {
  if (error instanceof NetworkRequestError) {
    return formatFailure("配置", error.toDiagnostic());
  }
  return error instanceof Error ? error.message : "操作失败，请检查设置";
}

export function formatFailure(
  scope: string,
  diagnostic?: { code: string; status?: number; message: string; url?: string },
  provider?: ModelProvider,
  model?: string,
): string {
  if (!diagnostic) return `${scope} 连接失败，请检查服务地址和网络。`;
  const providerAdvice = providerSpecificAdvice(provider, diagnostic);
  const advice: Record<string, string> = {
    "insecure-url": "远程地址请改用 HTTPS。",
    "localhost-confirmation-required": "请勾选允许本机 HTTP 后重试。",
    "request-timeout": "请检查服务是否启动，或增大超时时间。",
    "http-error":
      diagnostic.status === 401 || diagnostic.status === 403
        ? "请检查 API 密钥和模型权限。"
        : diagnostic.status === 429
          ? "服务暂时限流或额度不足，请稍后重试或降低请求频率。"
          : "请稍后重试或检查服务端日志。",
    "invalid-model-response": "请确认服务兼容 OpenAI API 且模型名称正确。",
    "empty-model-response": "请确认 LLM 模型可用并兼容 Chat Completions。",
  };
  const url = diagnostic.url ? ` 地址：${diagnostic.url}` : "";
  const modelHint = model ? ` 模型：${model}。` : "";
  return `${scope} 失败 [${diagnostic.code}]：${diagnostic.message}${modelHint} ${providerAdvice ?? advice[diagnostic.code] ?? "请检查配置后重试。"}${url}`;
}

function providerSpecificAdvice(
  provider: ModelProvider | undefined,
  diagnostic: { code: string; status?: number },
): string | undefined {
  if (diagnostic.code !== "http-error") return undefined;
  if (provider === "siliconflow") {
    if (diagnostic.status === 401 || diagnostic.status === 403) {
      return "请检查硅基流动账户 API Key、账户额度和模型权限。";
    }
    if (diagnostic.status === 404) {
      return "请确认填写的是硅基流动控制台中的精确模型 ID，而不是展示名称，并确认该模型仍可用。";
    }
    if (diagnostic.status === 429) {
      return "硅基流动请求已达到速率或额度限制，请稍后重试或降低批大小。";
    }
    return undefined;
  }
  if (diagnostic.status !== 404) return undefined;
  if (provider === "volcengine-ark-coding") {
    return "请确认 Coding Plan 已开通，并使用 Coding Plan 专属地址和套餐支持的模型。";
  }
  if (provider === "volcengine-ark") {
    return "请确认模型已在当前方舟账号和区域开通；若账号要求推理接入点，请填写控制台创建的 ep-... Endpoint ID。";
  }
  return undefined;
}
