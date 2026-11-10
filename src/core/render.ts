import { isTextVNode, normalizeChildren } from '../vdom/h';
import type { VNode } from '../vdom/types';
import { withChildRender } from './context';

/**
 * 함수형 컴포넌트(type이 함수인 VNode)를 실제 VNode 트리로 펼친다.
 * diff/createDOM은 태그 이름(string) type만 다루므로 비교 전에 반드시 펼쳐야 한다.
 */
export function resolveTree(vnode: VNode): VNode {
  if (isTextVNode(vnode)) return vnode;

  if (typeof vnode.type === 'function') {
    const Component = vnode.type;
    const rendered = withChildRender(() => Component({ ...vnode.props, children: vnode.children }));
    const resolved = resolveTree(rendered);
    // 컴포넌트에 붙인 key가 사라지면 리스트 재정렬 때 노드를 재사용할 수 없으므로 결과 루트로 옮긴다.
    if (!isTextVNode(resolved) && resolved.key === null && vnode.key !== null) {
      return { ...resolved, key: vnode.key };
    }
    return resolved;
  }

  // 컴포넌트가 텍스트를 반환하면 인접 텍스트가 생길 수 있으므로 다시 정규화한다.
  return { ...vnode, children: normalizeChildren(vnode.children.map(resolveTree)) };
}
