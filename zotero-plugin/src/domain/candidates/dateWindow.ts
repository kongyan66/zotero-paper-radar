import type { Clock, DateWindow } from "../../shared/clock";

export const DEFAULT_FIRST_LOOKBACK_DAYS = 3;
export const MAX_AUTOMATIC_LOOKBACK_DAYS = 7;
export const MAX_MANUAL_LOOKBACK_DAYS = 14;

export interface ArxivDateWindow extends DateWindow {
  readonly days: number;
  readonly source: "first-run" | "last-success" | "manual";
}

export function resolveArxivDateWindow(options: {
  readonly lastSuccessfulAt?: Date | string;
  readonly manualDays?: number;
  readonly clock: Clock;
}): ArxivDateWindow {
  const to = options.clock.now();
  if (options.manualDays !== undefined) {
    const days = clampDays(options.manualDays, MAX_MANUAL_LOOKBACK_DAYS);
    return { from: subtractDays(to, days), to, days, source: "manual" };
  }

  if (!options.lastSuccessfulAt) {
    const days = DEFAULT_FIRST_LOOKBACK_DAYS;
    return {
      from: subtractDays(to, days),
      to,
      days,
      source: "first-run",
    };
  }

  const last = new Date(options.lastSuccessfulAt);
  if (Number.isNaN(last.getTime()) || last >= to) {
    const days = DEFAULT_FIRST_LOOKBACK_DAYS;
    return {
      from: subtractDays(to, days),
      to,
      days,
      source: "first-run",
    };
  }
  const elapsedDays = Math.max(
    1,
    Math.ceil((to.getTime() - last.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const days = Math.min(MAX_AUTOMATIC_LOOKBACK_DAYS, elapsedDays);
  return {
    from: last,
    to,
    days,
    source: "last-success",
  };
}

export function formatArxivDate(value: Date): string {
  const parts = [
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
    value.getUTCHours(),
    value.getUTCMinutes(),
  ].map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"));
  return `${parts[0]}${parts[1]}${parts[2]}${parts[3]}${parts[4]}`;
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function clampDays(value: number, maximum: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`days must be an integer between 1 and ${maximum}`);
  }
  return value;
}
