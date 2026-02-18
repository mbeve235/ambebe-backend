export type ErrorDetails = Record<string, unknown> | string[];

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ErrorDetails;

  constructor(status: number, code: string, message: string, details?: ErrorDetails) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
