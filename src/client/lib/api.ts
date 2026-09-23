import type { ErrorResponse } from "../../shared/contracts.js";

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as Partial<ErrorResponse>;
    const message = body.error || `Request failed with HTTP ${response.status}`;
    return new Error(body.code ? `${message} (${body.code})` : message);
  } catch {
    return new Error(`Request failed with HTTP ${response.status}`);
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}
