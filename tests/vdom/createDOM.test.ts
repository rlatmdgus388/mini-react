import { createDOM } from '../../src/vdom/createDOM';
import { fromDOMChildren } from '../../src/vdom/fromDOM';
import { h } from '../../src/vdom/h';
import { createTextVNode } from '../../src/vdom/h';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';

describe('createDOM', () => {
  it('엘리먼트와 자식을 만든다', () => {
    const node = createDOM(h('div', { id: 'a' }, h('p', null, 'hi'), 'tail')) as HTMLElement;
    expect(node.outerHTML).toBe('<div id="a"><p>hi</p>tail</div>');
  });

  it('텍스트 VNode는 Text 노드를 만든다', () => {
    const t = createDOM(createTextVNode('x'));
    expect(t.nodeType).toBe(Node.TEXT_NODE);
    expect(t.textContent).toBe('x');
  });

  it('특수문자는 텍스트로 안전하게 들어간다 (HTML 주입 안 됨)', () => {
    const node = createDOM(h('div', null, '<img src=x onerror=alert(1)>')) as HTMLElement;
    expect(node.children.length).toBe(0);
    expect(node.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('props를 적용한다 (class, boolean, style, 이벤트)', () => {
    const onClick = vi.fn();
    const node = createDOM(
      h('button', { class: 'b', disabled: true, style: { color: 'red' }, onClick }, 'x'),
    ) as HTMLElement;
    expect(node.getAttribute('class')).toBe('b');
    expect(node.hasAttribute('disabled')).toBe(true);
    expect(node.style.color).toBe('red');
    node.dispatchEvent(new Event('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('key는 DOM 속성이 되지 않는다', () => {
    const node = createDOM(h('li', { key: 'k' })) as HTMLElement;
    expect(node.attributes.length).toBe(0);
  });

  it('input의 value/checked를 property로 적용한다', () => {
    const input = createDOM(h('input', { type: 'checkbox', checked: true })) as HTMLInputElement;
    expect(input.checked).toBe(true);
    const text = createDOM(h('input', { value: 'v' })) as HTMLInputElement;
    expect(text.value).toBe('v');
  });

  it('textarea value를 적용한다', () => {
    const ta = createDOM(h('textarea', { value: 'memo' })) as HTMLTextAreaElement;
    expect(ta.value).toBe('memo');
  });

  describe('SVG 네임스페이스', () => {
    it('svg와 그 자손은 SVG 네임스페이스로 만든다', () => {
      const node = createDOM(h('svg', { viewBox: '0 0 1 1' }, h('circle', { r: 1 })));
      expect((node as Element).namespaceURI).toBe(SVG_NS);
      expect((node.firstChild as Element).namespaceURI).toBe(SVG_NS);
      expect((node as Element).getAttribute('viewBox')).toBe('0 0 1 1');
    });

    it('foreignObject 안쪽은 HTML 네임스페이스로 돌아간다', () => {
      const node = createDOM(h('svg', null, h('foreignObject', null, h('div'))));
      const div = node.firstChild!.firstChild as Element;
      expect(div.namespaceURI).toBe(HTML_NS);
    });

    it('부모 네임스페이스를 인자로 받아 상속한다 (patch에서 CREATE 시 사용)', () => {
      const circle = createDOM(h('circle'), SVG_NS) as Element;
      expect(circle.namespaceURI).toBe(SVG_NS);
    });
  });

  it('함수형 컴포넌트 type은 명확한 에러로 거절한다 (resolve 후 전달해야 함)', () => {
    const Comp = () => h('div');
    expect(() => createDOM(h(Comp))).toThrow(/컴포넌트/);
  });

  it('깊은 트리도 만든다', () => {
    let v = h('span', null, 'leaf');
    for (let i = 0; i < 200; i++) v = h('div', null, v);
    const node = createDOM(v) as HTMLElement;
    expect(node.querySelectorAll('div').length).toBe(199) // 루트 div 제외;
  });
});

describe('DOM → VDOM → DOM 왕복', () => {
  const samples: Record<string, string> = {
    '단순 구조': '<h1>제목</h1><p>본문 <b>굵게</b> 끝</p>',
    '속성': '<a href="https://x.com" class="l" id="i">링크</a>',
    '리스트': '<ul><li>a</li><li>b</li><li>c</li></ul>',
    '중첩 인라인': '<p><em><strong>x</strong></em> y</p>',
    '불리언 속성': '<button disabled>x</button>',
    'style': '<div style="color: red;">x</div>',
    'svg': '<svg viewBox="0 0 10 10"><circle r="3"></circle></svg>',
    '폼': '<form><input type="text"><select><option>1</option></select></form>',
    '공백 한 칸': '<p><b>a</b> <i>b</i></p>',
  };

  for (const [name, html] of Object.entries(samples)) {
    it(`${name}: 변환 후 다시 만들어도 동일하다`, () => {
      const src = document.createElement('div');
      src.innerHTML = html;
      const vnodes = fromDOMChildren(src);
      const out = document.createElement('div');
      vnodes.forEach((v) => out.appendChild(createDOM(v)));
      expect(out.innerHTML).toBe(src.innerHTML);
      // 멱등성: 한 번 더 왕복해도 VNode 동일
      expect(fromDOMChildren(out)).toEqual(vnodes);
    });
  }

  it('들여쓰기 공백이 있는 HTML도 왕복 후 VNode가 같다', () => {
    const src = document.createElement('div');
    src.innerHTML = '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>';
    const vnodes = fromDOMChildren(src);
    const out = document.createElement('div');
    vnodes.forEach((v) => out.appendChild(createDOM(v)));
    expect(fromDOMChildren(out)).toEqual(vnodes);
  });

  describe('select', () => {
    it('value prop은 자식 option이 붙은 뒤에 반영되어 선택 상태가 된다', () => {
      const node = createDOM(
        h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
      ) as HTMLSelectElement;
      expect(node.value).toBe('b');
      expect(node.selectedIndex).toBe(1);
    });

    it('select의 선택 상태가 DOM→VDOM→DOM 왕복 후에도 유지된다', () => {
      const box = document.createElement('div');
      box.innerHTML = '<select><option value="a">A</option><option value="b">B</option></select>';
      const select = box.firstElementChild as HTMLSelectElement;
      select.value = 'b';
      const vnode = fromDOMChildren(box)[0]!;
      const copy = createDOM(vnode) as HTMLSelectElement;
      expect(copy.value).toBe('b');
    });
  });

  describe('입력 불변성', () => {
    it('입력 VNode를 변형하지 않는다 (deep freeze 상태에서도 에러 없이 동작)', () => {
      const deepFreeze = <T>(o: T): T => {
        if (o && typeof o === 'object') {
          Object.values(o).forEach(deepFreeze);
          Object.freeze(o);
        }
        return o;
      };
      const vnode = deepFreeze(
        h('div', { id: 'a', style: { color: 'red' } }, h('input', { value: 'x' }), 'text'),
      );
      const snapshot = JSON.stringify(vnode);
      expect(() => createDOM(vnode)).not.toThrow();
      expect(JSON.stringify(vnode)).toBe(snapshot);
    });
  });
});
