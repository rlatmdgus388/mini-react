import { diff } from '../../src/diff/diff';
import { patch } from '../../src/diff/patch';
import { createDOM } from '../../src/vdom/createDOM';
import { fromDOMChildren } from '../../src/vdom/fromDOM';
import { h } from '../../src/vdom/h';
import type { ElementVNode, Props, VNode } from '../../src/vdom/types';

type Rng = () => number;

/** 시드로 재현 가능한 난수 생성기 (mulberry32). */
function createRng(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
const TAGS = ['div', 'p', 'span', 'ul', 'li', 'b'] as const;
const TEXTS = ['x', 'y', 'z', 'hello'] as const;
const KEY_POOL = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5'] as const;

function randomProps(rng: Rng): Props {
  const props: Props = {};
  for (const name of ['class', 'id', 'title', 'data-x']) {
    if (rng() < 0.3) props[name] = pick(rng, ['a', 'b', 'c']);
  }
  if (rng() < 0.15) props.style = { color: pick(rng, ['red', 'blue']) };
  return props;
}

function withKey(props: Props, key: string | number | null): Props {
  return key === null ? props : { ...props, key };
}

function randomTree(rng: Rng, depth: number, key: string | null = null): ElementVNode {
  const count = depth <= 0 ? 0 : Math.floor(rng() * 5);
  const keyed = rng() < 0.5; // 이 부모의 자식 엘리먼트에 key를 붙일지
  const children: VNode[] = [];
  for (let i = 0; i < count; i++) {
    if (rng() < 0.25) {
      children.push({ type: '#text', text: pick(rng, TEXTS) });
    } else {
      // key는 일부러 중복도 허용한다. (중복 key에서도 결과가 맞아야 한다)
      children.push(randomTree(rng, depth - 1, keyed ? pick(rng, KEY_POOL) : null));
    }
  }
  return h(pick(rng, TAGS), withKey(randomProps(rng), key), ...children);
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** 기존 트리를 조금씩 바꿔 "비슷하지만 다른" 새 트리를 만든다. */
function mutate(rng: Rng, node: VNode, depth: number): VNode {
  if (node.type === '#text') {
    return rng() < 0.2 ? { type: '#text', text: pick(rng, TEXTS) } : node;
  }
  const el = node as ElementVNode;
  const type = typeof el.type === 'string' && rng() < 0.05 ? pick(rng, TAGS) : el.type;

  let props: Props = { ...el.props };
  if (rng() < 0.3) props = { ...props, ...randomProps(rng) };
  if (rng() < 0.15) delete props[pick(rng, ['class', 'id', 'title', 'data-x', 'style'])];

  let children = el.children.map((c) => (rng() < 0.7 ? mutate(rng, c, depth - 1) : c));
  if (rng() < 0.3) children = shuffle(rng, children);
  if (children.length > 0 && rng() < 0.3) children.splice(Math.floor(rng() * children.length), 1);
  if (rng() < 0.3) {
    const added = randomTree(rng, Math.max(depth - 1, 0), rng() < 0.5 ? pick(rng, KEY_POOL) : null);
    children.splice(Math.floor(rng() * (children.length + 1)), 0, added);
  }
  return h(type, withKey(props, el.key), ...children);
}

function render(vnode: VNode): HTMLElement {
  const container = document.createElement('div');
  container.appendChild(createDOM(vnode));
  document.body.appendChild(container);
  return container;
}

/** attribute 선언 순서는 의미가 없으므로, innerHTML 문자열이 아니라 구조(fromDOM)로 비교한다. */
function expectSameDOM(actual: HTMLElement, target: VNode, message: string): void {
  expect(fromDOMChildren(actual), message).toEqual(fromDOMChildren(render(target)));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('fuzz: diff → patch', () => {
  it('변형된 트리 쌍: patch 결과가 새 트리를 렌더한 것과 같다', () => {
    for (let seed = 1; seed <= 600; seed++) {
      const rng = createRng(seed);
      const oldTree = randomTree(rng, 3);
      const newTree = mutate(rng, oldTree, 3);

      const container = render(oldTree);
      patch(container, diff(oldTree, newTree));

      expectSameDOM(container, newTree, `seed=${seed}`);
      document.body.innerHTML = '';
    }
  });

  it('서로 무관한 랜덤 트리 쌍에서도 patch 결과가 새 트리와 같다', () => {
    for (let seed = 1001; seed <= 1400; seed++) {
      const rng = createRng(seed);
      const oldTree = randomTree(rng, 3);
      const newTree = randomTree(rng, 3);

      const container = render(oldTree);
      patch(container, diff(oldTree, newTree));

      expectSameDOM(container, newTree, `seed=${seed}`);
      document.body.innerHTML = '';
    }
  });

  it('패치를 적용한 뒤 같은 트리와 다시 diff하면 빈 패치다 (멱등)', () => {
    for (let seed = 2001; seed <= 2200; seed++) {
      const rng = createRng(seed);
      const oldTree = randomTree(rng, 3);
      const newTree = mutate(rng, oldTree, 3);
      expect(diff(newTree, newTree), `seed=${seed}`).toEqual([]);
      const container = render(oldTree);
      patch(container, diff(oldTree, newTree));
      expectSameDOM(container, newTree, `seed=${seed}`);
      document.body.innerHTML = '';
    }
  });

  it('여러 단계를 연속으로 patch해도 매 단계 결과가 맞다 (상태 누적 검증)', () => {
    for (let seed = 3001; seed <= 3150; seed++) {
      const rng = createRng(seed);
      let current = randomTree(rng, 3);
      const container = render(current);
      for (let step = 0; step < 5; step++) {
        const next = mutate(rng, current, 3);
        patch(container, diff(current, next));
        expectSameDOM(container, next, `seed=${seed} step=${step}`);
        current = next as ElementVNode;
      }
      document.body.innerHTML = '';
    }
  });

  it('key가 유일한 목록: 양쪽에 있는 key의 DOM 노드는 항상 같은 객체로 유지된다', () => {
    for (let seed = 4001; seed <= 4300; seed++) {
      const rng = createRng(seed);
      const item = (k: number) => h('li', { key: k }, pick(rng, TEXTS));
      const size = Math.floor(rng() * 9);
      const oldKeys = shuffle(rng, Array.from({ length: 10 }, (_, i) => i)).slice(0, size);
      const newKeys = shuffle(rng, Array.from({ length: 10 }, (_, i) => i)).slice(0, Math.floor(rng() * 9));
      const oldTree = h('ul', null, ...oldKeys.map(item));
      const newTree = h('ul', null, ...newKeys.map(item));

      const container = render(oldTree);
      const before = new Map<number, Element>();
      const lis = Array.from(container.querySelectorAll('li'));
      oldKeys.forEach((k, i) => before.set(k, lis[i]!));

      patch(container, diff(oldTree, newTree));
      const after = Array.from(container.querySelectorAll('li'));

      expect(after.length, `seed=${seed}`).toBe(newKeys.length);
      newKeys.forEach((k, i) => {
        if (before.has(k)) expect(after[i], `seed=${seed} key=${k}`).toBe(before.get(k));
      });
      expectSameDOM(container, newTree, `seed=${seed}`);
      document.body.innerHTML = '';
    }
  });

  it('key가 유일한 목록: MOVE 개수가 최소다 (n - 최장 증가 부분수열 길이)', () => {
    const lisLength = (seq: number[]): number => {
      const tails: number[] = [];
      for (const v of seq) {
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (tails[mid]! < v) lo = mid + 1;
          else hi = mid;
        }
        tails[lo] = v;
      }
      return tails.length;
    };
    for (let seed = 5001; seed <= 5300; seed++) {
      const rng = createRng(seed);
      const size = 1 + Math.floor(rng() * 9);
      const oldKeys = Array.from({ length: size }, (_, i) => i);
      const newKeys = shuffle(rng, oldKeys);
      const patches = diff(
        h('ul', null, ...oldKeys.map((k) => h('li', { key: k }, String(k)))),
        h('ul', null, ...newKeys.map((k) => h('li', { key: k }, String(k)))),
      );
      const moves = patches.filter((p) => p.type === 'MOVE').length;
      expect(moves, `seed=${seed} new=${newKeys.join(',')}`).toBe(size - lisLength(newKeys));
      expect(patches.length, `seed=${seed}`).toBe(moves);
    }
  });
});
