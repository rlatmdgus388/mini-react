import { diff } from '../../src/diff/diff';
import { createTextVNode, h } from '../../src/vdom/h';

describe('diff', () => {
  describe('변경 없음', () => {
    it('동일한 트리는 빈 패치를 반환한다', () => {
      const tree = () => h('div', { id: 'a' }, h('p', null, 'hi'), 'tail');
      expect(diff(tree(), tree())).toEqual([]);
    });

    it('같은 참조여도 빈 패치를 반환한다', () => {
      const tree = h('ul', null, h('li', null, 'a'));
      expect(diff(tree, tree)).toEqual([]);
    });

    it('둘 다 null이면 빈 패치를 반환한다', () => {
      expect(diff(null, null)).toEqual([]);
    });

    it('props 선언 순서가 달라도 동일하게 본다', () => {
      expect(diff(h('div', { a: '1', b: '2' }), h('div', { b: '2', a: '1' }))).toEqual([]);
    });
  });

  describe('CREATE', () => {
    it('old가 없으면 루트(path [])에 CREATE', () => {
      const next = h('div', null, 'x');
      expect(diff(null, next)).toEqual([{ type: 'CREATE', path: [], vnode: next }]);
    });

    it('자식이 늘어나면 새 자식 자리에 CREATE (path = 부모 경로 + 인덱스)', () => {
      const added = h('li', null, 'c');
      const patches = diff(
        h('ul', null, h('li', null, 'a'), h('li', null, 'b')),
        h('ul', null, h('li', null, 'a'), h('li', null, 'b'), added),
      );
      expect(patches).toEqual([{ type: 'CREATE', path: [2], vnode: added }]);
    });

    it('빈 부모에 첫 자식을 만든다', () => {
      const added = createTextVNode('x');
      expect(diff(h('div'), h('div', null, 'x'))).toEqual([{ type: 'CREATE', path: [0], vnode: added }]);
    });

    it('여러 자식이 늘어나면 인덱스 순서대로 CREATE', () => {
      const patches = diff(h('ul'), h('ul', null, h('li', null, 'a'), h('li', null, 'b')));
      expect(patches.map((p) => [p.type, p.path])).toEqual([
        ['CREATE', [0]],
        ['CREATE', [1]],
      ]);
    });
  });

  describe('REMOVE', () => {
    it('new가 없으면 루트(path [])를 REMOVE', () => {
      expect(diff(h('div'), null)).toEqual([{ type: 'REMOVE', path: [] }]);
    });

    it('자식이 줄어들면 사라진 자식을 REMOVE', () => {
      const patches = diff(
        h('ul', null, h('li', null, 'a'), h('li', null, 'b')),
        h('ul', null, h('li', null, 'a')),
      );
      expect(patches).toEqual([{ type: 'REMOVE', path: [1] }]);
    });

    it('여러 자식을 지울 때는 뒤 인덱스부터 내보낸다 (순서대로 적용해도 인덱스가 밀리지 않도록)', () => {
      const patches = diff(
        h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c')),
        h('ul', null, h('li', null, 'a')),
      );
      expect(patches).toEqual([
        { type: 'REMOVE', path: [2] },
        { type: 'REMOVE', path: [1] },
      ]);
    });
  });

  describe('REPLACE', () => {
    it('type이 다르면 통째로 REPLACE하고 자식은 비교하지 않는다', () => {
      const next = h('span', null, h('p', null, 'x'));
      const patches = diff(h('div', null, h('p', null, 'x')), next);
      expect(patches).toEqual([{ type: 'REPLACE', path: [], vnode: next }]);
    });

    it('중첩된 노드의 type이 다르면 그 경로만 REPLACE', () => {
      const next = h('h2', null, 'title');
      const patches = diff(
        h('div', null, h('p', null, 'keep'), h('h1', null, 'title')),
        h('div', null, h('p', null, 'keep'), next),
      );
      expect(patches).toEqual([{ type: 'REPLACE', path: [1], vnode: next }]);
    });

    it('텍스트 노드가 엘리먼트로 바뀌면 REPLACE', () => {
      const next = h('b', null, 'x');
      expect(diff(h('p', null, 'x'), h('p', null, next))).toEqual([
        { type: 'REPLACE', path: [0], vnode: next },
      ]);
    });

    it('엘리먼트가 텍스트 노드로 바뀌면 REPLACE', () => {
      const next = createTextVNode('x');
      expect(diff(h('p', null, h('b', null, 'x')), h('p', null, 'x'))).toEqual([
        { type: 'REPLACE', path: [0], vnode: next },
      ]);
    });

    it('함수 컴포넌트 type이 다르면 REPLACE', () => {
      const A = () => h('div');
      const B = () => h('div');
      const next = h(B);
      expect(diff(h(A), next)).toEqual([{ type: 'REPLACE', path: [], vnode: next }]);
    });
  });

  describe('TEXT', () => {
    it('텍스트 내용이 바뀌면 TEXT 패치', () => {
      expect(diff(h('p', null, 'old'), h('p', null, 'new'))).toEqual([
        { type: 'TEXT', path: [0], text: 'new' },
      ]);
    });

    it('루트가 텍스트 노드여도 동작한다', () => {
      expect(diff(createTextVNode('a'), createTextVNode('b'))).toEqual([
        { type: 'TEXT', path: [], text: 'b' },
      ]);
    });

    it('텍스트가 같으면 패치가 없다', () => {
      expect(diff(createTextVNode('a'), createTextVNode('a'))).toEqual([]);
    });
  });

  describe('PROPS', () => {
    it('값이 바뀐 속성은 set에 담긴다', () => {
      expect(diff(h('div', { id: 'a' }), h('div', { id: 'b' }))).toEqual([
        { type: 'PROPS', path: [], set: { id: 'b' }, remove: [] },
      ]);
    });

    it('추가된 속성은 set에 담긴다', () => {
      expect(diff(h('div'), h('div', { class: 'x' }))).toEqual([
        { type: 'PROPS', path: [], set: { class: 'x' }, remove: [] },
      ]);
    });

    it('사라진 속성은 remove에 담긴다', () => {
      expect(diff(h('div', { id: 'a', class: 'x' }), h('div', { id: 'a' }))).toEqual([
        { type: 'PROPS', path: [], set: {}, remove: ['class'] },
      ]);
    });

    it('추가·변경·삭제가 한 패치로 합쳐진다', () => {
      expect(
        diff(h('div', { a: '1', b: '2', c: '3' }), h('div', { a: '1', b: 'two', d: '4' })),
      ).toEqual([{ type: 'PROPS', path: [], set: { b: 'two', d: '4' }, remove: ['c'] }]);
    });

    it('변경이 없는 속성은 set에 포함하지 않는다', () => {
      const [patch] = diff(h('div', { a: '1', b: '2' }), h('div', { a: '1', b: '3' }));
      expect(patch).toEqual({ type: 'PROPS', path: [], set: { b: '3' }, remove: [] });
    });

    it('중첩 노드의 속성 변경은 그 경로를 가리킨다', () => {
      const patches = diff(
        h('div', null, h('ul', null, h('li', { class: 'a' }, 'x'))),
        h('div', null, h('ul', null, h('li', { class: 'b' }, 'x'))),
      );
      expect(patches).toEqual([{ type: 'PROPS', path: [0, 0], set: { class: 'b' }, remove: [] }]);
    });

    it('내용이 같은 style 객체는 변경으로 보지 않는다', () => {
      expect(
        diff(h('div', { style: { color: 'red' } }), h('div', { style: { color: 'red' } })),
      ).toEqual([]);
    });

    it('style 객체 내용이 바뀌면 PROPS', () => {
      const style = { color: 'blue' };
      expect(diff(h('div', { style: { color: 'red' } }), h('div', { style }))).toEqual([
        { type: 'PROPS', path: [], set: { style }, remove: [] },
      ]);
    });

    it('같은 핸들러 참조면 변경 없음, 다른 참조면 PROPS', () => {
      const onClick = () => {};
      const other = () => {};
      expect(diff(h('button', { onClick }), h('button', { onClick }))).toEqual([]);
      expect(diff(h('button', { onClick }), h('button', { onClick: other }))).toEqual([
        { type: 'PROPS', path: [], set: { onClick: other }, remove: [] },
      ]);
    });

    it('불리언 속성이 true에서 false로 바뀌면 set에 false가 담긴다', () => {
      expect(diff(h('button', { disabled: true }), h('button', { disabled: false }))).toEqual([
        { type: 'PROPS', path: [], set: { disabled: false }, remove: [] },
      ]);
    });
  });

  describe('조합', () => {
    it('한 노드의 PROPS가 자식 패치보다 먼저 나온다', () => {
      const patches = diff(
        h('p', { class: 'a' }, 'old'),
        h('p', { class: 'b' }, 'new'),
      );
      expect(patches.map((p) => p.type)).toEqual(['PROPS', 'TEXT']);
    });

    it('형제 자식의 변경이 각자의 경로로 나온다', () => {
      const patches = diff(
        h('div', null, h('p', null, 'a'), h('p', null, 'b')),
        h('div', null, h('p', null, 'A'), h('p', null, 'B')),
      );
      expect(patches).toEqual([
        { type: 'TEXT', path: [0, 0], text: 'A' },
        { type: 'TEXT', path: [1, 0], text: 'B' },
      ]);
    });

    it('공통 구간의 변경 뒤에 추가/삭제 패치가 온다', () => {
      const added = h('li', null, 'c');
      const patches = diff(
        h('ul', null, h('li', null, 'a')),
        h('ul', null, h('li', null, 'A'), h('li', null, 'b'), added),
      );
      expect(patches.map((p) => [p.type, p.path])).toEqual([
        ['TEXT', [0, 0]],
        ['CREATE', [1]],
        ['CREATE', [2]],
      ]);
    });
  });

  describe('중첩 위치와 복합 조합', () => {
    it('깊은 위치(path 2단계 이상)에서도 CREATE 경로가 정확하다', () => {
      const added = h('li', null, 'c');
      const patches = diff(
        h('div', null, h('p'), h('ul', null, h('li', null, 'a'), h('li', null, 'b'))),
        h('div', null, h('p'), h('ul', null, h('li', null, 'a'), h('li', null, 'b'), added)),
      );
      expect(patches).toEqual([{ type: 'CREATE', path: [1, 2], vnode: added }]);
    });

    it('깊은 위치에서 여러 자식을 지우면 그 부모 아래에서 뒤 인덱스부터 REMOVE', () => {
      const patches = diff(
        h('div', null, h('ul', null, h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c'))),
        h('div', null, h('ul', null, h('li', null, 'a'))),
      );
      expect(patches).toEqual([
        { type: 'REMOVE', path: [0, 2] },
        { type: 'REMOVE', path: [0, 1] },
      ]);
    });

    it('공통 구간의 TEXT/PROPS가 뒤쪽 REMOVE보다 먼저 나온다', () => {
      const patches = diff(
        h('ul', null, h('li', { class: 'a' }, 'x'), h('li', null, 'y'), h('li', null, 'z')),
        h('ul', null, h('li', { class: 'b' }, 'X')),
      );
      expect(patches).toEqual([
        { type: 'PROPS', path: [0], set: { class: 'b' }, remove: [] },
        { type: 'TEXT', path: [0, 0], text: 'X' },
        { type: 'REMOVE', path: [2] },
        { type: 'REMOVE', path: [1] },
      ]);
    });

    it('여러 부모에서 CREATE와 REMOVE가 섞여도 부모별로 경로가 독립적이다', () => {
      const added = h('i');
      const patches = diff(
        h('div', null, h('p', null, h('b'), h('b')), h('p')),
        h('div', null, h('p', null, h('b')), h('p', null, added)),
      );
      expect(patches).toEqual([
        { type: 'REMOVE', path: [0, 1] },
        { type: 'CREATE', path: [1, 0], vnode: added },
      ]);
    });

    it('REPLACE된 서브트리 안쪽은 더 이상 비교하지 않는다 (자식 패치가 없다)', () => {
      const next = h('section', null, h('p', null, 'changed'));
      const patches = diff(h('div', null, h('article', null, h('p', null, 'x'))), h('div', null, next));
      expect(patches).toEqual([{ type: 'REPLACE', path: [0], vnode: next }]);
    });
  });

  describe('props 값 비교 상세', () => {
    it('배열 props는 내용으로 비교한다', () => {
      expect(diff(h('div', { data: [1, 2] }), h('div', { data: [1, 2] }))).toEqual([]);
      const data = [1, 3];
      expect(diff(h('div', { data: [1, 2] }), h('div', { data }))).toEqual([
        { type: 'PROPS', path: [], set: { data }, remove: [] },
      ]);
      const longer = [1, 2, 3];
      expect(diff(h('div', { data: [1, 2] }), h('div', { data: longer }))).toEqual([
        { type: 'PROPS', path: [], set: { data: longer }, remove: [] },
      ]);
    });

    it('중첩 객체 props는 깊게 비교한다', () => {
      const same = () => ({ a: { b: { c: 1 } } });
      expect(diff(h('div', { cfg: same() }), h('div', { cfg: same() }))).toEqual([]);
      const changed = { a: { b: { c: 2 } } };
      expect(diff(h('div', { cfg: same() }), h('div', { cfg: changed }))).toEqual([
        { type: 'PROPS', path: [], set: { cfg: changed }, remove: [] },
      ]);
    });

    it('객체의 키 개수가 다르면 변경으로 본다', () => {
      const next = { color: 'red', margin: '0' };
      expect(diff(h('div', { style: { color: 'red' } }), h('div', { style: next }))).toEqual([
        { type: 'PROPS', path: [], set: { style: next }, remove: [] },
      ]);
    });

    it('undefined 값 prop은 "있는 속성"으로 취급해 사라지면 remove에 담긴다', () => {
      expect(diff(h('div', { id: undefined }), h('div'))).toEqual([
        { type: 'PROPS', path: [], set: {}, remove: ['id'] },
      ]);
      expect(diff(h('div'), h('div', { id: undefined }))).toEqual([
        { type: 'PROPS', path: [], set: { id: undefined }, remove: [] },
      ]);
    });

    it('일반 객체가 아닌 객체(Date)는 참조로 비교한다', () => {
      const d1 = new Date(0);
      const d2 = new Date(0);
      expect(diff(h('div', { at: d1 }), h('div', { at: d1 }))).toEqual([]);
      expect(diff(h('div', { at: d1 }), h('div', { at: d2 }))).toEqual([
        { type: 'PROPS', path: [], set: { at: d2 }, remove: [] },
      ]);
    });

    it('일반 객체가 다른 타입으로 바뀌면 변경으로 본다', () => {
      expect(diff(h('div', { v: { a: 1 } }), h('div', { v: 'x' }))).toEqual([
        { type: 'PROPS', path: [], set: { v: 'x' }, remove: [] },
      ]);
      expect(diff(h('div', { v: [] }), h('div', { v: {} }))).toEqual([
        { type: 'PROPS', path: [], set: { v: {} }, remove: [] },
      ]);
    });
  });

  describe('순수성', () => {
    it('입력 트리를 변형하지 않는다 (deep freeze 상태에서도 동작)', () => {
      const deepFreeze = <T>(o: T): T => {
        if (o && typeof o === 'object') {
          Object.values(o).forEach(deepFreeze);
          Object.freeze(o);
        }
        return o;
      };
      const a = deepFreeze(h('div', { id: 'a', style: { color: 'red' } }, h('p', null, 'x'), 'tail'));
      const b = deepFreeze(h('div', { id: 'b' }, h('p', null, 'y')));
      const snapshot = JSON.stringify([a, b]);
      expect(() => diff(a, b)).not.toThrow();
      expect(JSON.stringify([a, b])).toBe(snapshot);
    });

    it('DOM(document/window)에 접근하지 않는다', () => {
      const trap = new Proxy({}, {
        get() {
          throw new Error('diff는 DOM에 접근하면 안 됩니다.');
        },
      });
      vi.stubGlobal('document', trap);
      vi.stubGlobal('window', trap);
      try {
        expect(() =>
          diff(
            h('div', { id: 'a' }, h('p', null, 'x'), h('i')),
            h('div', { id: 'b' }, h('span', null, 'y')),
          ),
        ).not.toThrow();
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
