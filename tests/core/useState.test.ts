import { FunctionComponent } from '../../src/core/FunctionComponent';
import { useState } from '../../src/core/hooks';
import { h } from '../../src/vdom/h';
import type { VNode } from '../../src/vdom/types';

/** 예약된 마이크로태스크(배치 렌더)가 모두 실행될 때까지 기다린다. */
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useState', () => {
  describe('상태 유지와 리렌더', () => {
    it('초기값으로 첫 렌더한다', () => {
      const root = container();
      new FunctionComponent(() => {
        const [n] = useState(5);
        return h('p', null, String(n));
      }, root).mount();
      expect(root.textContent).toBe('5');
    });

    it('setState 후 마이크로태스크에서 다시 렌더되어 DOM에 반영된다', async () => {
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        return h('p', null, String(n));
      }, root).mount();
      setN(1);
      expect(root.textContent).toBe('0'); // 아직 반영 전 (배치)
      await flush();
      expect(root.textContent).toBe('1');
    });

    it('렌더가 반복되어도 상태가 유지된다', async () => {
      const root = container();
      let setN!: (f: (p: number) => number) => void;
      const app = new FunctionComponent(() => {
        const [n, set] = useState(10);
        setN = set;
        return h('p', null, String(n));
      }, root);
      app.mount();
      setN((p) => p + 1);
      await flush();
      app.update();
      app.update();
      expect(root.textContent).toBe('11');
    });

    it('클릭 핸들러에서 setState하면 리렌더된다 (카운터)', async () => {
      const root = container();
      new FunctionComponent(() => {
        const [count, setCount] = useState(0);
        return h('div', null, h('span', null, String(count)), h('button', { onClick: () => setCount(count + 1) }, '+'));
      }, root).mount();
      const button = root.querySelector('button')!;
      const span = root.querySelector('span')!;
      button.click();
      await flush();
      button.click();
      await flush();
      expect(root.querySelector('span')!.textContent).toBe('2');
      expect(root.querySelector('span')).toBe(span); // 같은 노드의 텍스트만 바뀐다
      expect(root.querySelector('button')).toBe(button);
    });

    it('상태가 바뀐 부분만 patch된다', async () => {
      const received: string[][] = [];
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(
        () => {
          const [n, set] = useState(0);
          setN = set;
          return h('div', null, h('h1', null, '고정'), h('p', null, String(n)));
        },
        root,
        {},
        { onPatch: (patches) => received.push(patches.map((p) => p.type)) },
      ).mount();
      received.length = 0;
      setN(1);
      await flush();
      expect(received).toEqual([['TEXT']]);
    });
  });

  describe('초기값', () => {
    it('함수형 초기값은 첫 렌더에서만 한 번 호출된다 (지연 초기화)', async () => {
      const init = vi.fn(() => 42);
      const root = container();
      const app = new FunctionComponent(() => {
        const [n] = useState(init);
        return h('p', null, String(n));
      }, root);
      app.mount();
      app.update();
      app.update();
      expect(init).toHaveBeenCalledTimes(1);
      expect(root.textContent).toBe('42');
    });

    it('falsy 초기값(0, 빈 문자열, false, null)도 그대로 쓴다', () => {
      const seen: unknown[] = [];
      const root = container();
      new FunctionComponent(() => {
        const [a] = useState(0);
        const [b] = useState('');
        const [c] = useState(false);
        const [d] = useState<null | number>(null);
        seen.push(a, b, c, d);
        return h('div');
      }, root).mount();
      expect(seen).toEqual([0, '', false, null]);
    });
  });

  describe('함수형 업데이트', () => {
    it('이전 값을 받아 새 값을 만든다', async () => {
      const root = container();
      let setN!: (f: (p: number) => number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(1);
        setN = set;
        return h('p', null, String(n));
      }, root).mount();
      setN((p) => p * 10);
      await flush();
      expect(root.textContent).toBe('10');
    });

    it('같은 배치에서 연속 호출하면 앞선 업데이트 결과를 이어받는다', async () => {
      const root = container();
      let setN!: (f: (p: number) => number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        return h('p', null, String(n));
      }, root).mount();
      setN((p) => p + 1);
      setN((p) => p + 1);
      setN((p) => p + 1);
      await flush();
      expect(root.textContent).toBe('3');
    });

    it('값과 함수형 업데이트를 섞어도 순서대로 적용된다', async () => {
      const root = container();
      let setN!: (v: number | ((p: number) => number)) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        return h('p', null, String(n));
      }, root).mount();
      setN(5);
      setN((p) => p + 1);
      await flush();
      expect(root.textContent).toBe('6');
    });
  });

  describe('동일값 무시', () => {
    it('같은 값으로 setState하면 다시 렌더하지 않는다', async () => {
      const render = vi.fn();
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(1);
        setN = set;
        render();
        return h('p', null, String(n));
      }, root).mount();
      render.mockClear();
      setN(1);
      await flush();
      expect(render).not.toHaveBeenCalled();
    });

    it('함수형 업데이트 결과가 같아도 다시 렌더하지 않는다', async () => {
      const render = vi.fn();
      const root = container();
      let setN!: (f: (p: number) => number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(1);
        setN = set;
        render();
        return h('p', null, String(n));
      }, root).mount();
      render.mockClear();
      setN((p) => p);
      await flush();
      expect(render).not.toHaveBeenCalled();
    });

    it('Object.is로 비교한다 (NaN은 같은 값, 객체는 참조가 다르면 다른 값)', async () => {
      const render = vi.fn();
      const root = container();
      let setNaN!: (v: number) => void;
      let setObj!: (v: { a: number }) => void;
      const same = { a: 1 };
      new FunctionComponent(() => {
        const [, a] = useState(NaN);
        const [, b] = useState(same);
        setNaN = a;
        setObj = b;
        render();
        return h('p');
      }, root).mount();
      render.mockClear();
      setNaN(NaN);
      setObj(same);
      await flush();
      expect(render).not.toHaveBeenCalled();
      setObj({ a: 1 });
      await flush();
      expect(render).toHaveBeenCalledTimes(1);
    });
  });

  describe('batching', () => {
    it('한 틱 안에서 setState를 여러 번 호출해도 렌더는 한 번이다', async () => {
      const render = vi.fn();
      const root = container();
      let setN!: (f: (p: number) => number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        render();
        return h('p', null, String(n));
      }, root).mount();
      render.mockClear();
      for (let i = 0; i < 10; i++) setN((p) => p + 1);
      await flush();
      expect(render).toHaveBeenCalledTimes(1);
      expect(root.textContent).toBe('10');
    });

    it('서로 다른 state를 여러 개 바꿔도 렌더는 한 번이다', async () => {
      const render = vi.fn();
      const root = container();
      let setA!: (v: string) => void;
      let setB!: (v: string) => void;
      new FunctionComponent(() => {
        const [a, sa] = useState('a');
        const [b, sb] = useState('b');
        setA = sa;
        setB = sb;
        render();
        return h('p', null, a + b);
      }, root).mount();
      render.mockClear();
      setA('x');
      setB('y');
      await flush();
      expect(render).toHaveBeenCalledTimes(1);
      expect(root.textContent).toBe('xy');
    });

    it('배치가 끝난 뒤의 setState는 새 렌더를 예약한다', async () => {
      const render = vi.fn();
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        render();
        return h('p', null, String(n));
      }, root).mount();
      render.mockClear();
      setN(1);
      await flush();
      setN(2);
      await flush();
      expect(render).toHaveBeenCalledTimes(2);
      expect(root.textContent).toBe('2');
    });

    it('이벤트 핸들러에서 여러 setState를 불러도 렌더는 한 번이다', async () => {
      const render = vi.fn();
      const root = container();
      new FunctionComponent(() => {
        const [a, setA] = useState(0);
        const [b, setB] = useState(0);
        render();
        return h('button', { onClick: () => { setA(a + 1); setB(b + 1); } }, `${a},${b}`);
      }, root).mount();
      render.mockClear();
      root.querySelector('button')!.click();
      await flush();
      expect(render).toHaveBeenCalledTimes(1);
      expect(root.textContent).toBe('1,1');
    });
  });

  describe('여러 state와 setter', () => {
    it('호출 순서(index)로 각 state를 구분한다', async () => {
      const root = container();
      let setA!: (v: string) => void;
      new FunctionComponent(() => {
        const [a, sa] = useState('A');
        const [b] = useState('B');
        setA = sa;
        return h('p', null, `${a}${b}`);
      }, root).mount();
      setA('Z');
      await flush();
      expect(root.textContent).toBe('ZB');
    });

    it('setter 참조는 렌더가 반복돼도 바뀌지 않는다', async () => {
      const setters: unknown[] = [];
      const root = container();
      const app = new FunctionComponent(() => {
        const [, set] = useState(0);
        setters.push(set);
        return h('p');
      }, root);
      app.mount();
      app.update();
      app.update();
      expect(new Set(setters).size).toBe(1);
    });

    it('객체 상태를 불변 방식으로 업데이트하면 리렌더된다', async () => {
      const root = container();
      let setTodo!: (f: (p: { done: boolean }) => { done: boolean }) => void;
      new FunctionComponent(() => {
        const [todo, set] = useState({ done: false });
        setTodo = set;
        return h('p', null, todo.done ? '완료' : '진행');
      }, root).mount();
      setTodo((p) => ({ ...p, done: true }));
      await flush();
      expect(root.textContent).toBe('완료');
    });

    it('배열 상태에 항목을 추가하면 새 항목만 CREATE된다', async () => {
      const root = container();
      let setItems!: (f: (p: string[]) => string[]) => void;
      const patchTypes: string[][] = [];
      new FunctionComponent(
        () => {
          const [items, set] = useState<string[]>(['a']);
          setItems = set;
          return h('ul', null, items.map((t) => h('li', { key: t }, t)));
        },
        root,
        {},
        { onPatch: (p) => patchTypes.push(p.map((x) => x.type)) },
      ).mount();
      patchTypes.length = 0;
      const first = root.querySelector('li');
      setItems((p) => [...p, 'b']);
      await flush();
      expect(patchTypes).toEqual([['CREATE']]);
      expect(root.querySelector('li')).toBe(first);
      expect(root.querySelectorAll('li')).toHaveLength(2);
    });
  });

  describe('타입', () => {
    it('컴포넌트가 VNode를 반환하는 함수 컴포넌트로 쓰인다', () => {
      const root = container();
      const App = (): VNode => {
        const [n] = useState(1);
        return h('p', null, String(n));
      };
      new FunctionComponent(App, root).mount();
      expect(root.textContent).toBe('1');
    });
  });
});
