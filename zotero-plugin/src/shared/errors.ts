export type ErrorKind = "retryable" | "configuration" | "permanent";

export type DebugValue =
  | string
  | number
  | boolean
  | null
  | readonly DebugValue[]
  | { readonly [key: string]: DebugValue };

export interface AppError {
  readonly code: string;
  readonly kind: ErrorKind;
  readonly message: string;
  readonly retryable: boolean;
  readonly debugContext: Readonly<Record<string, DebugValue>>;
}

function createError(
  kind: ErrorKind,
  code: string,
  message: string,
  debugContext: Readonly<Record<string, DebugValue>> = {},
): AppError {
  return {
    code,
    kind,
    message,
    retryable: kind === "retryable",
    debugContext,
  };
}

export function retryableError(
  code: string,
  message: string,
  debugContext?: Readonly<Record<string, DebugValue>>,
): AppError {
  return createError("retryable", code, message, debugContext);
}

export function configurationError(
  code: string,
  message: string,
  debugContext?: Readonly<Record<string, DebugValue>>,
): AppError {
  return createError("configuration", code, message, debugContext);
}

export function permanentError(
  code: string,
  message: string,
  debugContext?: Readonly<Record<string, DebugValue>>,
): AppError {
  return createError("permanent", code, message, debugContext);
}
