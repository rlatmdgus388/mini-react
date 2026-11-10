import { isTextVNode } from '../vdom/h';
import type { ElementVNode, Props, TextVNode, VNode } from '../vdom/types';

/** 루트에서 시작해 자식 인덱스를 따라 내려가는 경로. 루트는 []. */
export type Path = number[];

export interface CreatePatch {
  type: 'CREATE';
  /** 새 노드가 들어갈 자리 (부모 경로 + 삽입 인덱스) */
  path: Path;
  vnode: VNode;
}

export interface RemovePatch {
  type: 'REMOVE';
  path: Path;
}

export interface ReplacePatch {
  type: 'REPLACE';
  path: Path;
  vnode: VNode;
}

export interface TextPatch {
  type: 'TEXT';
  path: Path;
  text: string;
}

export interface PropsPatch {
  type: 'PROPS';
  path: Path;
  /** 추가되었거나 값이 바뀐 속성 (새 값) */
  set: Props;
  /** 사라진 속성 이름 */
  remove: string[];
}

export interface MovePatch {
  type: 'MOVE';
  /** 이동할 노드의 현재 경로 (이 패치를 적용하기 직전 기준) */
  path: Path;
  /** 노드를 형제 목록에서 뺀 뒤, 그 목록의 몇 번째 자리에 다시 넣을지 */
  to: number;
}

export type Patch = CreatePatch | RemovePatch | ReplacePatch | TextPatch | PropsPatch | MovePatch;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * props 값 비교. style처럼 렌더마다 새로 만들어지는 일반 객체는 내용으로 비교하고,
 * 함수(이벤트 핸들러)는 참조로 비교한다.
 */
function propEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => propEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    if (aKeys.length !== Object.keys(b).length) return false;
    return aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && propEqual(a[k], b[k]));
  }
  return false;
}

function diffProps(path: Path, oldProps: Props, newProps: Props): PropsPatch | null {
  const set: Props = {};
  const remove: string[] = [];
  for (const [name, value] of Object.entries(newProps)) {
    if (!Object.prototype.hasOwnProperty.call(oldProps, name) || !propEqual(oldProps[name], value)) {
      set[name] = value;
    }
  }
  for (const name of Object.keys(oldProps)) {
    if (!Object.prototype.hasOwnProperty.call(newProps, name)) remove.push(name);
  }
  if (remove.length === 0 && Object.keys(set).length === 0) return null;
  return { type: 'PROPS', path, set, remove };
}

function hasKey(v: VNode): boolean {
  return !isTextVNode(v) && v.key !== null;
}

/**
 * 형제 사이에서 "같은 노드"를 가리키는 식별자.
 * key가 있으면 key로, 없으면 자리(인덱스)로 식별한다. 접두어로 둘이 섞이지 않게 한다.
 * key는 문자열로 바꿔 비교하므로 1과 '1'은 같은 key다.
 */
function childId(v: VNode, index: number): string {
  return !isTextVNode(v) && v.key !== null ? `k:${String(v.key)}` : `i:${index}`;
}

/** seq의 최장 증가 부분수열에 속한 "값"들의 집합. 이 값들은 이동하지 않고 제자리에 둔다. */
function longestIncreasingSubsequence(seq: number[]): Set<number> {
  const tails: number[] = []; // tails[k] = 길이 k+1인 증가 부분수열의 끝 원소가 있는 seq 인덱스
  const prev: number[] = new Array<number>(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]!]! < seq[i]!) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1]!;
    tails[lo] = i;
  }
  const result = new Set<number>();
  let k = tails.length > 0 ? tails[tails.length - 1]! : -1;
  while (k >= 0) {
    result.add(seq[k]!);
    k = prev[k]!;
  }
  return result;
}

/**
 * key 기반 자식 비교. 패치는 다음 순서로 낸다.
 * 1) 짝지어진 자식의 내부 변경 (경로는 아직 아무것도 움직이기 전이므로 old 인덱스)
 * 2) 짝이 없는 old 자식 REMOVE (뒤 인덱스부터)
 * 3) new 순서대로 훑으며 MOVE / CREATE. 최장 증가 부분수열에 속한 노드는 제자리에 두고,
 *    나머지는 "new 기준 바로 앞 형제" 뒤로 옮긴다.
 */
