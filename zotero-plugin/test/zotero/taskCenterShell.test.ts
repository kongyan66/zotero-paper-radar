import { assert } from "chai";
import { config } from "../../package.json";
import type { RecommendationWorkspaceController } from "../../src/ui/recommendations/recommendationWorkspace";
import { TaskCenterView } from "../../src/ui/tasks/taskCenter";

interface TaskCenterTestAddon {
  data: {
    workspaceController?: RecommendationWorkspaceController;
    runtime?: { getDiagnosticsSummary?: () => Promise<unknown> };
  };
}

const WORKSPACE_TAB_ID = `${config.addonRef}-workspace-tab`;

describe("task center shell", function () {
  afterEach(async function () {
    const win = Zotero.getMainWindow();
    if (win?.Zotero_Tabs._tabs.some((tab) => tab.id === WORKSPACE_TAB_ID)) {
      win.Zotero_Tabs.close(WORKSPACE_TAB_ID);
      await Zotero.Promise.delay(25);
    }
  });

  it("mounts a toolbar command without opening the tab", function () {
    const win = Zotero.getMainWindow();
    const button = win?.document.getElementById(
      `${config.addonRef}-toolbar-button`,
    );

    assert.exists(button);
    assert.notExists(win?.document.getElementById(WORKSPACE_TAB_ID));
  });

  it("renders stable filters, progress, and an empty task list", async function () {
    const win = Zotero.getMainWindow();
    const instance = Zotero[
      config.addonInstance
    ] as unknown as TaskCenterTestAddon;
    assert.exists(instance.data.workspaceController);
    assert.exists(instance.data.runtime);
    const opened = instance.data.workspaceController!.open(win!);
    assert.equal(opened, WORKSPACE_TAB_ID);
    const root = win?.document.getElementById(`${WORKSPACE_TAB_ID}-root`);
    const filters = root?.querySelectorAll(
      "[data-task-filter='running'], [data-task-filter='failed'], [data-task-filter='completed']",
    );

    assert.exists(root);
    assert.equal(
      root?.querySelector("[data-role='cache-summary']")?.textContent,
      "缓存 0 篇 · 尚未更新",
    );
    assert.lengthOf(filters || [], 3);
    assert.exists(root?.querySelector("[data-role='run-progress']"));
    assert.equal(
      root?.querySelector("[data-role='task-empty']")?.textContent,
      "暂无任务",
    );
    await Zotero.Promise.delay(100);
    assert.exists(
      root?.querySelector("[data-role='diagnostics-view']"),
      root?.textContent,
    );
  });

  it("renders read-only task rows and filters them by status", function () {
    const win = Zotero.getMainWindow();
    const host = win!.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    let clearHistoryCalls = 0;
    let clearTaskCalls = 0;
    const view = new TaskCenterView(win!.document, {
      onClearHistory: () => {
        clearHistoryCalls += 1;
      },
    });
    view.mount(host);
    const taskCenter = host.querySelector<HTMLElement>(".zad-task-center")!;
    const collapse = host.querySelector<HTMLButtonElement>(
      "[data-action='toggle-task-center']",
    )!;
    assert.equal(taskCenter.dataset.collapsed, "false");
    collapse.click();
    assert.equal(taskCenter.dataset.collapsed, "true");
    assert.isTrue(
      (taskCenter.querySelector(".zad-section-header") as HTMLElement).hidden,
    );
    assert.exists(host.querySelector("[data-role='task-rail']"));
    host
      .querySelector<HTMLButtonElement>("[data-action='expand-task-center']")!
      .click();
    assert.equal(taskCenter.dataset.collapsed, "false");
    assert.isFalse(
      (taskCenter.querySelector(".zad-section-header") as HTMLElement).hidden,
    );
    const completed = {
      ...task("completed", "rank", 5, 5),
      recommendationMetrics: {
        arxivCount: 0,
        candidateCount: 0,
        recommendationCount: 0,
        cacheHits: 0,
        embeddingRequested: 0,
      },
      onClear: () => {
        clearTaskCalls += 1;
      },
    };
    view.setTasks([
      {
        ...task("running", "profile", 2, 5),
        targetCount: 4,
        recommendationMetrics: {
          arxivCount: 56,
          candidateCount: 54,
          recommendationCount: 10,
          cacheHits: 54,
          embeddingRequested: 0,
        },
      },
      {
        ...task("failed", "fetch", 1, 5),
        recommendationMetrics: {},
      },
      completed,
    ]);

    assert.equal(
      host.querySelector("[data-role='run-progress'] span")?.textContent,
      "profile · 阶段 2/5",
    );
    assert.equal(
      host.querySelector("[data-role='recommendation-flow']")?.textContent,
      "检索 56篇 · 候选 54篇 · 推荐 10篇",
    );
    assert.equal(
      host.querySelector("[data-role='embedding-flow']")?.textContent,
      "向量复用 54篇 · 新计算 0篇 · 目标 4篇",
    );
    assert.include(
      host.querySelector("[data-task-status='running'] .zad-task-execution")
        ?.textContent,
      "开始",
    );
    host
      .querySelector<HTMLButtonElement>("[data-action='clear-task-history']")
      ?.click();
    assert.equal(clearHistoryCalls, 1);
    assert.exists(host.querySelector("[data-task-status='running']"));
    assert.notExists(host.querySelector("[data-task-status='failed']"));

    const completedFilter = host.querySelector<HTMLButtonElement>(
      "[data-task-filter='completed']",
    );
    completedFilter?.click();
    assert.equal(
      host.querySelector("[data-role='recommendation-flow']")?.textContent,
      "检索 0篇 · 候选 0篇 · 推荐 0篇",
    );
    host
      .querySelector<HTMLButtonElement>(
        "[data-task-status='completed'] [data-action='clear-task']",
      )
      ?.click();
    assert.equal(clearTaskCalls, 1);

    const failedFilter = host.querySelector<HTMLButtonElement>(
      "[data-task-filter='failed']",
    );
    failedFilter?.click();
    assert.exists(host.querySelector("[data-task-status='failed']"));
    assert.equal(
      host.querySelector("[data-role='recommendation-flow']")?.textContent,
      "检索 --篇 · 候选 --篇 · 推荐 --篇",
    );
    assert.notExists(host.querySelector("[data-task-status='running']"));
    view.destroy();
  });
});

function task(
  status: "running" | "failed" | "completed",
  stage: string,
  completed: number,
  total: number,
) {
  return {
    id: `${status}-task`,
    title: `${status} task`,
    stage,
    status,
    completed,
    total,
    createdAt: "2026-08-31T01:00:00.000Z",
    startedAt: "2026-08-31T01:00:01.000Z",
    ...(status === "completed"
      ? { completedAt: "2026-08-31T01:00:05.000Z" }
      : {}),
    cacheHits: 1,
    elapsedMs: 1200,
    lastEvent: "测试事件",
  } as const;
}
