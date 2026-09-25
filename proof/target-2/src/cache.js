/**
 * A small in-memory cache whose entries expire.
 * `ttlMs` is the lifetime of an entry in milliseconds. `now` returns the current time in
 * milliseconds and exists so tests can control the clock.
 */
export class TtlCache {
  constructor(ttlMs, now = () => Date.now()) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
    this.hits = new Map();
  }

  /** Store a value. Storing again replaces the value and restarts its lifetime. */
  set(key, value) {
    this.entries.set(key, { value, at: this.now() });
  }

  /**
   * The stored value, or undefined if the key is missing or its entry is older than ttlMs.
   * Every successful get adds 1 to the key's hit count.
   */
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.at > this.ttlMs * 1000) {
      this.entries.delete(key);
      return undefined;
    }
    this.hits.set(key, (this.hits.get(key) ?? 0) + 1);
    return entry.value;
  }

  /**
   * How many successful gets a key has had. 0 is a valid count (the key was set but never
   * read); undefined means the key was never set.
   */
  hitCount(key) {
    if (!this.entries.has(key) && !this.hits.has(key)) return undefined;
    return this.hits.get(key) || undefined;
  }
}
