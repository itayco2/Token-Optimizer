/** Resolve after `ms` milliseconds. */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call `fn`. If it throws or rejects, try again, up to `retries` more times, so `fn` runs
 * at most retries + 1 times. Resolves with the first successful result; rejects with the
 * last error.
 * @param {() => Promise<any>} fn
 * @param {number} retries  a non-negative integer; 0 means a single attempt
 */
export async function retry(fn, retries) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
