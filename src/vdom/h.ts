import { TEXT } from './types';
import type { Child, ElementVNode, FunctionalComponent, Key, Props, TextVNode, VNode } from './types';

export function createTextVNode(text: string): TextVNode {
  return { type: TEXT, text };
}

export function isTextVNode(v: VNode): v is TextVNode {
  return v.type === TEXT;
}

export function isElementVNode(v: VNode): v is ElementVNode {
  return v.type !== TEXT;
}

function isVNode(x: unknown): x is VNode {
  return typeof x === 'object' && x !== null && 'type' in x && ('text' in x || 'children' in x);
}

/** children 정규화: flatten, null/boolean/'' 제거, 숫자→텍스트, 인접 텍스트 병합 */
export function normalizeChildren(input: Child[], out: VNode[] = []): VNode[] {
  for (const child of input) {
    if (child === null || child === undefined || typeof child === 'boolean') continue;
    if (Array.isArray(child)) {
      normalizeChildren(child, out);
      continue;
    }
    if (typeof child === 'string' || typeof child === 'number' || (isVNode(child) && isTextVNode(child))) {
      const text = typeof child === 'object' ? (child as TextVNode).text : String(child);
      if (text === '') continue;
      const last = out[out.length - 1];
      if (last && isTextVNode(last)) {
        // 인접 텍스트 병합 (DOM 왕복 시 텍스트 노드 개수가 달라지는 문제 방지)
        out[out.length - 1] = createTextVNode(last.text + text);
      } else {
        out.push(createTextVNode(text));
      }
      continue;
    }
    if (isVNode(child)) {
      out.push(child);
      continue;
    }
    throw new TypeError(`h(): 지원하지 않는 child 타입입니다: ${Object.prototype.toString.call(child)}`);
  }
  return out;
}

export function h(
  type: string | FunctionalComponent,
  props?: Props | null,
  ...children: Child[]
): ElementVNode {
  if (type === '') throw new Error('h(): type은 비어 있을 수 없습니다.');
  let key: Key | null = null;
  let rest: Props = {};
  if (props) {
    const { key: k, ...others } = props;
    if (k !== undefined && k !== null) key = k as Key;
    rest = others;
  }
  return { type, props: rest, children: normalizeChildren(children), key };
}
