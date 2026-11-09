import { FunctionComponent } from '../../src/core/FunctionComponent';
import { useMemo, useState } from '../../src/core/hooks';
import { h } from '../../src/vdom/h';
import type { VNode } from '../../src/vdom/types';

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useMemo', () => {
  it('첫 렌더에서 factory를 실행해 값을 돌려준다', () => {
    const root = container();
    new FunctionComponent(() => {
      const doubled = useMemo(() => 21 * 2, []);
      return h('p', null, String(doubled));
    }, root).mount();
    expect(root.textContent).toBe('42');
  });

  it('deps가 같으면 factory를 다시 실행하지 않고 캐시한 값을 돌려준다', () => {
    const factory = vi.fn(() => ({ big: true }));
    const values: unknown[] = [];
    const root = container();
    const app = new FunctionComponent(() => {
      values.push(useMemo(factory, [1, 'a']));
      return h('div');
    }, root);
    app.mount();
    app.update();
    app.update();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(values[1]).toBe(values[0]); // 같은 참조
    expect(values[2]).toBe(values[0]);
  });

  it('deps가 바뀌면 다시 계산한다', async () => {
    const factory = vi.fn((n: number) => n * 2);
    const root = container();
    let setN!: (v: number) => void;
    new FunctionComponent(() => {
      const [n, set] = useState(1);
      setN = set;
      const doubled = useMemo(() => factory(n), [n]);
      return h('p', null, String(doubled));
    }, root).mount();
    expect(factory).toHaveBeenCalledTimes(1);
    setN(5);
    await flush();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(root.textContent).toBe('10');
  });

  it('다른 state가 바뀌어 리렌더돼도 deps가 같으면 재계산하지 않는다', async () => {
    const factory = vi.fn(() => 'heavy');
    const root = container();
    let setOther!: (v: number) => void;
    new FunctionComponent(() => {
      const [n] = useState(1);
      const [other, set] = useState(0);
      setOther = set;
      const v = useMemo(factory, [n]);
      return h('p', null, `${v}${other}`);
    }, root).mount();
    setOther(1);
    await flush();
    setOther(2);
    await flush();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(root.textContent).toBe('heavy2');
  });

  it('deps를 생략하면 매 렌더 재계산한다', () => {
    const factory = vi.fn(() => 1);
    const root = container();
    const app = new FunctionComponent(() => {
      useMemo(factory);
      return h('div');
    }, root);
    app.mount();
    app.update();
    app.update();
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('빈 deps([])는 처음 한 번만 계산한다', () => {
    const factory = vi.fn(() => 1);
    const root = container();
    const app = new FunctionComponent(() => {
      useMemo(factory, []);
      return h('div');
    }, root);
    app.mount();
    app.update();
    app.update();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('deps는 Object.is로 얕게 비교한다 (NaN은 같은 값, 새 객체/배열은 다른 값)', () => {
    const factory = vi.fn(() => 1);
    let dep: unknown = NaN;
    const root = container();
    const app = new FunctionComponent(() => {
      useMemo(factory, [dep]);
      return h('div');
    }, root);
    app.mount();
    app.update();
    expect(factory).toHaveBeenCalledTimes(1);
    dep = { a: 1 };
    app.update();
    expect(factory).toHaveBeenCalledTimes(2);
    dep = { a: 1 }; // 내용은 같지만 새 객체
    app.update();
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('deps 길이가 바뀌면 다시 계산한다', () => {
    const factory = vi.fn(() => 1);
    let deps: unknown[] = [1];
    const root = container();
    const app = new FunctionComponent(() => {
      useMemo(factory, deps);
      return h('div');
    }, root);
    app.mount();
    deps = [1, 2];
    app.update();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('여러 useMemo는 호출 순서로 각자 캐시한다', async () => {
    const a = vi.fn(() => 'A');
    const b = vi.fn(() => 'B');
    const root = container();
    let setN!: (v: number) => void;
    new FunctionComponent(() => {
      const [n, set] = useState(0);
      setN = set;
      const x = useMemo(a, []);
      const y = useMemo(b, [n]);
      return h('p', null, x + y);
    }, root).mount();
    setN(1);
    await flush();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('필터된 목록처럼 파생 데이터를 캐시하면 같은 배열 참조를 쓴다', async () => {
    const seen: unknown[] = [];
    const root = container();
    let setQuery!: (v: string) => void;
    let setTick!: (f: (p: number) => number) => void;
    new FunctionComponent(() => {
      const [items] = useState(['apple', 'banana', 'avocado']);
      const [query, sq] = useState('a');
      const [, st] = useState(0);
      setQuery = sq;
      setTick = st;
      const filtered = useMemo(() => items.filter((i) => i.startsWith(query)), [items, query]);
      seen.push(filtered);
      return h('ul', null, filtered.map((t) => h('li', { key: t }, t)));
    }, root).mount();
    setTick((p) => p + 1);
    await flush();
    expect(seen[1]).toBe(seen[0]);
    setQuery('b');
    await flush();
    expect(seen[2]).not.toBe(seen[0]);
    expect(root.textContent).toBe('banana');
  });

  it('factory가 throw하면 예외가 전파되고 캐시는 비어 있다 (다음 렌더에서 다시 시도)', () => {
    let fail = true;
    const root = container();
    const app = new FunctionComponent(() => {
      const v = useMemo(() => {
        if (fail) throw new Error('memo boom');
        return 'ok';
      }, []);
      return h('p', null, v);
    }, root);
    expect(() => app.mount()).toThrow('memo boom');
    fail = false;
    app.mount();
    expect(root.textContent).toBe('ok');
  });

  it('자식 컴포넌트에서 useMemo를 호출하면 에러를 던진다', () => {
    const Child = (): VNode => {
      useMemo(() => 1, []);
      return h('div');
    };
    const root = container();
    expect(() => new FunctionComponent(() => h('main', null, h(Child)), root).mount()).toThrow(/루트 컴포넌트에서만/);
  });

  it('컴포넌트 밖에서 호출하면 에러를 던진다', () => {
    expect(() => useMemo(() => 1, [])).toThrow(/렌더 중에만/);
  });
});
