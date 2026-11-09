import { diff } from '../../src/diff/diff';
import type { Patch } from '../../src/diff/diff';
import { patch } from '../../src/diff/patch';
import { createDOM } from '../../src/vdom/createDOM';
import { fromDOMChildren } from '../../src/vdom/fromDOM';
import { createTextVNode, h } from '../../src/vdom/h';
import type { VNode } from '../../src/vdom/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** 루트 VNode의 DOM을 자식으로 하나 가지는 컨테이너를 만든다. */
function mount(vnode: VNode | null): HTMLElement {
  const container = document.createElement('div');
  if (vnode) container.appendChild(createDOM(vnode));
  document.body.appendChild(container);
  return container;
}

/** old 트리를 렌더하고 diff→patch로 new 트리로 바꾼 뒤 컨테이너를 돌려준다. */
function applyDiff(oldV: VNode | null, newV: VNode | null): HTMLElement {
  const container = mount(oldV);
  patch(container, diff(oldV, newV));
  return container;
}

/** patch 결과 DOM이 목표 VNode를 새로 렌더한 것과 같은지 확인한다. */
function expectSameAsFreshRender(container: HTMLElement, target: VNode | null): void {
  const fresh = mount(target);
  expect(container.innerHTML).toBe(fresh.innerHTML);
  expect(fromDOMChildren(container)).toEqual(fromDOMChildren(fresh));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('patch', () => {
  describe('패치 종류별 적용', () => {
    it('빈 패치는 아무것도 바꾸지 않는다', () => {
      const tree = h('div', { id: 'a' }, h('p', null, 'x'));
      const container = mount(tree);
      const before = container.innerHTML;
      const root = container.firstChild;
      patch(container, []);
      expect(container.innerHTML).toBe(before);
      expect(container.firstChild).toBe(root);
    });

    it('TEXT: 텍스트 내용을 바꾼다', () => {
      const next = h('p', null, 'new');
      const container = applyDiff(h('p', null, 'old'), next);
      expect(container.innerHTML).toBe('<p>new</p>');
      expectSameAsFreshRender(container, next);
    });

    it('TEXT: 루트가 텍스트 노드여도 바꾼다', () => {
      const container = applyDiff(createTextVNode('a'), createTextVNode('b'));
      expect(container.textContent).toBe('b');
    });

    it('PROPS: 속성을 추가·변경·삭제한다', () => {
      const next = h('div', { b: 'two', d: '4' });
      const container = applyDiff(h('div', { a: '1', b: '2' }), next);
      const el = container.firstElementChild!;
      expect(el.hasAttribute('a')).toBe(false);
      expect(el.getAttribute('b')).toBe('two');
      expect(el.getAttribute('d')).toBe('4');
      expectSameAsFreshRender(container, next);
    });

    it('PROPS: class(className), style 객체를 반영한다', () => {
      const next = h('div', { className: 'b', style: { color: 'blue' } });
      const container = applyDiff(h('div', { class: 'a', style: { color: 'red' } }), next);
      const el = container.firstElementChild as HTMLElement;
      expect(el.getAttribute('class')).toBe('b');
      expect(el.style.color).toBe('blue');
    });

    it('PROPS: style 속성이 통째로 사라지면 제거한다', () => {
      const container = applyDiff(h('div', { style: { color: 'red' } }), h('div'));
      expect(container.firstElementChild!.hasAttribute('style')).toBe(false);
    });

    it('PROPS: 불리언 속성이 true에서 false로 바뀌면 제거한다', () => {
      const container = applyDiff(h('button', { disabled: true }), h('button', { disabled: false }));
      expect((container.firstElementChild as HTMLButtonElement).disabled).toBe(false);
      expect(container.firstElementChild!.hasAttribute('disabled')).toBe(false);
    });

    it('PROPS: 이벤트 핸들러를 교체하면 이전 핸들러는 제거되고 새 핸들러만 호출된다', () => {
      const oldHandler = vi.fn();
      const newHandler = vi.fn();
      const container = applyDiff(h('button', { onClick: oldHandler }), h('button', { onClick: newHandler }));
      container.firstElementChild!.dispatchEvent(new Event('click'));
      expect(oldHandler).not.toHaveBeenCalled();
      expect(newHandler).toHaveBeenCalledTimes(1);
    });

    it('PROPS: 이벤트 핸들러가 사라지면 더 이상 호출되지 않는다', () => {
      const handler = vi.fn();
      const container = applyDiff(h('button', { onClick: handler }), h('button'));
      container.firstElementChild!.dispatchEvent(new Event('click'));
      expect(handler).not.toHaveBeenCalled();
    });

    it('CREATE: 자식을 끝에 추가한다', () => {
      const next = h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'));
      const container = applyDiff(h('ul', null, h('li', null, 'a')), next);
      expect(container.innerHTML).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>');
      expectSameAsFreshRender(container, next);
    });

    it('CREATE: 빈 부모에 첫 자식을 만든다', () => {
      const container = applyDiff(h('div'), h('div', null, 'x'));
      expect(container.innerHTML).toBe('<div>x</div>');
    });

    it('CREATE: 루트가 없던 컨테이너에 루트를 만든다', () => {
      const next = h('div', { id: 'r' }, h('p', null, 'x'));
      const container = applyDiff(null, next);
      expect(container.innerHTML).toBe('<div id="r"><p>x</p></div>');
    });

    it('REMOVE: 여러 자식을 지워도 인덱스가 밀리지 않는다', () => {
      const next = h('ul', null, h('li', null, 'a'));
      const container = applyDiff(
        h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'), h('li', null, 'd')),
        next,
      );
      expect(container.innerHTML).toBe('<ul><li>a</li></ul>');
    });

    it('REMOVE: 루트를 지운다', () => {
      const container = applyDiff(h('div', null, 'x'), null);
      expect(container.childNodes.length).toBe(0);
    });

    it('REPLACE: type이 바뀐 노드를 새로 만든다', () => {
      const next = h('section', { id: 'n' }, h('p', null, 'x'));
      const container = applyDiff(h('div', null, h('article')), h('div', null, next));
      expect(container.innerHTML).toBe('<div><section id="n"><p>x</p></section></div>');
    });

    it('REPLACE: 루트를 교체한다', () => {
      const next = h('span', null, 'x');
      const container = applyDiff(h('div', null, 'x'), next);
      expect(container.innerHTML).toBe('<span>x</span>');
      expect(container.childNodes.length).toBe(1);
    });

    it('REPLACE: 텍스트↔엘리먼트 교체', () => {
      const next1 = h('p', null, h('b', null, 'x'));
      const c1 = applyDiff(h('p', null, 'x'), next1);
      expect(c1.innerHTML).toBe('<p><b>x</b></p>');
      const next2 = h('p', null, 'x');
      const c2 = applyDiff(h('p', null, h('b', null, 'x')), next2);
      expect(c2.innerHTML).toBe('<p>x</p>');
    });

    it('중첩 경로의 변경을 정확한 노드에 적용한다', () => {
      const next = h(
        'div',
        null,
        h('p', null, 'keep'),
        h('ul', null, h('li', { class: 'a' }, 'one'), h('li', { class: 'b' }, 'TWO'), h('li', null, 'three')),
      );
      const container = applyDiff(
        h('div', null, h('p', null, 'keep'), h('ul', null, h('li', { class: 'a' }, 'one'), h('li', null, 'two'))),
        next,
      );
      expectSameAsFreshRender(container, next);
    });

    it('여러 부모에서 CREATE/REMOVE/TEXT가 섞여도 결과가 같다', () => {
      const old = h('div', null, h('p', null, h('b', null, 'x'), h('b', null, 'y')), h('p', null, 'z'), h('span'));
      const next = h('div', null, h('p', null, h('b', null, 'X')), h('p', null, 'z', h('i')), h('em'), h('u'));
      expectSameAsFreshRender(applyDiff(old, next), next);
    });
  });

  describe('네임스페이스', () => {
    it('SVG 안에서 CREATE한 노드는 SVG 네임스페이스를 가진다', () => {
      const container = applyDiff(h('svg'), h('svg', null, h('circle', { r: '5' })));
      const circle = container.querySelector('circle')!;
      expect(circle.namespaceURI).toBe(SVG_NS);
    });

    it('SVG 안에서 REPLACE한 노드도 SVG 네임스페이스를 가진다', () => {
      const container = applyDiff(h('svg', null, h('circle')), h('svg', null, h('rect')));
      expect(container.querySelector('rect')!.namespaceURI).toBe(SVG_NS);
    });

    it('foreignObject 안에서 CREATE한 노드는 HTML 네임스페이스를 가진다', () => {
      const container = applyDiff(h('svg', null, h('foreignObject')), h('svg', null, h('foreignObject', null, h('div'))));
      expect(container.querySelector('div')!.namespaceURI).toBe(HTML_NS);
    });

    it('루트가 svg인 CREATE는 SVG 네임스페이스를 가진다', () => {
      const container = applyDiff(null, h('svg', null, h('circle')));
      expect(container.querySelector('svg')!.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('circle')!.namespaceURI).toBe(SVG_NS);
    });
  });

  describe('DOM 노드 재사용', () => {
    it('변경 없는 노드는 identity를 유지한다', () => {
      const old = h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'));
      const container = mount(old);
      const [ul, li0, li1, li2] = [
        container.firstElementChild!,
        container.querySelectorAll('li')[0]!,
        container.querySelectorAll('li')[1]!,
        container.querySelectorAll('li')[2]!,
      ];
      patch(container, diff(old, h('ul', null, h('li', null, 'a'), h('li', null, 'B'), h('li', null, 'c'))));
      expect(container.firstElementChild).toBe(ul);
      const items = container.querySelectorAll('li');
      expect(items[0]).toBe(li0);
      expect(items[1]).toBe(li1);
      expect(items[2]).toBe(li2);
      expect(li1.textContent).toBe('B');
    });

    it('속성만 바뀐 노드는 같은 DOM 노드가 유지된다', () => {
      const old = h('div', { class: 'a' }, h('p', null, 'x'));
      const container = mount(old);
      const div = container.firstElementChild!;
      const p = div.firstElementChild!;
      patch(container, diff(old, h('div', { class: 'b' }, h('p', null, 'x'))));
      expect(container.firstElementChild).toBe(div);
      expect(div.firstElementChild).toBe(p);
    });

    it('텍스트만 바뀐 노드는 같은 Text 노드가 유지된다', () => {
      const old = h('p', null, 'old');
      const container = mount(old);
      const text = container.firstElementChild!.firstChild!;
      patch(container, diff(old, h('p', null, 'new')));
      expect(container.firstElementChild!.firstChild).toBe(text);
    });

    it('CREATE/REMOVE 때 기존 형제 노드는 그대로 유지된다', () => {
      const old = h('ul', null, h('li', null, 'a'), h('li', null, 'b'));
      const container = mount(old);
      const li0 = container.querySelectorAll('li')[0]!;
      patch(container, diff(old, h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'))));
      expect(container.querySelectorAll('li')[0]).toBe(li0);
      patch(container, diff(h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c')), h('ul', null, h('li', null, 'a'))));
      expect(container.querySelectorAll('li')[0]).toBe(li0);
    });
  });

  describe('입력 요소', () => {
    it('input의 value를 property로 갱신하고 같은 노드와 포커스를 유지한다', () => {
      const old = h('div', null, h('input', { type: 'text', value: 'a' }));
      const container = mount(old);
      const input = container.querySelector('input')!;
      input.focus();
      expect(document.activeElement).toBe(input);

      patch(container, diff(old, h('div', null, h('input', { type: 'text', value: 'b' }))));

      expect(container.querySelector('input')).toBe(input);
      expect(input.value).toBe('b');
      expect(document.activeElement).toBe(input);
    });

    it('사용자가 입력한 값이 있어도 value prop이 바뀌면 덮어쓴다', () => {
      const old = h('input', { type: 'text', value: 'a' });
      const container = mount(old);
      const input = container.querySelector('input')!;
      input.value = 'typed';
      patch(container, diff(old, h('input', { type: 'text', value: 'z' })));
      expect(input.value).toBe('z');
    });

    it('value가 같으면 사용자가 입력한 값을 건드리지 않는다', () => {
      const old = h('div', { class: 'a' }, h('input', { type: 'text', value: 'a' }));
      const container = mount(old);
      const input = container.querySelector('input')!;
      input.value = 'typed';
      patch(container, diff(old, h('div', { class: 'b' }, h('input', { type: 'text', value: 'a' }))));
      expect(input.value).toBe('typed');
    });

    it('checked를 property로 갱신한다', () => {
      const old = h('input', { type: 'checkbox', checked: false });
      const container = mount(old);
      const box = container.querySelector('input')!;
      patch(container, diff(old, h('input', { type: 'checkbox', checked: true })));
      expect(box.checked).toBe(true);
      patch(container, diff(h('input', { type: 'checkbox', checked: true }), h('input', { type: 'checkbox', checked: false })));
      expect(box.checked).toBe(false);
    });

    it('value prop이 사라지면 빈 값으로 되돌린다', () => {
      const old = h('input', { type: 'text', value: 'a' });
      const container = mount(old);
      const input = container.querySelector('input')!;
      patch(container, diff(old, h('input', { type: 'text' })));
      expect(input.value).toBe('');
    });

    it('select의 value는 새로 생긴 option이 붙은 뒤에 반영된다', () => {
      const old = h('select', { value: 'a' }, h('option', { value: 'a' }, 'A'));
      const next = h('select', { value: 'c' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'c' }, 'C'));
      const container = mount(old);
      const select = container.querySelector('select')!;
      patch(container, diff(old, next));
      expect(container.querySelector('select')).toBe(select);
      expect(select.value).toBe('c');
    });

    it('textarea의 value를 property로 갱신한다', () => {
      const old = h('textarea', { value: 'a' });
      const container = mount(old);
      const ta = container.querySelector('textarea')!;
      patch(container, diff(old, h('textarea', { value: 'b' })));
      expect(ta.value).toBe('b');
    });
  });

  describe('보강: type 우선 적용, select, 네임스페이스, 혼합 자식', () => {
    it('type과 value가 함께 바뀌어도 최종 상태가 올바르다 (선언 순서와 무관)', () => {
      const old = h('input', { type: 'text', value: 'a' });
      const next = h('input', { value: 'v', type: 'checkbox' });
      const container = mount(old);
      const input = container.querySelector('input')!;
      patch(container, diff(old, next));
      expect(input.type).toBe('checkbox');
      expect(input.getAttribute('value')).toBe('v');
      expect(input.value).toBe('v');
    });

    it('select의 value가 바뀌면서 기존 option이 REMOVE되어도 값이 반영된다', () => {
      const old = h(
        'select',
        { value: 'c' },
        h('option', { value: 'a' }, 'A'),
        h('option', { value: 'b' }, 'B'),
        h('option', { value: 'c' }, 'C'),
      );
      const next = h('select', { value: 'a' }, h('option', { value: 'a' }, 'A'));
      const container = mount(old);
      const select = container.querySelector('select')!;
      expect(select.value).toBe('c');
      patch(container, diff(old, next));
      expect(select.options.length).toBe(1);
      expect(select.value).toBe('a');
    });

    it('foreignObject 안에서 REPLACE한 노드는 HTML 네임스페이스를 가진다', () => {
      const container = applyDiff(
        h('svg', null, h('foreignObject', null, h('div'))),
        h('svg', null, h('foreignObject', null, h('section'))),
      );
      expect(container.querySelector('section')!.namespaceURI).toBe(HTML_NS);
    });

    it('SVG에서 HTML로, HTML에서 SVG로 바꿀 때 각자 올바른 네임스페이스를 가진다', () => {
      const toHtml = applyDiff(h('div', null, h('svg')), h('div', null, h('span')));
      expect(toHtml.querySelector('span')!.namespaceURI).toBe(HTML_NS);
      const toSvg = applyDiff(h('div', null, h('p')), h('div', null, h('svg', null, h('circle'))));
      expect(toSvg.querySelector('svg')!.namespaceURI).toBe(SVG_NS);
      expect(toSvg.querySelector('circle')!.namespaceURI).toBe(SVG_NS);
    });

    it('텍스트·엘리먼트가 섞인 자식에서 뒤쪽 텍스트 노드를 지운다', () => {
      const next = h('p', null, 'a', h('b', null, 'b'));
      const container = applyDiff(h('p', null, 'a', h('b', null, 'b'), 'c', h('i', null, 'd')), next);
      expect(container.innerHTML).toBe('<p>a<b>b</b></p>');
      expectSameAsFreshRender(container, next);
    });

    it('텍스트 자리를 엘리먼트로 교체해도 앞뒤 형제의 위치가 유지된다', () => {
      const next = h('p', null, h('b', null, 'b'), h('u', null, 'u'), h('i', null, 'i'));
      const container = applyDiff(h('p', null, h('b', null, 'b'), 'x', h('i', null, 'i')), next);
      expect(container.innerHTML).toBe('<p><b>b</b><u>u</u><i>i</i></p>');
    });

    it('엘리먼트 자리를 텍스트로 교체해도 앞뒤 형제의 위치가 유지된다', () => {
      const next = h('p', null, h('b', null, 'b'), 'x', h('i', null, 'i'));
      const container = applyDiff(h('p', null, h('b', null, 'b'), h('u', null, 'u'), h('i', null, 'i')), next);
      expect(container.innerHTML).toBe('<p><b>b</b>x<i>i</i></p>');
    });
  });

  describe('입력 불변성과 오류', () => {
    it('패치 배열과 그 안의 VNode를 변형하지 않는다', () => {
      const deepFreeze = <T>(o: T): T => {
        if (o && typeof o === 'object') {
          Object.values(o).forEach(deepFreeze);
          Object.freeze(o);
        }
        return o;
      };
      const old = h('div', { id: 'a' }, h('p', null, 'x'));
      const next = h('div', { id: 'b', style: { color: 'red' } }, h('p', null, 'y'), h('i', null, 'z'));
      const patches = deepFreeze(diff(old, next));
      const snapshot = JSON.stringify(patches);
      const container = mount(old);
      expect(() => patch(container, patches)).not.toThrow();
      expect(JSON.stringify(patches)).toBe(snapshot);
      expectSameAsFreshRender(container, next);
    });

    it('존재하지 않는 경로를 가리키면 에러를 던진다', () => {
      const container = mount(h('div', null, 'x'));
      const bad: Patch[] = [{ type: 'TEXT', path: [5, 0], text: 'y' }];
      expect(() => patch(container, bad)).toThrow();
    });

    it('엘리먼트가 아닌 노드에 PROPS를 적용하면 에러를 던진다', () => {
      const container = mount(h('p', null, 'x'));
      const bad: Patch[] = [{ type: 'PROPS', path: [0], set: { id: 'a' }, remove: [] }];
      expect(() => patch(container, bad)).toThrow();
    });

    it('텍스트가 아닌 노드에 TEXT를 적용하면 에러를 던진다', () => {
      const container = mount(h('p', null, 'x'));
      const bad: Patch[] = [{ type: 'TEXT', path: [], text: 'y' }];
      expect(() => patch(container, bad)).toThrow();
    });
  });

  describe('diff → patch 왕복', () => {
    const trees: Record<string, [VNode | null, VNode | null]> = {
      '목록 항목 추가·삭제·수정': [
        h('ul', { class: 'list' }, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c')),
        h('ul', { class: 'list wide' }, h('li', null, 'a'), h('li', { id: 'x' }, 'B')),
      ],
      '중첩 구조 재구성': [
        h('main', null, h('header', null, h('h1', null, 'T')), h('section', null, h('p', null, 'x'))),
        h('main', null, h('header', null, h('h2', null, 'T2')), h('footer', null, 'f')),
      ],
      '텍스트와 엘리먼트 혼합': [
        h('p', null, 'a', h('b', null, 'b'), 'c'),
        h('p', null, 'A', h('i', null, 'b'), 'c', h('u')),
      ],
      '폼': [
        h('form', null, h('input', { type: 'text', value: 'a' }), h('input', { type: 'checkbox', checked: true })),
        h('form', { action: '/x' }, h('input', { type: 'text', value: 'b' }), h('input', { type: 'checkbox', checked: false })),
      ],
      'SVG': [
        h('svg', { viewBox: '0 0 10 10' }, h('circle', { r: '1' })),
        h('svg', { viewBox: '0 0 20 20' }, h('circle', { r: '2' }), h('rect', { width: '3' })),
      ],
      '루트 생성': [null, h('div', null, 'x')],
      '루트 삭제': [h('div', null, 'x'), null],
    };

    for (const [name, [oldV, newV]] of Object.entries(trees)) {
      it(`${name}: patch 결과가 목표 VNode를 새로 렌더한 것과 같다`, () => {
        expectSameAsFreshRender(applyDiff(oldV, newV), newV);
      });
    }
  });

  describe('반환값: 변경이 일어난 노드 (시각화용)', () => {
    function run(oldV: VNode | null, newV: VNode | null) {
      const container = mount(oldV);
      const touched = patch(container, diff(oldV, newV));
      return { container, touched };
    }

    it('빈 패치는 빈 배열을 돌려준다', () => {
      const container = mount(h('div'));
      expect(patch(container, [])).toEqual([]);
    });

    it('TEXT: 내용이 바뀐 텍스트 노드', () => {
      const { container, touched } = run(h('p', null, 'old'), h('p', null, 'new'));
      expect(touched).toEqual([container.querySelector('p')!.firstChild]);
    });

    it('PROPS: 속성이 바뀐 요소', () => {
      const { container, touched } = run(h('div', { id: 'a' }), h('div', { id: 'b' }));
      expect(touched).toEqual([container.firstElementChild]);
    });

    it('CREATE: 새로 만든 노드', () => {
      const { container, touched } = run(h('ul', null, h('li', null, 'a')), h('ul', null, h('li', null, 'a'), h('li', null, 'b')));
      expect(touched).toEqual([container.querySelectorAll('li')[1]]);
    });

    it('REPLACE: 새로 들어온 노드 (사라진 노드는 포함하지 않는다)', () => {
      const container = mount(h('div', null, h('p')));
      const oldP = container.querySelector('p');
      const touched = patch(container, diff(h('div', null, h('p')), h('div', null, h('span'))));
      expect(touched).toEqual([container.querySelector('span')]);
      expect(touched).not.toContain(oldP);
    });

    it('REMOVE: 자식이 사라진 부모 요소', () => {
      const { container, touched } = run(h('ul', null, h('li', null, 'a'), h('li', null, 'b')), h('ul', null, h('li', null, 'a')));
      expect(touched).toEqual([container.querySelector('ul')]);
    });

    it('REMOVE: 루트를 지우면 컨테이너는 포함하지 않는다', () => {
      const { touched } = run(h('div'), null);
      expect(touched).toEqual([]);
    });

    it('MOVE: 옮겨진 노드', () => {
      const li = (k: string) => h('li', { key: k }, k);
      const container = mount(h('ul', null, li('a'), li('b'), li('c')));
      const [a] = Array.from(container.querySelectorAll('li'));
      const touched = patch(container, diff(h('ul', null, li('a'), li('b'), li('c')), h('ul', null, li('b'), li('c'), li('a'))));
      expect(touched).toEqual([a]);
    });

    it('같은 노드가 여러 패치에 걸려도 한 번만 담긴다', () => {
      const { container, touched } = run(h('p', { class: 'a' }, 'x', h('b')), h('p', { class: 'b' }, 'x', h('b'), h('i')));
      const p = container.querySelector('p')!;
      expect(touched.filter((n) => n === p)).toHaveLength(1);
      expect(new Set(touched).size).toBe(touched.length);
    });
  });
});
