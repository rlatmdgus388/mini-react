import { diff } from '../../src/diff/diff';
import { patch } from '../../src/diff/patch';
import { createDOM } from '../../src/vdom/createDOM';
import { h } from '../../src/vdom/h';
import type { VNode } from '../../src/vdom/types';

const li = (key: string | number, text = String(key)) => h('li', { key }, text);
const ul = (...items: VNode[]) => h('ul', null, ...items);

function mount(vnode: VNode): HTMLElement {
  const container = document.createElement('div');
  container.appendChild(createDOM(vnode));
  document.body.appendChild(container);
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('keyed diff', () => {
  describe('패치 목록', () => {
    it('key가 같고 내용이 같으면 순서가 같을 때 빈 패치', () => {
      expect(diff(ul(li('a'), li('b')), ul(li('a'), li('b')))).toEqual([]);
    });

    it('맨 뒤 항목을 맨 앞으로 옮기면 MOVE 하나', () => {
      const patches = diff(ul(li('a'), li('b'), li('c')), ul(li('c'), li('a'), li('b')));
      expect(patches).toEqual([{ type: 'MOVE', path: [2], to: 0 }]);
    });

    it('맨 앞 항목을 맨 뒤로 옮기면 MOVE 하나 (나머지를 전부 밀지 않는다)', () => {
      const patches = diff(ul(li('a'), li('b'), li('c')), ul(li('b'), li('c'), li('a')));
      expect(patches).toEqual([{ type: 'MOVE', path: [0], to: 2 }]);
    });

    it('앞에 항목을 끼워 넣으면 CREATE 하나뿐이고 기존 항목은 건드리지 않는다', () => {
      const added = li('x');
      const patches = diff(ul(li('a'), li('b')), ul(added, li('a'), li('b')));
      expect(patches).toEqual([{ type: 'CREATE', path: [0], vnode: added }]);
    });

    it('중간 항목을 지우면 REMOVE 하나뿐이다', () => {
      expect(diff(ul(li('a'), li('b'), li('c')), ul(li('a'), li('c')))).toEqual([
        { type: 'REMOVE', path: [1] },
      ]);
    });

    it('순서를 완전히 뒤집으면 MOVE는 n-1개 (최장 증가 부분수열 하나만 남는다)', () => {
      const patches = diff(
        ul(li('a'), li('b'), li('c'), li('d')),
        ul(li('d'), li('c'), li('b'), li('a')),
      );
      expect(patches.filter((p) => p.type === 'MOVE')).toHaveLength(3);
      expect(patches).toHaveLength(3);
    });

    it('두 항목의 자리만 바꾸면 MOVE 하나', () => {
      const patches = diff(
        ul(li('a'), li('b'), li('c'), li('d')),
        ul(li('a'), li('c'), li('b'), li('d')),
      );
      expect(patches.filter((p) => p.type === 'MOVE')).toHaveLength(1);
      expect(patches).toHaveLength(1);
    });

    it('이동하는 항목의 내용이 바뀌면 내부 패치는 이동 전(old) 경로를 가리킨다', () => {
      const patches = diff(ul(li('a', 'A'), li('b', 'B')), ul(li('b', 'B2'), li('a', 'A')));
      expect(patches[0]).toEqual({ type: 'TEXT', path: [1, 0], text: 'B2' });
      expect(patches.slice(1).every((p) => p.type === 'MOVE')).toBe(true);
    });

    it('key가 바뀌면 같은 자리여도 삭제 후 생성으로 본다 (노드를 재사용하지 않는다)', () => {
      const next = li('b');
      expect(diff(ul(li('a')), ul(next))).toEqual([
        { type: 'REMOVE', path: [0] },
        { type: 'CREATE', path: [0], vnode: next },
      ]);
    });

    it('같은 key라도 type이 다르면 그 자리에서 REPLACE', () => {
      const next = h('p', { key: 'a' }, 'a');
      expect(diff(ul(li('a')), ul(next))).toEqual([{ type: 'REPLACE', path: [0], vnode: next }]);
    });

    it('삭제와 생성과 이동이 섞이면 삭제 → 이동/생성 순서로 나온다', () => {
      const added = li('x');
      const patches = diff(ul(li('a'), li('b'), li('c')), ul(li('c'), added, li('a')));
      expect(patches[0]).toEqual({ type: 'REMOVE', path: [1] });
      expect(patches.some((p) => p.type === 'CREATE' && p.vnode === added)).toBe(true);
    });

    it('숫자 key와 같은 문자열 key는 같은 key로 본다', () => {
      expect(diff(ul(li(1, 'x')), ul(li('1', 'x')))).toEqual([]);
    });

    it('중첩된 목록에서도 부모 경로를 붙여 MOVE를 낸다', () => {
      const old = h('div', null, h('p'), ul(li('a'), li('b')));
      const next = h('div', null, h('p'), ul(li('b'), li('a')));
      const patches = diff(old, next);
      expect(patches).toHaveLength(1);
      expect(patches[0]).toMatchObject({ type: 'MOVE', path: [1, expect.any(Number)] });
    });

    it('key가 없는 목록은 기존처럼 인덱스 기준으로 비교한다 (MOVE가 나오지 않는다)', () => {
      const patches = diff(
        h('ul', null, h('li', null, 'a'), h('li', null, 'b')),
        h('ul', null, h('li', null, 'b'), h('li', null, 'a')),
      );
      expect(patches.some((p) => p.type === 'MOVE')).toBe(false);
      expect(patches.map((p) => p.type)).toEqual(['TEXT', 'TEXT']);
    });

    it('입력 트리를 변형하지 않는다 (deep freeze)', () => {
      const deepFreeze = <T>(o: T): T => {
        if (o && typeof o === 'object') {
          Object.values(o).forEach(deepFreeze);
          Object.freeze(o);
        }
        return o;
      };
      const a = deepFreeze(ul(li('a'), li('b'), li('c')));
      const b = deepFreeze(ul(li('c'), li('x'), li('a')));
      expect(() => diff(a, b)).not.toThrow();
    });

    it('key가 중복되어도 에러 없이 패치를 만든다 (첫 번째만 짝지어진다)', () => {
      expect(() => diff(ul(li('a'), li('a')), ul(li('a')))).not.toThrow();
      expect(() => diff(ul(li('a')), ul(li('a'), li('a')))).not.toThrow();
    });
  });

  describe('patch 적용', () => {
    function apply(oldV: VNode, newV: VNode): HTMLElement {
      const container = mount(oldV);
      patch(container, diff(oldV, newV));
      return container;
    }

    it('재정렬 후 DOM 순서가 목표와 같다', () => {
      const container = apply(ul(li('a'), li('b'), li('c')), ul(li('c'), li('a'), li('b')));
      expect(container.innerHTML).toBe('<ul><li>c</li><li>a</li><li>b</li></ul>');
    });

    it('이동한 항목은 새로 만들지 않고 같은 DOM 노드를 재사용한다', () => {
      const old = ul(li('a'), li('b'), li('c'));
      const container = mount(old);
      const [a, b, c] = Array.from(container.querySelectorAll('li'));
      patch(container, diff(old, ul(li('c'), li('a'), li('b'))));
      const after = Array.from(container.querySelectorAll('li'));
      expect(after).toEqual([c, a, b]);
      expect(after[0]).toBe(c);
      expect(after[1]).toBe(a);
      expect(after[2]).toBe(b);
    });

    it('앞에 끼워 넣어도 기존 항목은 같은 DOM 노드로 유지된다', () => {
      const old = ul(li('a'), li('b'));
      const container = mount(old);
      const [a, b] = Array.from(container.querySelectorAll('li'));
      patch(container, diff(old, ul(li('x'), li('a'), li('b'))));
      const after = Array.from(container.querySelectorAll('li'));
      expect(after[1]).toBe(a);
      expect(after[2]).toBe(b);
      expect(after[0]!.textContent).toBe('x');
    });

    it('항목에 딸린 입력값이 key를 따라 이동한다', () => {
      const row = (k: string) => h('div', { key: k }, h('input', { type: 'text', value: '' }));
      const old = h('form', null, row('a'), row('b'));
      const container = mount(old);
      const [inputA, inputB] = Array.from(container.querySelectorAll('input'));
      inputA!.value = 'typed-in-a';
      inputB!.value = 'typed-in-b';
      patch(container, diff(old, h('form', null, row('b'), row('a'))));
      const after = Array.from(container.querySelectorAll('input'));
      expect(after[0]).toBe(inputB);
      expect(after[1]).toBe(inputA);
      expect(after.map((i) => i.value)).toEqual(['typed-in-b', 'typed-in-a']);
    });

    it('이동과 내용 변경이 함께 있어도 결과가 맞다', () => {
      const container = apply(ul(li('a', 'A'), li('b', 'B')), ul(li('b', 'B2'), li('a', 'A')));
      expect(container.innerHTML).toBe('<ul><li>B2</li><li>A</li></ul>');
    });

    it('삭제·생성·이동이 섞여도 결과가 맞다', () => {
      const container = apply(
        ul(li('a'), li('b'), li('c'), li('d')),
        ul(li('d'), li('x'), li('a'), li('y')),
      );
      expect(container.innerHTML).toBe('<ul><li>d</li><li>x</li><li>a</li><li>y</li></ul>');
    });

    it('중복 key가 있어도 결과 DOM은 목표와 같다', () => {
      const container = apply(ul(li('a', '1'), li('a', '2')), ul(li('a', '3')));
      expect(container.innerHTML).toBe('<ul><li>3</li></ul>');
      const container2 = apply(ul(li('a', '1')), ul(li('a', '1'), li('a', '2')));
      expect(container2.innerHTML).toBe('<ul><li>1</li><li>2</li></ul>');
    });

    it('MOVE 대상 경로가 없으면 에러를 던진다', () => {
      const container = mount(ul(li('a')));
      expect(() => patch(container, [{ type: 'MOVE', path: [5], to: 0 }])).toThrow();
    });

    it('루트(path [])는 MOVE할 수 없다', () => {
      const container = mount(ul(li('a')));
      expect(() => patch(container, [{ type: 'MOVE', path: [], to: 0 }])).toThrow();
    });
  });

  describe('key와 텍스트·무키 자식이 섞인 목록', () => {
    it('텍스트와 key 없는 엘리먼트는 자리(인덱스)로 짝지어지고 key 있는 항목만 이동한다', () => {
      const old = h('div', null, 'head', li('a'), li('b'), h('hr'));
      const next = h('div', null, 'head', li('b'), li('a'), h('hr'));
      const container = mount(old);
      const hr = container.querySelector('hr');
      patch(container, diff(old, next));
      expect(container.innerHTML).toBe('<div>head<li>b</li><li>a</li><hr></div>');
      expect(container.querySelector('hr')).toBe(hr);
    });
  });
});