function diffKeyedChildren(path: Path, oldChildren: VNode[], newChildren: VNode[], patches: Patch[]): void {
  const oldIndexById = new Map<string, number>();
  oldChildren.forEach((child, i) => {
    const id = childId(child, i);
    if (!oldIndexById.has(id)) oldIndexById.set(id, i); // key 중복이면 첫 번째만 짝이 된다
  });

  const used = new Set<number>();
  const matched = newChildren.map((child, j) => {
    const oldIndex = oldIndexById.get(childId(child, j));
    if (oldIndex === undefined || used.has(oldIndex)) return -1;
    used.add(oldIndex);
    return oldIndex;
  });

  matched.forEach((oldIndex, j) => {
    if (oldIndex >= 0) diffNode([...path, oldIndex], oldChildren[oldIndex]!, newChildren[j]!, patches);
  });

  for (let i = oldChildren.length - 1; i >= 0; i--) {
    if (!used.has(i)) patches.push({ type: 'REMOVE', path: [...path, i] });
  }

  // 지금부터 current는 "패치를 순서대로 적용했을 때의 형제 목록"을 흉내 낸다.
  // 원소는 old 인덱스, 새로 만드는 노드는 oldChildren.length + j.
  const current = oldChildren.map((_, i) => i).filter((i) => used.has(i));
  const stable = longestIncreasingSubsequence(matched.filter((i) => i >= 0));
  const ids = matched.map((oldIndex, j) => (oldIndex >= 0 ? oldIndex : oldChildren.length + j));

  newChildren.forEach((child, j) => {
    const id = ids[j]!;
    const isNew = matched[j]! < 0;
    if (!isNew && stable.has(id)) return;

    const from = isNew ? -1 : current.indexOf(id);
    if (!isNew) current.splice(from, 1);
    const at = j === 0 ? 0 : current.indexOf(ids[j - 1]!) + 1;
    current.splice(at, 0, id);

    if (isNew) patches.push({ type: 'CREATE', path: [...path, at], vnode: child });
    else if (from !== at) patches.push({ type: 'MOVE', path: [...path, from], to: at });
  });
}

function diffChildren(path: Path, oldChildren: VNode[], newChildren: VNode[], patches: Patch[]): void {
  if (oldChildren.some(hasKey) || newChildren.some(hasKey)) {
    diffKeyedChildren(path, oldChildren, newChildren, patches);
    return;
  }
  const common = Math.min(oldChildren.length, newChildren.length);
  for (let i = 0; i < common; i++) {
    diffNode([...path, i], oldChildren[i]!, newChildren[i]!, patches);
  }
  for (let i = common; i < newChildren.length; i++) {
    patches.push({ type: 'CREATE', path: [...path, i], vnode: newChildren[i]! });
  }
  // 순서대로 적용해도 앞 인덱스가 밀리지 않도록 뒤에서부터 지운다.
  for (let i = oldChildren.length - 1; i >= common; i--) {
    patches.push({ type: 'REMOVE', path: [...path, i] });
  }
}

function diffNode(path: Path, oldV: VNode, newV: VNode, patches: Patch[]): void {
  if (oldV === newV) return;

  if (oldV.type !== newV.type) {
    patches.push({ type: 'REPLACE', path, vnode: newV });
    return;
  }

  if (isTextVNode(oldV)) {
    const text = (newV as TextVNode).text;
    if (oldV.text !== text) patches.push({ type: 'TEXT', path, text });
    return;
  }

  const oldEl: ElementVNode = oldV;
  const newEl = newV as ElementVNode;
  const propsPatch = diffProps(path, oldEl.props, newEl.props);
  if (propsPatch) patches.push(propsPatch);
  diffChildren(path, oldEl.children, newEl.children, patches);
}

/**
 * 두 VNode 트리의 차이를 Patch 목록으로 계산한다. DOM에 의존하지 않는 순수 함수이며 입력을 변형하지 않는다.
 * 패치는 반환된 순서대로 적용하면 올바른 결과가 되도록 정렬되어 있다.
 */
export function diff(oldV: VNode | null, newV: VNode | null): Patch[] {
  const patches: Patch[] = [];
  if (oldV === null && newV === null) return patches;
  if (oldV === null) return [{ type: 'CREATE', path: [], vnode: newV! }];
  if (newV === null) return [{ type: 'REMOVE', path: [] }];
  diffNode([], oldV, newV, patches);
  return patches;
}
