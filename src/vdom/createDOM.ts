import { isTextVNode } from './h';
import { setProp } from './props';
import type { VNode } from './types';

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const HTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * VNode → 실제 DOM 노드.
 * @param parentNs 부모의 네임스페이스. patch에서 새 노드를 만들 때 SVG 문맥을 이어받기 위해 쓴다.
 */
export function createDOM(vnode: VNode, parentNs: string = HTML_NS): Node {
  if (isTextVNode(vnode)) return document.createTextNode(vnode.text);

  if (typeof vnode.type === 'function') {
    throw new Error('createDOM: 함수형 컴포넌트는 resolve(렌더) 후의 VNode만 전달할 수 있습니다.');
  }

  const tag = vnode.type;
  const ns = tag === 'svg' ? SVG_NS : parentNs;
  const el = document.createElementNS(ns, tag);

  // type은 value/checked 해석에 영향을 주므로 먼저 적용한다.
  if ('type' in vnode.props) setProp(el, 'type', vnode.props.type);
  for (const [name, value] of Object.entries(vnode.props)) {
    if (name !== 'type') setProp(el, name, value);
  }

  const childNs = tag === 'foreignObject' ? HTML_NS : ns;
  for (const child of vnode.children) el.appendChild(createDOM(child, childNs));

  // select의 value는 일치하는 option이 이미 있어야 반영되므로 자식을 붙인 뒤 다시 적용한다.
  if (el instanceof HTMLSelectElement && 'value' in vnode.props) setProp(el, 'value', vnode.props.value);
  return el;
}
