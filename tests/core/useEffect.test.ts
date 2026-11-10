import { FunctionComponent } from '../../src/core/FunctionComponent';
import { useEffect, useMemo, useState } from '../../src/core/hooks';
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

describe('useEffect', () => {
  describe('실행 시점', () => {
    it('렌더와 DOM 반영(commit)이 끝난 뒤에 실행된다', () => {
      const root = container();
      let textSeenByEffect = '';
      new FunctionComponent(() => {
        useEffect(() => {
          textSeenByEffect = root.textContent ?? '';
        }, []);
        return h('p', null, 'rendered');
      }, root).mount();
      expect(textSeenByEffect).toBe('rendered');
    });

    it('렌더 함수 실행 중에는 실행되지 않는다', () => {
      const log: string[] = [];
      const root = container();
      new FunctionComponent(() => {
        log.push('render-start');
        useEffect(() => {
          log.push('effect');
        }, []);
        log.push('render-end');
        return h('div');
      }, root).mount();
      expect(log).toEqual(['render-start', 'render-end', 'effect']);
    });

    it('patch가 적용된 뒤에 실행된다 (onPatch → effect 순서)', () => {
      const log: string[] = [];
      const root = container();
      new FunctionComponent(
        () => {
          useEffect(() => {
            log.push('effect');
          }, []);
          return h('div');
        },
        root,
        {},
        { onPatch: () => log.push('patch') },
      ).mount();
      expect(log).toEqual(['patch', 'effect']);
    });

    it('DOM 변경이 없는(빈 패치) 리렌더에서도 deps가 바뀌었으면 실행된다', async () => {
      const effect = vi.fn();
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        useEffect(effect, [n]);
        return h('p', null, 'constant');
      }, root).mount();
      effect.mockClear();
      setN(1);
      await flush();
      expect(effect).toHaveBeenCalledTimes(1);
    });
  });

  describe('deps', () => {
    it('빈 deps([])는 mount 때 한 번만 실행된다', async () => {
      const effect = vi.fn();
      const root = container();
      let setN!: (f: (p: number) => number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        useEffect(effect, []);
        return h('p', null, String(n));
      }, root).mount();
      setN((p) => p + 1);
      await flush();
      setN((p) => p + 1);
      await flush();
      expect(effect).toHaveBeenCalledTimes(1);
    });

    it('deps를 생략하면 매 렌더마다 실행된다', async () => {
      const effect = vi.fn();
      const root = container();
      let setN!: (f: (p: number) => number) => void;
      new FunctionComponent(() => {
        const [, set] = useState(0);
        setN = set;
        useEffect(effect);
        return h('p');
      }, root).mount();
      setN((p) => p + 1);
      await flush();
      expect(effect).toHaveBeenCalledTimes(2);
    });

    it('deps가 바뀐 렌더에서만 다시 실행된다', async () => {
      const effect = vi.fn();
      const root = container();
      let setA!: (v: number) => void;
      let setB!: (v: number) => void;
      new FunctionComponent(() => {
        const [a, sa] = useState(0);
        const [b, sb] = useState(0);
        setA = sa;
        setB = sb;
        useEffect(effect, [a]);
        return h('p', null, `${a}${b}`);
      }, root).mount();
      effect.mockClear();
      setB(1);
      await flush();
      expect(effect).not.toHaveBeenCalled();
      setA(1);
      await flush();
      expect(effect).toHaveBeenCalledTimes(1);
    });

    it('effect는 실행 시점의 최신 값을 본다 (오래된 클로저가 아니다)', async () => {
      const seen: number[] = [];
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        useEffect(() => {
          seen.push(n);
        }, [n]);
        return h('p', null, String(n));
      }, root).mount();
      setN(1);
      await flush();
      setN(2);
      await flush();
      expect(seen).toEqual([0, 1, 2]);
    });

    it('document.title 같은 외부 동기화에 쓸 수 있다', async () => {
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        useEffect(() => {
          document.title = `count: ${n}`;
        }, [n]);
        return h('p', null, String(n));
      }, root).mount();
      expect(document.title).toBe('count: 0');
      setN(3);
      await flush();
      expect(document.title).toBe('count: 3');
    });
  });

  describe('cleanup', () => {
    it('다음 effect를 실행하기 전에 이전 cleanup이 먼저 호출된다', async () => {
      const log: string[] = [];
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        useEffect(() => {
          log.push(`effect ${n}`);
          return () => log.push(`cleanup ${n}`);
        }, [n]);
        return h('p', null, String(n));
      }, root).mount();
      setN(1);
      await flush();
      setN(2);
      await flush();
      expect(log).toEqual(['effect 0', 'cleanup 0', 'effect 1', 'cleanup 1', 'effect 2']);
    });

    it('deps가 바뀌지 않으면 cleanup도 호출되지 않는다', async () => {
      const cleanup = vi.fn();
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        useEffect(() => cleanup, []);
        return h('p', null, String(n));
      }, root).mount();
      setN(1);
      await flush();
      expect(cleanup).not.toHaveBeenCalled();
    });

    it('한 렌더에 effect가 여럿이면 cleanup을 모두 먼저 실행한 뒤 effect를 순서대로 실행한다', async () => {
      const log: string[] = [];
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        useEffect(() => {
          log.push(`A${n}`);
          return () => log.push(`cleanup A${n}`);
        }, [n]);
        useEffect(() => {
          log.push(`B${n}`);
          return () => log.push(`cleanup B${n}`);
        }, [n]);
        return h('p');
      }, root).mount();
      log.length = 0;
      setN(1);
      await flush();
      expect(log).toEqual(['cleanup A0', 'cleanup B0', 'A1', 'B1']);
    });

    it('effect가 함수가 아닌 값을 반환하면 무시한다', async () => {
      const root = container();
      let setN!: (v: number) => void;
      const effect = vi.fn(() => 123 as unknown as void);
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        useEffect(effect, [n]);
        return h('p');
      }, root).mount();
      expect(() => {
        setN(1);
      }).not.toThrow();
      await flush();
      expect(effect).toHaveBeenCalledTimes(2);
    });
  });

  describe('unmount', () => {
    it('unmount하면 cleanup이 호출된다', () => {
      const cleanup = vi.fn();
      const root = container();
      const app = new FunctionComponent(() => {
        useEffect(() => cleanup, []);
        return h('div');
      }, root);
      app.mount();
      app.unmount();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('여러 effect의 cleanup이 선언 순서대로 호출된다', () => {
      const log: string[] = [];
      const root = container();
      const app = new FunctionComponent(() => {
        useEffect(() => () => log.push('A'), []);
        useEffect(() => () => log.push('B'), []);
        return h('div');
      }, root);
      app.mount();
      app.unmount();
      expect(log).toEqual(['A', 'B']);
    });

    it('unmount하면 DOM이 비워진다', () => {
      const root = container();
      const app = new FunctionComponent(() => h('div', null, 'x'), root);
      app.mount();
      app.unmount();
      expect(root.childNodes).toHaveLength(0);
    });

    it('unmount 이후의 setState는 무시된다 (렌더도 effect도 없다)', async () => {
      const render = vi.fn();
      const effect = vi.fn();
      const root = container();
      let setN!: (v: number) => void;
      const app = new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        render();
        useEffect(effect, [n]);
        return h('p', null, String(n));
      }, root);
      app.mount();
      render.mockClear();
      effect.mockClear();
      app.unmount();
      setN(1);
      await flush();
      expect(render).not.toHaveBeenCalled();
      expect(effect).not.toHaveBeenCalled();
      expect(root.childNodes).toHaveLength(0);
    });

    it('예약된 렌더가 있는 상태에서 unmount해도 그 렌더는 실행되지 않는다', async () => {
      const render = vi.fn();
      const root = container();
      let setN!: (v: number) => void;
      const app = new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        render();
        return h('p', null, String(n));
      }, root);
      app.mount();
      render.mockClear();
      setN(1);
      app.unmount();
      await flush();
      expect(render).not.toHaveBeenCalled();
    });

    it('unmount를 두 번 호출해도 cleanup은 한 번만 실행된다', () => {
      const cleanup = vi.fn();
      const root = container();
      const app = new FunctionComponent(() => {
        useEffect(() => cleanup, []);
        return h('div');
      }, root);
      app.mount();
      app.unmount();
      app.unmount();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('다시 mount하면 상태와 effect가 새로 시작된다', () => {
      const effect = vi.fn();
      const root = container();
      const app = new FunctionComponent(() => {
        const [n] = useState(7);
        useEffect(effect, []);
        return h('p', null, String(n));
      }, root);
      app.mount();
      app.unmount();
      app.mount();
      expect(effect).toHaveBeenCalledTimes(2);
      expect(root.textContent).toBe('7');
    });
  });

  describe('effect 안의 상태 변경', () => {
    it('effect에서 setState하면 다시 렌더된다', async () => {
      const root = container();
      new FunctionComponent(() => {
        const [ready, setReady] = useState(false);
        useEffect(() => {
          setReady(true);
        }, []);
        return h('p', null, ready ? 'ready' : 'loading');
      }, root).mount();
      expect(root.textContent).toBe('loading');
      await flush();
      expect(root.textContent).toBe('ready');
    });

    it('effect가 throw해도 같은 렌더의 다른 effect는 실행되고 예외는 전달된다', () => {
      const second = vi.fn();
      const root = container();
      const app = new FunctionComponent(() => {
        useEffect(() => {
          throw new Error('effect boom');
        }, []);
        useEffect(second, []);
        return h('div');
      }, root);
      expect(() => app.mount()).toThrow('effect boom');
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('렌더가 throw하면 effect는 실행되지 않는다', () => {
      const effect = vi.fn();
      const root = container();
      const app = new FunctionComponent(() => {
        useEffect(effect, []);
        throw new Error('render boom');
      }, root);
      expect(() => app.mount()).toThrow('render boom');
      expect(effect).not.toHaveBeenCalled();
    });
  });

  describe('사용 제약', () => {
    it('자식 컴포넌트에서 useEffect를 호출하면 에러를 던진다', () => {
      const Child = (): VNode => {
        useEffect(() => {}, []);
        return h('div');
      };
      const root = container();
      expect(() => new FunctionComponent(() => h('main', null, h(Child)), root).mount()).toThrow(/루트 컴포넌트에서만/);
    });

    it('컴포넌트 밖에서 호출하면 에러를 던진다', () => {
      expect(() => useEffect(() => {}, [])).toThrow(/렌더 중에만/);
    });
  });

  describe('훅 호출 순서 제약', () => {
    it('렌더마다 같은 위치에서 다른 종류의 훅을 호출하면 에러를 던진다', () => {
      let useMemoFirst = false;
      const root = container();
      const app = new FunctionComponent(() => {
        if (useMemoFirst) useMemo(() => 1, []);
        else useState(1);
        return h('div');
      }, root);
      app.mount();
      useMemoFirst = true;
      expect(() => app.update()).toThrow(/훅 호출 순서/);
    });

    it('조건부로 훅을 건너뛰어 개수가 줄면 에러를 던진다', () => {
      let skip = false;
      const root = container();
      const app = new FunctionComponent(() => {
        useState(0);
        if (!skip) useState(1);
        return h('div');
      }, root);
      app.mount();
      skip = true;
      expect(() => app.update()).toThrow(/훅 호출 개수/);
    });

    it('이전 렌더보다 훅이 더 많이 호출되면 에러를 던진다', () => {
      let extra = false;
      const root = container();
      const app = new FunctionComponent(() => {
        useState(0);
        if (extra) useState(1);
        return h('div');
      }, root);
      app.mount();
      extra = true;
      expect(() => app.update()).toThrow(/이전 렌더보다 많습니다/);
      expect(app.hooks).toHaveLength(1); // 슬롯을 만들지 못한 채 던졌으므로 hooks는 늘지 않는다
    });

    it('에러가 나도 DOM은 이전 렌더 결과를 유지한다', () => {
      let skip = false;
      const root = container();
      const app = new FunctionComponent(() => {
        useState(0);
        if (!skip) useState(1);
        return h('p', null, skip ? 'changed' : 'original');
      }, root);
      app.mount();
      skip = true;
      expect(() => app.update()).toThrow();
      expect(root.textContent).toBe('original');
    });

    it('훅 호출 순서가 항상 같으면 문제없다', async () => {
      const root = container();
      let setN!: (v: number) => void;
      new FunctionComponent(() => {
        const [n, set] = useState(0);
        setN = set;
        const memo = useMemo(() => n * 2, [n]);
        useEffect(() => {}, [memo]);
        return h('p', null, String(memo));
      }, root).mount();
      setN(2);
      await flush();
      expect(root.textContent).toBe('4');
    });
  });

  describe('보강: 정리(cleanup) 누수와 실패 후 재시도', () => {
    it('effect 안에서 unmount해도 그 effect가 돌려준 cleanup은 호출된다', () => {
      const cleanup = vi.fn();
      const root = container();
      let app!: FunctionComponent;
      app = new FunctionComponent(() => {
        useEffect(() => {
          app.unmount();
          return cleanup;
        }, []);
        return h('div');
      }, root);
      app.mount();
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(root.childNodes).toHaveLength(0);
    });

    it('effect 안에서 unmount하면 같은 렌더의 남은 effect는 실행되지 않는다', () => {
      const second = vi.fn();
      const root = container();
      let app!: FunctionComponent;
      app = new FunctionComponent(() => {
        useEffect(() => {
          app.unmount();
        }, []);
        useEffect(second, []);
        return h('div');
      }, root);
      app.mount();
      expect(second).not.toHaveBeenCalled();
    });

    it('cleanup 안에서 unmount해도 다른 effect의 cleanup이 한 번씩만 호출되고 새 effect는 실행되지 않는다', () => {
      let dep = 0;
      const effectA = vi.fn();
      const cleanupB = vi.fn();
      const effectB = vi.fn(() => cleanupB);
      const root = container();
      let app!: FunctionComponent;
      app = new FunctionComponent(() => {
        useEffect(() => {
          effectA();
          return () => app.unmount();
        }, [dep]);
        useEffect(effectB, [dep]);
        return h('div');
      }, root);
      app.mount();
      dep = 1;
      app.update();
      expect(cleanupB).toHaveBeenCalledTimes(1);
      expect(effectA).toHaveBeenCalledTimes(1);
      expect(effectB).toHaveBeenCalledTimes(1);
    });

    it('unmount 없이 mount를 다시 호출하면 이전 mount의 cleanup이 먼저 호출된다', () => {
      const cleanup = vi.fn();
      const root = container();
      const app = new FunctionComponent(() => {
        useEffect(() => cleanup, []);
        return h('div');
      }, root);
      app.mount();
      app.mount();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('첫 렌더가 throw한 뒤 더 적은 훅으로 재시도해도 이후 렌더가 정상 동작한다', () => {
      let attempt = 0;
      const root = container();
      const app = new FunctionComponent(() => {
        useState(0);
        if (attempt++ === 0) {
          useState(1);
          throw new Error('first render boom');
        }
        return h('p', null, 'ok');
      }, root);
      expect(() => app.mount()).toThrow('first render boom');
      app.update(); // 재시도: 훅 1개
      expect(app.hooks).toHaveLength(1);
      expect(() => app.update()).not.toThrow();
      expect(root.textContent).toBe('ok');
    });

    it('렌더가 실패했다가 재시도에 성공하면 effect는 정확히 한 번만 더 실행된다', () => {
      let dep = 0;
      let fail = false;
      const effect = vi.fn();
      const root = container();
      const app = new FunctionComponent(() => {
        useEffect(effect, [dep]);
        if (fail) throw new Error('render boom');
        return h('div');
      }, root);
      app.mount();
      expect(effect).toHaveBeenCalledTimes(1);
      dep = 1;
      fail = true;
      expect(() => app.update()).toThrow('render boom');
      expect(effect).toHaveBeenCalledTimes(1); // 실패한 렌더에서는 실행되지 않는다
      fail = false;
      app.update();
      expect(effect).toHaveBeenCalledTimes(2);
      app.update();
      expect(effect).toHaveBeenCalledTimes(2); // 중복 실행 없음
    });

    it('cleanup이 throw해도 새 effect는 실행되고 첫 예외가 전달된다', () => {
      let dep = 0;
      const effectB = vi.fn();
      const root = container();
      const app = new FunctionComponent(() => {
        useEffect(() => () => {
          throw new Error('cleanup boom');
        }, [dep]);
        useEffect(effectB, [dep]);
        return h('div');
      }, root);
      app.mount();
      dep = 1;
      expect(() => app.update()).toThrow('cleanup boom');
      expect(effectB).toHaveBeenCalledTimes(2);
    });
  });
});
