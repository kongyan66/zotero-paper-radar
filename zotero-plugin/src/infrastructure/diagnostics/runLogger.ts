import { redactDiagnostics, type RedactionOptions } from "./redactor.ts";

export interface DiagnosticEvent {
  readonly eventID: string;
  readonly occurredAt: string;
  readonly type: "stage" | "batch" | "cache" | "user-action" | "error";
  readonly taskID?: string;
  readonly stage?: string;
  readonly durationMs?: number;
  readonly completed?: number;
  readonly total?: number;
  readonly cacheHits?: number;
  readonly cacheMisses?: number;
  readonly modelFingerprint?: string;
  readonly profileVersionID?: string;
  readonly weightVersionID?: string;
  readonly errorCode?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface DiagnosticsSnapshot {
  readonly environment: Readonly<Record<string, unknown>>;
  readonly profiles: readonly Readonly<Record<string, unknown>>[];
  readonly recentProfiles?: readonly Readonly<Record<string, unknown>>[];
  readonly longTermProfiles?: readonly Readonly<Record<string, unknown>>[];
  readonly candidates: readonly Readonly<Record<string, unknown>>[];
  readonly feedback: readonly Readonly<Record<string, unknown>>[];
  readonly operations: readonly Readonly<Record<string, unknown>>[];
  readonly runs?: readonly Readonly<Record<string, unknown>>[];
}

export interface DiagnosticsExport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly privacy: {
    readonly sampleContentIncluded: boolean;
    readonly sampleCandidateLimit: number;
    readonly redaction: "default" | "explicit-sample";
  };
  readonly environment: unknown;
  readonly profiles: unknown;
  readonly recentProfiles: unknown;
  readonly longTermProfiles: unknown;
  readonly candidates: unknown;
  readonly feedback: unknown;
  readonly operations: unknown;
  readonly runs: unknown;
  readonly events: unknown;
}

export class RunLogger {
  readonly #events: DiagnosticEvent[] = [];

  record(
    event: Omit<DiagnosticEvent, "eventID"> & { readonly eventID?: string },
  ): void {
    const safe = redactDiagnostics({
      ...event,
      eventID: event.eventID ?? `event-${this.#events.length + 1}`,
    }) as DiagnosticEvent | undefined;
    if (safe) this.#events.push(safe);
  }

  list(): readonly DiagnosticEvent[] {
    return [...this.#events];
  }

  clear(): void {
    this.#events.length = 0;
  }
}

export function createDiagnosticsExport(
  snapshot: DiagnosticsSnapshot,
  logger: RunLogger,
  options: RedactionOptions & { readonly generatedAt?: string } = {},
): DiagnosticsExport {
  const includeSampleContent = options.includeSampleContent === true;
  const redactionOptions = { includeSampleContent: false };
  const sampleCandidates = includeSampleContent
    ? snapshot.candidates.slice(0, 3).map(limitSampleContent)
    : snapshot.candidates;
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    privacy: {
      sampleContentIncluded: includeSampleContent,
      sampleCandidateLimit: includeSampleContent ? 3 : 0,
      redaction: includeSampleContent ? "explicit-sample" : "default",
    },
    environment: redactDiagnostics(snapshot.environment, redactionOptions),
    profiles: redactDiagnostics(snapshot.profiles, redactionOptions),
    recentProfiles: redactDiagnostics(
      snapshot.recentProfiles ?? [],
      redactionOptions,
    ),
    longTermProfiles: redactDiagnostics(
      snapshot.longTermProfiles ?? [],
      redactionOptions,
    ),
    candidates: redactDiagnostics(sampleCandidates, { includeSampleContent }),
    feedback: redactDiagnostics(snapshot.feedback, redactionOptions),
    operations: redactDiagnostics(snapshot.operations, redactionOptions),
    runs: redactDiagnostics(snapshot.runs ?? [], redactionOptions),
    events: redactDiagnostics(logger.list(), redactionOptions),
  };
}

function limitSampleContent(
  candidate: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result = { ...candidate };
  for (const key of ["title", "abstract"]) {
    const value = result[key];
    if (typeof value === "string" && value.length > 500) {
      result[key] = `${value.slice(0, 500)}...`;
    }
  }
  return result;
}

export function serializeDiagnosticsExport(value: DiagnosticsExport): string {
  return JSON.stringify(value, null, 2);
}
