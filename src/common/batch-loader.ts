export class BatchLoader<Key, Value> {
  private readonly cache = new Map<Key, Promise<Value>>();
  private readonly queue = new Map<
    Key,
    { resolve: (value: Value) => void; reject: (error: unknown) => void }[]
  >();
  private scheduled = false;

  constructor(
    private readonly batch: (keys: readonly Key[]) => Promise<Map<Key, Value>>,
    private readonly missing: (key: Key) => Value,
  ) {}

  load(key: Key): Promise<Value> {
    const cached = this.cache.get(key);
    if (cached) return cached;

    const promise = new Promise<Value>((resolve, reject) => {
      const pending = this.queue.get(key) ?? [];
      pending.push({ resolve, reject });
      this.queue.set(key, pending);
      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => void this.flush());
      }
    });
    this.cache.set(key, promise);
    return promise;
  }

  private async flush(): Promise<void> {
    const pending = new Map(this.queue);
    this.queue.clear();
    this.scheduled = false;
    try {
      const values = await this.batch([...pending.keys()]);
      for (const [key, handlers] of pending) {
        const value = values.has(key) ? values.get(key)! : this.missing(key);
        handlers.forEach(({ resolve }) => resolve(value));
      }
    } catch (error) {
      for (const handlers of pending.values()) {
        handlers.forEach(({ reject }) => reject(error));
      }
    }
  }
}
