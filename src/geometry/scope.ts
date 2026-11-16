// Tracks WASM-backed objects so they can be freed in one go.
interface Deletable { delete(): void }

export class Scope {
  private items = new Set<Deletable>();
  /** keep: track and return */
  k<T extends Deletable>(o: T): T {
    this.items.add(o);
    return o;
  }
  /** stop tracking (caller takes ownership) */
  release<T extends Deletable>(o: T): T {
    this.items.delete(o);
    return o;
  }
  dispose(): void {
    for (const o of this.items) {
      try { o.delete(); } catch { /* already freed */ }
    }
    this.items.clear();
  }
}
