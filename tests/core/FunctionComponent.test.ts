import { FunctionComponent } from '../../src/core/FunctionComponent';
import { useState } from '../../src/core/hooks';
import type { Patch } from '../../src/diff/diff';
import { h } from '../../src/vdom/h';
import type { Props, VNode } from '../../src/vdom/types';

function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FunctionComponent', () => {
  describe('mount', () => {
    it('렌더 결과를 컨테이너의 첫 번째 자식으로 만든다', () => {
      const root = container();
      new FunctionComponent(() => h('div', { id: 'app' }, h('p', null, 'hi')), root).mount();
      expect(root.innerHTML).toBe('<div id="app"><p>hi</p></div>');
      expect(root.childNodes).toHaveLength(1);
    });

    it('컨테이너에 있던 기존 내용은 지운다', () => {
      const root = container();
      root.innerHTML = '<span>old</span><b>old</b>';
      new FunctionComponent(() => h('div', null, 'new'), root).mount();
      expect(root.innerHTML).toBe('<div>new</div>');
    });

    it('props를 렌더 함수에 전달한다', () => {
      const root = container();
      new FunctionComponent((props: Props) => h('p', null, `안녕 ${props.name}`), root, { name: '철수' }).mount();
      expect(root.textContent).toBe('안녕 철수');
    });

    it('루트가 텍스트 VNode여도 렌더한다', () => {
      const root = container();
      new FunctionComponent(() => ({ type: '#text' as const, text: 'just text' }), root).mount();
      expect(root.textContent).toBe('just text');
    });

    it('onPatch는 변경된 노드 목록도 함께 받는다', () => {
      let label = 'a';
      const calls: Node[][] = [];
      const root = container();
      const app = new FunctionComponent(() => h('p', null, label), root, {}, { onPatch: (_p, touched) => calls.push(touched) });
      app.mount();
      expect(calls[0]).toEqual([root.firstElementChild]);
      label = 'b';
      app.update();
      expect(calls[1]).toEqual([root.querySelector('p')!.firstChild]);
    });

    it('onPatch로 첫 렌더의 CREATE 패치를 받는다', () => {
      const received: Patch[][] = [];
      const root = container();
      new FunctionComponent(() => h('div'), root, {}, { onPatch: (p) => received.push(p) }).mount();
      expect(received).toHaveLength(1);
      expect(received[0]!.map((p) => p.type)).toEqual(['CREATE']);
    });
  });

  describe('update', () => {
    it('다시 렌더하면 diff/patch로 바뀐 부분만 반영한다', () => {
      let label = 'a';
      const root = container();
      const app = new FunctionComponent(
        () => h('div', null, h('h1', null, '제목'), h('p', null, label)),
        root,
      );
      app.mount();
      const h1 = root.querySelector('h1');
      const p = root.querySelector('p');
      label = 'b';
      const patches = app.update();
      expect(root.querySelector('p')!.textContent).toBe('b');
      expect(root.querySelector('h1')).toBe(h1);
      expect(root.querySelector('p')).toBe(p);
      expect(patches.map((x) => x.type)).toEqual(['TEXT']);
    });

    it('바뀐 게 없으면 빈 패치이고 onPatch를 호출하지 않는다', () => {
      const received: Patch[][] = [];
      const root = container();
      const app = new FunctionComponent(() => h('div', null, 'same'), root, {}, { onPatch: (p) => received.push(p) });
      app.mount();
      received.length = 0;
      expect(app.update()).toEqual([]);
      expect(received).toEqual([]);
    });

    it('setProps는 props를 바꾸고 바로 다시 렌더한다', () => {
      const root = container();
      const app = new FunctionComponent((props: Props) => h('p', null, String(props.n)), root, { n: 1 });
      app.mount();
      app.setProps({ n: 2 });
      expect(root.textContent).toBe('2');
    });

    it('루트 엘리먼트 type이 바뀌면 교체한다', () => {
      let tag = 'div';
      const root = container();
      const app = new FunctionComponent(() => h(tag, null, 'x'), root);
      app.mount();
      tag = 'section';
      app.update();
      expect(root.innerHTML).toBe('<section>x</section>');
    });

    it('mount 전에 update를 호출해도 첫 렌더로 동작한다', () => {
      const root = container();
      const app = new FunctionComponent(() => h('div', null, 'x'), root);
      app.update();
      expect(root.innerHTML).toBe('<div>x</div>');
    });
  });

  describe('자식 컴포넌트 (순수 함수)', () => {
    const Greeting = (props: Props): VNode => h('p', { class: 'greet' }, `Hi ${props.name}`);

    it('함수형 컴포넌트를 펼쳐서 렌더한다', () => {
      const root = container();
      new FunctionComponent(() => h('div', null, h(Greeting, { name: 'A' }), h(Greeting, { name: 'B' })), root).mount();
      expect(root.innerHTML).toBe('<div><p class="greet">Hi A</p><p class="greet">Hi B</p></div>');
    });

    it('children을 props.children으로 받는다', () => {
      const Box = (props: Props): VNode => h('section', null, props.children);
      const root = container();
      new FunctionComponent(() => h(Box, null, h('b', null, 'x'), 'y'), root).mount();
      expect(root.innerHTML).toBe('<section><b>x</b>y</section>');
    });

    it('컴포넌트 안의 컴포넌트도 펼친다', () => {
      const Inner = (props: Props): VNode => h('i', null, props.v);
      const Outer = (props: Props): VNode => h('div', null, h(Inner, { v: props.v }));
      const root = container();
      new FunctionComponent(() => h('main', null, h(Outer, { v: 'z' })), root).mount();
      expect(root.innerHTML).toBe('<main><div><i>z</i></div></main>');
    });

    it('컴포넌트가 텍스트 VNode를 반환해도 된다', () => {
      const Label = (): VNode => ({ type: '#text', text: 'lbl' });
      const root = container();
      new FunctionComponent(() => h('p', null, 'a', h(Label), 'b'), root).mount();
      expect(root.innerHTML).toBe('<p>albl' + 'b</p>');
    });

    it('컴포넌트에 붙인 key가 결과 루트의 key가 되어 재정렬 시 DOM 노드를 재사용한다', () => {
      const Item = (props: Props): VNode => h('li', null, props.text);
      let order = ['a', 'b', 'c'];
      const root = container();
      const app = new FunctionComponent(
        () => h('ul', null, order.map((k) => h(Item, { key: k, text: k }))),
        root,
      );
      app.mount();
      const [a, b, c] = Array.from(root.querySelectorAll('li'));
      order = ['c', 'a', 'b'];
      const patches = app.update();
      expect(Array.from(root.querySelectorAll('li'))).toEqual([c, a, b]);
      expect(Array.from(root.querySelectorAll('li')).map((n) => n.textContent)).toEqual(['c', 'a', 'b']);
      expect(patches.map((p) => p.type)).toEqual(['MOVE']);
      expect(root.querySelectorAll('li')[1]).toBe(a);
      expect(root.querySelectorAll('li')[2]).toBe(b);
    });

    it('자식의 props가 바뀌면 그 자식의 DOM만 patch된다', () => {
      let b = 'B1';
      const Row = (props: Props): VNode => h('li', null, props.text);
      const root = container();
      const app = new FunctionComponent(
        () => h('ul', null, h(Row, { key: 'a', text: 'A' }), h(Row, { key: 'b', text: b })),
        root,
      );
      app.mount();
      const [liA, liB] = Array.from(root.querySelectorAll('li'));
      b = 'B2';
      const patches = app.update();
      expect(patches).toEqual([{ type: 'TEXT', path: [1, 0], text: 'B2' }]);
      expect(root.querySelectorAll('li')[0]).toBe(liA);
      expect(root.querySelectorAll('li')[1]).toBe(liB);
    });

    it('자식 컴포넌트에서 훅을 호출하면 명확한 에러를 던진다', () => {
      const Bad = (): VNode => {
        useState(0);
        return h('div');
      };
      const root = container();
      const app = new FunctionComponent(() => h('main', null, h(Bad)), root);
      expect(() => app.mount()).toThrow(/루트 컴포넌트에서만/);
    });

    it('자식 컴포넌트는 props를 변형하지 않는다 (입력 불변)', () => {
      const props = Object.freeze({ name: 'A' });
      const root = container();
      const vnode = h(Greeting, props);
      expect(() => new FunctionComponent(() => h('div', null, vnode), root).mount()).not.toThrow();
    });
  });

  describe('렌더 컨텍스트', () => {
    it('컴포넌트 밖에서 훅을 호출하면 에러를 던진다', () => {
      expect(() => useState(0)).toThrow(/렌더 중에만/);
    });

    it('렌더 함수가 throw해도 컨텍스트가 복구된다 (이후 밖에서 호출하면 여전히 밖 에러)', () => {
      const root = container();
      const app = new FunctionComponent(() => {
        throw new Error('boom');
      }, root);
      expect(() => app.mount()).toThrow('boom');
      expect(() => useState(0)).toThrow(/렌더 중에만/);
    });

    it('자식 렌더가 throw해도 컨텍스트가 복구된다', () => {
      const Boom = (): VNode => {
        throw new Error('child boom');
      };
      const root = container();
      const app = new FunctionComponent(() => h('div', null, h(Boom)), root);
      expect(() => app.mount()).toThrow('child boom');
      expect(() => useState(0)).toThrow(/렌더 중에만/);
    });

    it('인스턴스마다 상태가 분리된다', () => {
      const Counter = () => {
        const [n, setN] = useState(0);
        return h('button', { onClick: () => setN((p: number) => p + 1) }, String(n));
      };
      const r1 = container();
      const r2 = container();
      new FunctionComponent(Counter, r1).mount();
      new FunctionComponent(Counter, r2).mount();
      r1.querySelector('button')!.click();
      return Promise.resolve().then(() => {
        expect(r1.textContent).toBe('1');
        expect(r2.textContent).toBe('0');
      });
    });
  });
});
