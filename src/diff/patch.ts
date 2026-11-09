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

function parentOf(node: Node): Node {
  if (!node.parentNode) throw new Error('patch: 대상 노드가 DOM에서 분리되어 있습니다.');
  return node.parentNode;
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
 * @returns 변경이 일어난 노드들 (중복 없음, 시각화용).
 *   CREATE/REPLACE/MOVE는 새로 들어오거나 옮겨진 노드, TEXT는 텍스트 노드, PROPS는 요소,
 *   REMOVE는 자식이 사라진 부모 요소다(루트를 지운 경우는 컨테이너를 포함하지 않는다).
 *   이후 패치로 DOM에서 떨어진 노드가 섞일 수 있으니 쓰기 전에 연결 여부를 확인한다.
 */
export function patch(container: Element, patches: readonly Patch[]): Node[] {
  const deferredSelects: [HTMLSelectElement, unknown][] = [];
  const touched = new Set<Node>();

  for (const p of patches) {
    switch (p.type) {
      case 'CREATE': {
        const { parent, index } = resolveSlot(container, p.path);
        const node = createDOM(p.vnode, childNamespace(parent));
        parent.insertBefore(node, parent.childNodes[index] ?? null);
        touched.add(node);
        break;
      }
      case 'REMOVE': {
        const node = resolve(container, p.path);
        const parent = parentOf(node);
        parent.removeChild(node);
        if (parent !== container) touched.add(parent);
        break;
      }
      case 'MOVE': {
        if (p.path.length === 0) throw new Error('patch: 루트 노드는 MOVE할 수 없습니다.');
        const node = resolve(container, p.path);
        const parent = parentOf(node);
        // 노드를 형제 목록에서 뺀 목록 기준으로 to번째 자리 앞에 끼운다. insertBefore는 노드를 옮기므로 DOM 노드는 재사용된다.
        const siblings = Array.from(parent.childNodes).filter((n) => n !== node);
        parent.insertBefore(node, siblings[p.to] ?? null);
        touched.add(node);
        break;
      }
      case 'REPLACE': {
        const node = resolve(container, p.path);
        const parent = parentOf(node);
        const replacement = createDOM(p.vnode, childNamespace(parent));
        parent.replaceChild(replacement, node);
        touched.add(replacement);
        break;
      }
      case 'TEXT': {
        const node = resolve(container, p.path);
        if (node.nodeType !== Node.TEXT_NODE) {
          throw new Error(`patch: TEXT 패치 대상이 텍스트 노드가 아닙니다: [${p.path.join(', ')}]`);
        }
        (node as Text).data = p.text;
        touched.add(node);
        break;
      }
      case 'PROPS': {
        const node = resolve(container, p.path);
        if (!(node instanceof Element)) {
          throw new Error(`patch: PROPS 패치 대상이 엘리먼트가 아닙니다: [${p.path.join(', ')}]`);
        }
        applyProps(node, p.set, p.remove, deferredSelects);
        touched.add(node);
        break;
      }
    }
  }

  for (const [select, value] of deferredSelects) setProp(select, 'value', value);
  return Array.from(touched);
}
