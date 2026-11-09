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

export type Patch = CreatePatch | RemovePatch | ReplacePatch | TextPatch | PropsPatch;

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

function diffChildren(path: Path, oldChildren: VNode[], newChildren: VNode[], patches: Patch[]): void {
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
