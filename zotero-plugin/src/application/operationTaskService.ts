import type { RunCoordinator, RunStage, RunResult } from "./runCoordinator.ts";
import type {
  OperationTaskRecord,
  OperationTaskRepository,
} from "../infrastructure/storage/operationTaskRepository.ts";

export class OperationTaskService {
  readonly #tasks: OperationTaskRepository;
  readonly #coordinator: RunCoordinator;

  constructor(tasks: OperationTaskRepository, coordinator: RunCoordinator) {
    this.#tasks = tasks;
    this.#coordinator = coordinator;
  }

  list(): Promise<readonly OperationTaskRecord[]> {
    return this.#tasks.list();
  }

  cancel(taskID: string): Promise<void> {
    return this.#coordinator.cancel(taskID);
  }

  resume(taskID: string, stages: readonly RunStage[]): Promise<RunResult> {
    return this.#coordinator.resume(taskID, stages);
  }

  retry(taskID: string, stages: readonly RunStage[]): Promise<RunResult> {
    return this.#coordinator.resume(taskID, stages);
  }
}
