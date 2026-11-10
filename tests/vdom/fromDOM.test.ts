import { fromDOM, fromDOMChildren } from '../../src/vdom/fromDOM';
import { h } from '../../src/vdom/h';
import { TEXT } from '../../src/vdom/types';

function el(html: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
}

describe('fromDOM', () => {
  it('엘리먼트, 속성, 중첩 텍스트를 VNode로 변환한다', () => {
    const box = el('<div id="a" class="x"><p>hello</p></div>');
    const v = fromDOM(box.firstElementChild!);
    expect(v).toEqual(h('div', { id: 'a', class: 'x' }, h('p', null, 'hello')));
  });

  it('텍스트 노드를 TextVNode로 변환한다', () => {
    expect(fromDOM(document.createTextNode('hi'))).toEqual({ type: TEXT, text: 'hi' });
  });

  it('빈 텍스트 노드는 null', () => {
    expect(fromDOM(document.createTextNode(''))).toBeNull();
  });

  it('주석 노드는 null', () => {
    expect(fromDOM(document.createComment('c'))).toBeNull();
  });

  it('자식 주석은 무시한다', () => {
    const box = el('<div>a<!-- x -->b</div>');
    // 주석이 사라지면 인접 텍스트는 병합된다
    expect(fromDOM(box.firstElementChild!)).toEqual(h('div', null, 'ab'));
  });

  it('<script>는 제거한다 (루트는 null, 자식은 무시)', () => {
    const s = document.createElement('script');
    s.textContent = 'alert(1)';
    expect(fromDOM(s)).toBeNull();
    const box = el('<div><script>alert(1)</script><p>ok</p></div>');
    expect(fromDOM(box.firstElementChild!)).toEqual(h('div', null, h('p', null, 'ok')));
  });

  it('on* 이벤트 핸들러 속성은 무시한다', () => {
    const box = el('<button onclick="alert(1)" id="b">x</button>');
    expect(fromDOM(box.firstElementChild!)).toEqual(h('button', { id: 'b' }, 'x'));
  });

  it('style 속성은 문자열 그대로 유지한다', () => {
    const box = el('<div style="color: red;"></div>');
    expect(fromDOM(box.firstElementChild!)).toEqual(h('div', { style: 'color: red;' }));
  });

  describe('공백 처리', () => {
    it('줄바꿈을 포함한 공백 전용 텍스트(들여쓰기)는 버린다', () => {
      const box = el('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>');
      const v = fromDOM(box.firstElementChild!);
      expect(v).toEqual(h('ul', null, h('li', null, 'a'), h('li', null, 'b')));
    });

    it('태그 사이의 한 칸 공백은 유지한다', () => {
      const box = el('<p><b>a</b> <i>b</i></p>');
      const v = fromDOM(box.firstElementChild!);
      expect(v).toEqual(h('p', null, h('b', null, 'a'), ' ', h('i', null, 'b')));
    });

    it('텍스트 앞뒤 공백은 보존한다', () => {
      const box = el('<p> hi </p>');
      expect(fromDOM(box.firstElementChild!)).toEqual(h('p', null, ' hi '));
    });

    it('<pre> 안에서는 공백 전용 텍스트도 보존한다', () => {
      const box = el('<pre><code>a</code>\n  <code>b</code></pre>');
      const v = fromDOM(box.firstElementChild!);
      expect(v).toEqual(h('pre', null, h('code', null, 'a'), '\n  ', h('code', null, 'b')));
    });
  });

  it('인접한 텍스트 노드를 하나로 병합한다', () => {
    const p = document.createElement('p');
    p.appendChild(document.createTextNode('a'));
    p.appendChild(document.createTextNode('b'));
    expect(fromDOM(p)).toEqual(h('p', null, 'ab'));
  });

  describe('폼 요소', () => {
    it('input의 현재 value를 property에서 읽는다', () => {
      const input = document.createElement('input');
      input.setAttribute('value', 'init');
      input.value = 'typed'; // 사용자가 입력한 상태
      expect(fromDOM(input)).toEqual(h('input', { value: 'typed' }));
    });

    it('checkbox의 checked를 property에서 읽는다', () => {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      expect(fromDOM(input)).toEqual(h('input', { type: 'checkbox', checked: true }));
      input.checked = false;
      expect(fromDOM(input)).toEqual(h('input', { type: 'checkbox', checked: false }));
    });

    it('textarea는 value를 prop으로 읽고 자식은 두지 않는다', () => {
      const ta = document.createElement('textarea');
      ta.value = 'memo';
      expect(fromDOM(ta)).toEqual(h('textarea', { value: 'memo' }));
    });

    it('select는 현재 선택된 value를 prop으로 읽는다 (selected attribute 없이 바뀐 경우 포함)', () => {
      const box = el('<select><option value="a">A</option><option value="b">B</option></select>');
      const select = box.firstElementChild as HTMLSelectElement;
      select.value = 'b';
      expect(fromDOM(select)).toEqual(
        h('select', { value: 'b' }, h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')),
      );
    });

    it('불리언 속성(disabled)은 true로 정규화한다', () => {
      const box = el('<button disabled>x</button>');
      expect(fromDOM(box.firstElementChild!)).toEqual(h('button', { disabled: true }, 'x'));
    });
  });

  describe('SVG', () => {
    it('대소문자를 보존한다 (viewBox, foreignObject)', () => {
      const box = el('<svg viewBox="0 0 10 10"><foreignObject><div>x</div></foreignObject></svg>');
      const v = fromDOM(box.firstElementChild!);
      expect(v).toEqual(
        h('svg', { viewBox: '0 0 10 10' }, h('foreignObject', null, h('div', null, 'x'))),
      );
    });
  });

  it('원본 DOM을 변경하지 않는다', () => {
    const box = el('<div id="a">x<!--c--><script>1</script></div>');
    const before = box.innerHTML;
    fromDOM(box.firstElementChild!);
    expect(box.innerHTML).toBe(before);
  });

  it('key는 만들어내지 않는다', () => {
    const box = el('<li data-key="1">a</li>');
    expect(fromDOM(box.firstElementChild!)).toMatchObject({ key: null });
  });
});

describe('fromDOMChildren', () => {
  it('컨테이너의 자식들을 VNode 배열로 변환한다 (컨테이너 자신은 제외)', () => {
    const box = el('<h1>t</h1>\n<p>p</p>');
    expect(fromDOMChildren(box)).toEqual([h('h1', null, 't'), h('p', null, 'p')]);
  });

  it('비어있는 컨테이너는 빈 배열', () => {
    expect(fromDOMChildren(document.createElement('div'))).toEqual([]);
  });
});
