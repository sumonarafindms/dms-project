import { isDatabaseUnavailable } from "./http-errors";

export async function withDatabaseRetry<T>(work: () => Promise<T>, attempts = 3, delayMs = 220): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await work();
    } catch (error) {
      last = error;
      if (!isDatabaseUnavailable(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw last;
}
