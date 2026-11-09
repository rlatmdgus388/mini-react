import { HTML_NS, createDOM } from '../vdom/createDOM';
import { removeProp, setProp } from '../vdom/props';
import type { Patch, Path } from './diff';

/** path를 따라 내려가 DOM 노드를 찾는다. 루트([])는 container의 첫 번째 자식이다. */
function resolve(container: Element, path: Path): Node {
  let node: Node | undefined = container.childNodes[0];
  if (!node) throw new Error('patch: 컨테이너에 루트 노드가 없습니다.');
  for (const index of path) {
    node = node.childNodes[index];
    if (!node) throw new Error(`patch: 존재하지 않는 경로입니다: [${path.join(', ')}]`);
  }
  return node;
}

/** 부모 노드와 삽입 인덱스. path가 []이면 container의 루트 자리다. */
function resolveSlot(container: Element, path: Path): { parent: Node; index: number } {
  if (path.length === 0) return { parent: container, index: 0 };
  return { parent: resolve(container, path.slice(0, -1)), index: path[path.length - 1]! };
}

/** 새 노드를 만들 때 부모의 네임스페이스를 이어받는다 (foreignObject 안은 HTML로 돌아간다). */
function childNamespace(parent: Node): string {
  if (!(parent instanceof Element)) return HTML_NS;
  if (parent.localName === 'foreignObject') return HTML_NS;
  return parent.namespaceURI ?? HTML_NS;
}

function applyProps(el: Element, set: Record<string, unknown>, remove: string[], deferredSelects: [HTMLSelectElement, unknown][]): void {
  for (const name of remove) removeProp(el, name);
  // type은 value/checked 해석에 영향을 주므로 먼저 적용한다.
  if ('type' in set) setProp(el, 'type', set.type);
  for (const [name, value] of Object.entries(set)) {
    if (name === 'type') continue;
    // select의 value는 일치하는 option이 있어야 반영된다. 자식 패치가 끝난 뒤로 미룬다.
    if (name === 'value' && el instanceof HTMLSelectElement) {
      deferredSelects.push([el, value]);
      continue;
    }
    setProp(el, name, value);
  }
}

/**
 * 패치 목록을 실제 DOM에 적용한다. diff가 돌려준 순서대로 적용하면 된다.
 * @param container 루트 VNode에 대응하는 DOM을 첫 번째 자식으로 가진 엘리먼트 (루트가 없으면 비어 있어도 된다)
 */
export function patch(container: Element, patches: readonly Patch[]): void {
  const deferredSelects: [HTMLSelectElement, unknown][] = [];

  for (const p of patches) {
    switch (p.type) {
      case 'CREATE': {
        const { parent, index } = resolveSlot(container, p.path);
        const node = createDOM(p.vnode, childNamespace(parent));
        parent.insertBefore(node, parent.childNodes[index] ?? null);
        break;
      }
      case 'REMOVE': {
        const node = resolve(container, p.path);
        node.parentNode!.removeChild(node);
        break;
      }
      case 'REPLACE': {
        const node = resolve(container, p.path);
        const parent = node.parentNode!;
        parent.replaceChild(createDOM(p.vnode, childNamespace(parent)), node);
        break;
      }
      case 'TEXT': {
        const node = resolve(container, p.path);
        if (node.nodeType !== Node.TEXT_NODE) {
          throw new Error(`patch: TEXT 패치 대상이 텍스트 노드가 아닙니다: [${p.path.join(', ')}]`);
        }
        (node as Text).data = p.text;
        break;
      }
      case 'PROPS': {
        const node = resolve(container, p.path);
        if (!(node instanceof Element)) {
          throw new Error(`patch: PROPS 패치 대상이 엘리먼트가 아닙니다: [${p.path.join(', ')}]`);
        }
        applyProps(node, p.set, p.remove, deferredSelects);
        break;
      }
    }
  }

  for (const [select, value] of deferredSelects) setProp(select, 'value', value);
}
