/**
 * 테스트 환경 보정.
 * Node 25+는 --localstorage-file 없이는 전역 localStorage를 사용할 수 없게 막아 두고,
 * 그 때문에 jsdom 환경에서도 localStorage가 undefined가 된다. 실제 브라우저에서는 문제가 없으므로
 * 테스트에서만 메모리 기반 Storage로 대신한다.
 */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

if (typeof localStorage === 'undefined') {
  const storage = new MemoryStorage();
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, 'localStorage', { value: storage, configurable: true, writable: true });
  }
}
