export class GranolaCapabilityRegistry<K extends string, V> {
  #items = new Map<K, V>();

  constructor(entries: Array<[K, V]> = []) {
    for (const [kind, value] of entries) {
      this.register(kind, value);
    }
  }

  entries(): Array<[K, V]> {
    return [...this.#items.entries()];
  }

  has(kind: K): boolean {
    return this.#items.has(kind);
  }

  register(kind: K, value: V): this {
    this.#items.set(kind, value);
    return this;
  }

  resolve(kind: K, label = "capability"): V {
    const value = this.#items.get(kind);
    if (!value) {
      throw new Error(`${label} not registered: ${kind}`);
    }

    return value;
  }
}
