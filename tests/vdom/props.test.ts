import { setProp, removeProp } from '../../src/vdom/props';

function div() {
  return document.createElement('div');
}

describe('setProp / removeProp', () => {
  it('일반 속성을 설정/제거한다', () => {
    const e = div();
    setProp(e, 'id', 'a');
    expect(e.getAttribute('id')).toBe('a');
    removeProp(e, 'id', 'a');
    expect(e.hasAttribute('id')).toBe(false);
  });

  it('숫자 값은 문자열로 설정한다 (0 포함)', () => {
    const e = div();
    setProp(e, 'tabindex', 0);
    expect(e.getAttribute('tabindex')).toBe('0');
  });

  it('className / htmlFor를 class / for로 매핑한다', () => {
    const e = document.createElement('label');
    setProp(e, 'className', 'x');
    setProp(e, 'htmlFor', 'inp');
    expect(e.getAttribute('class')).toBe('x');
    expect(e.getAttribute('for')).toBe('inp');
  });

  it('boolean: true는 빈 속성, false/null/undefined는 제거', () => {
    const e = document.createElement('button');
    setProp(e, 'disabled', true);
    expect(e.hasAttribute('disabled')).toBe(true);
    setProp(e, 'disabled', false);
    expect(e.hasAttribute('disabled')).toBe(false);
    setProp(e, 'disabled', true);
    setProp(e, 'disabled', null);
    expect(e.hasAttribute('disabled')).toBe(false);
  });

  it('style 문자열을 설정한다', () => {
    const e = div();
    setProp(e, 'style', 'color: red');
    expect(e.style.color).toBe('red');
  });

  it('style 객체를 설정하고, 바뀐 객체에서 빠진 속성은 사라진다', () => {
    const e = div();
    const a = { color: 'red', backgroundColor: 'blue' };
    setProp(e, 'style', a);
    expect(e.style.color).toBe('red');
    expect(e.style.backgroundColor).toBe('blue');
    setProp(e, 'style', { color: 'green' }, a);
    expect(e.style.color).toBe('green');
    expect(e.style.backgroundColor).toBe('');
  });

  it('style 제거 시 style 속성이 사라진다', () => {
    const e = div();
    setProp(e, 'style', 'color: red');
    removeProp(e, 'style', 'color: red');
    expect(e.hasAttribute('style')).toBe(false);
  });

  it('input value/checked는 property로 설정한다', () => {
    const i = document.createElement('input');
    setProp(i, 'value', 'abc');
    expect(i.value).toBe('abc');
    expect(i.hasAttribute('value')).toBe(false);
    i.type = 'checkbox';
    setProp(i, 'checked', true);
    expect(i.checked).toBe(true);
    setProp(i, 'checked', false);
    expect(i.checked).toBe(false);
  });

  it('value 제거 시 빈 문자열로 되돌린다', () => {
    const i = document.createElement('input');
    setProp(i, 'value', 'abc');
    removeProp(i, 'value', 'abc');
    expect(i.value).toBe('');
  });

  describe('이벤트 핸들러', () => {
    it('onClick 함수를 click 리스너로 등록한다', () => {
      const e = div();
      const fn = vi.fn();
      setProp(e, 'onClick', fn);
      e.dispatchEvent(new Event('click'));
      expect(fn).toHaveBeenCalledTimes(1);
      expect(e.hasAttribute('onclick')).toBe(false);
    });

    it('핸들러를 교체하면 이전 핸들러는 호출되지 않는다 (중복 등록 방지)', () => {
      const e = div();
      const a = vi.fn();
      const b = vi.fn();
      setProp(e, 'onClick', a);
      setProp(e, 'onClick', b, a);
      e.dispatchEvent(new Event('click'));
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('제거하면 더 이상 호출되지 않는다', () => {
      const e = div();
      const fn = vi.fn();
      setProp(e, 'onClick', fn);
      removeProp(e, 'onClick', fn);
      e.dispatchEvent(new Event('click'));
      expect(fn).not.toHaveBeenCalled();
    });

    it('함수가 아닌 on* 값은 무시한다 (인라인 핸들러 주입 차단)', () => {
      const e = div();
      setProp(e, 'onclick', 'alert(1)');
      expect(e.hasAttribute('onclick')).toBe(false);
    });

    it('이벤트 이름은 소문자로 변환한다 (onMouseDown → mousedown)', () => {
      const e = div();
      const fn = vi.fn();
      setProp(e, 'onMouseDown', fn);
      e.dispatchEvent(new Event('mousedown'));
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  it('key / children은 DOM 속성으로 나가지 않는다', () => {
    const e = div();
    setProp(e, 'key', 'k');
    setProp(e, 'children', 'c');
    expect(e.attributes.length).toBe(0);
  });

  it('전달받은 style 객체와 값을 변형하지 않는다', () => {
    const e = div();
    const style = Object.freeze({ color: 'red', 'font-size': '12px' });
    expect(() => setProp(e, 'style', style)).not.toThrow();
    expect(style).toEqual({ color: 'red', 'font-size': '12px' });
    expect(() => removeProp(e, 'style', style)).not.toThrow();
    expect(style).toEqual({ color: 'red', 'font-size': '12px' });
  });
});
