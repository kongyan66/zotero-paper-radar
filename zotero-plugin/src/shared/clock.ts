export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  readonly #instant: Date;

  constructor(instant: Date | string) {
    this.#instant = new Date(instant);
    if (Number.isNaN(this.#instant.getTime())) {
      throw new TypeError("FixedClock requires a valid date");
    }
  }

  now(): Date {
    return new Date(this.#instant);
  }
}

export interface DateWindow {
  readonly from: Date;
  readonly to: Date;
}

export function dateWindowEndingNow(days: number, clock: Clock): DateWindow {
  if (!Number.isInteger(days) || days <= 0) {
    throw new RangeError("days must be a positive integer");
  }

  const to = clock.now();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to };
}

export function createRunId(kind: string, clock: Clock): string {
  const timestamp = clock.now().toISOString().replace(/[-:.]/g, "");
  return `${kind}-${timestamp}`;
}
