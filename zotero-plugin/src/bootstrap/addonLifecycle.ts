export type LifecycleState =
  | "created"
  | "starting"
  | "started"
  | "stopping"
  | "stopped";

export interface ZoteroReadiness {
  readonly initialization: Promise<unknown>;
  readonly unlocked: Promise<unknown>;
  readonly uiReady: Promise<unknown>;
}

export type Disposer = () => void | Promise<void>;

export class AddonLifecycle {
  #state: LifecycleState = "created";
  #startPromise?: Promise<void>;
  readonly #disposers: Disposer[] = [];
  readonly #readiness: ZoteroReadiness;

  constructor(readiness: ZoteroReadiness) {
    this.#readiness = readiness;
  }

  get state(): LifecycleState {
    return this.#state;
  }

  async start(): Promise<void> {
    if (this.#state === "started") return;
    if (this.#state === "starting") return this.#startPromise;
    if (this.#state !== "created") {
      throw new Error(`Cannot start lifecycle from ${this.#state}`);
    }

    this.#state = "starting";
    this.#startPromise = Promise.all([
      this.#readiness.initialization,
      this.#readiness.unlocked,
      this.#readiness.uiReady,
    ]).then(() => {
      this.#state = "started";
    });

    try {
      await this.#startPromise;
    } catch (error) {
      this.#state = "stopped";
      throw error;
    }
  }

  registerDisposer(disposer: Disposer): void {
    if (this.#state !== "started") {
      throw new Error("Resources can only be registered after startup");
    }
    this.#disposers.push(disposer);
  }

  async shutdown(): Promise<void> {
    if (this.#state === "stopped") return;
    if (this.#state === "created") {
      this.#state = "stopped";
      return;
    }
    if (this.#state === "starting") {
      try {
        await this.#startPromise;
      } catch {
        return;
      }
    }
    if (this.#state === "stopping") return;

    this.#state = "stopping";
    const errors: unknown[] = [];
    for (const dispose of this.#disposers.splice(0).reverse()) {
      try {
        await dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.#state = "stopped";

    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to dispose plugin resources");
    }
  }
}
