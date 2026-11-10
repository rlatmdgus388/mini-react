import { createTextVNode, normalizeChildren } from './h';
import { ATTRIBUTE_VALUE_INPUT_TYPES, BOOLEAN_ATTRS, isEventProp } from './props';
import type { ElementVNode, Props, VNode } from './types';

function textToVNode(node: Text): VNode | null {
  const data = node.data;
  if (data === '') return null;
  // 들여쓰기/줄바꿈만 있는 공백은 포맷팅 잡음이므로 버린다. <pre> 안에서는 의미가 있으므로 보존.
  if (/^\s*$/.test(data) && data.includes('\n') && !node.parentElement?.closest('pre')) return null;
  return createTextVNode(data);
}

/** DOM 노드 하나를 VNode로 변환한다. 대상이 아닌 노드(주석, script 등)는 null. */
export function fromDOM(node: Node): VNode | null {
  if (node.nodeType === Node.TEXT_NODE) return textToVNode(node as Text);
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const el = node as Element;
  const type = el.localName;
  if (type === 'script') return null;

  const props: Props = {};
  for (const attr of Array.from(el.attributes)) {
    if (isEventProp(attr.name)) continue;
    props[attr.name] = BOOLEAN_ATTRS.has(attr.name) ? true : attr.value;
  }

  // 사용자가 입력한 "현재" 상태는 attribute가 아니라 property에 있다.
  if (el instanceof HTMLInputElement) {
    if (!ATTRIBUTE_VALUE_INPUT_TYPES.has(el.type)) props.value = el.value;
    if (el.type === 'checkbox' || el.type === 'radio') props.checked = el.checked;
  } else if (el instanceof HTMLTextAreaElement) {
    props.value = el.value;
  } else if (el instanceof HTMLSelectElement && !el.multiple) {
    // 선택 상태는 option의 selected attribute가 아니라 select.value(property)에 있다. 다중 선택은 지원하지 않는다.
    props.value = el.value;
  }

  const children = el instanceof HTMLTextAreaElement ? [] : fromDOMChildren(el);
  const vnode: ElementVNode = { type, props, children, key: null };
  return vnode;
}

/** 컨테이너 자신은 제외하고 자식들만 VNode 배열로 변환한다. */
export function fromDOMChildren(parent: Node): VNode[] {
  const out: VNode[] = [];
  parent.childNodes.forEach((child) => {
    const v = fromDOM(child);
    if (v) out.push(v);
  });
  return normalizeChildren(out);
}
