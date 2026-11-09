import { h, isTextVNode, isElementVNode, createTextVNode } from '../../src/vdom/h';
import { TEXT } from '../../src/vdom/types';

describe('h()', () => {
  it('기본 엘리먼트 VNode를 만든다', () => {
    const v = h('div', { id: 'a' });
    expect(v).toEqual({ type: 'div', props: { id: 'a' }, children: [], key: null });
  });

  it('props가 null/undefined여도 빈 props로 정규화한다', () => {
    expect(h('div', null).props).toEqual({});
    expect(h('div').props).toEqual({});
  });

  it('문자열/숫자 child를 텍스트 VNode로 변환한다', () => {
    const v = h('p', null, 'hi', 3);
    // 인접 텍스트는 하나로 병합
    expect(v.children).toEqual([{ type: TEXT, text: 'hi3' }]);
  });

  it('인접한 텍스트는 병합하고 태그로 끊긴 텍스트는 분리한다', () => {
    const v = h('p', null, 'a', 'b', h('b'), 'c');
    expect(v.children.map((c) => (isTextVNode(c) ? c.text : c.type))).toEqual(['ab', 'b', 'c']);
  });

  it('null / undefined / boolean child를 제거한다', () => {
    const v = h('div', null, null, undefined, false, true, h('span'));
    expect(v.children).toHaveLength(1);
    expect(v.children[0]).toMatchObject({ type: 'span' });
  });

  it('빈 문자열 child는 제거한다 (DOM에 존재하지 않으므로)', () => {
    expect(h('div', null, '', 'x').children).toEqual([{ type: TEXT, text: 'x' }]);
  });

  it('0은 유효한 텍스트로 유지한다', () => {
    expect(h('div', null, 0).children).toEqual([{ type: TEXT, text: '0' }]);
  });

  it('중첩 배열을 깊게 flatten 한다', () => {
    const v = h('ul', null, [h('li'), [h('li'), [h('li')]]]);
    expect(v.children).toHaveLength(3);
  });

  it('배열 안의 falsy 값도 제거한다', () => {
    const v = h('ul', null, [null, h('li'), false]);
    expect(v.children).toHaveLength(1);
  });

  it('key를 props에서 분리한다', () => {
    const v = h('li', { key: 'k1', class: 'x' });
    expect(v.key).toBe('k1');
    expect(v.props).toEqual({ class: 'x' });
  });

  it('숫자 key를 허용하고, key 0도 유지한다', () => {
    expect(h('li', { key: 0 }).key).toBe(0);
    expect(h('li', { key: 7 }).key).toBe(7);
  });

  it('원본 props 객체를 변형하지 않는다', () => {
    const props = { key: 'a', id: 'b' };
    h('div', props);
    expect(props).toEqual({ key: 'a', id: 'b' });
  });

  it('함수형 컴포넌트 type을 보존하고 children을 props로 흘리지 않는다', () => {
    const Comp = (p: Record<string, unknown>) => h('div', p);
    const v = h(Comp, { a: 1 }, 'x');
    expect(v.type).toBe(Comp);
    expect(v.props).toEqual({ a: 1 });
    expect(v.children).toEqual([{ type: TEXT, text: 'x' }]);
  });

  it('이미 만들어진 VNode child는 그대로 사용한다', () => {
    const child = h('i');
    expect(h('div', null, child).children[0]).toBe(child);
  });

  it('지원하지 않는 child(일반 객체)는 TypeError', () => {
    // @ts-expect-error 의도적 잘못된 입력
    expect(() => h('div', null, { foo: 1 })).toThrow(TypeError);
  });

  it('type이 빈 문자열이면 에러', () => {
    expect(() => h('')).toThrow();
  });
});

describe('type guards / createTextVNode', () => {
  it('구분한다', () => {
    expect(isTextVNode(createTextVNode('a'))).toBe(true);
    expect(isElementVNode(createTextVNode('a'))).toBe(false);
    expect(isElementVNode(h('div'))).toBe(true);
  });
});

describe('h() - 텍스트 VNode child 병합', () => {
  it('이미 VNode인 텍스트 child도 인접 텍스트와 병합하고, 빈 텍스트는 버린다', () => {
    const v = h('p', null, 'a', createTextVNode('b'), createTextVNode(''), createTextVNode('c'));
    expect(v.children).toEqual([{ type: TEXT, text: 'abc' }]);
  });
});
