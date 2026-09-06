import type { AppError } from "./errors";

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Failure {
  readonly ok: false;
  readonly error: AppError;
}

export type Result<T> = Success<T> | Failure;

export function success<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function failure(error: AppError): Failure {
  return { ok: false, error };
}
