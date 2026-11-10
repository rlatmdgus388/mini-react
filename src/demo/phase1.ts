import { diff } from '../diff/diff';
import type { Patch } from '../diff/diff';
import { patch } from '../diff/patch';
import { History } from '../history/history';
import { createDOM } from '../vdom/createDOM';
import { fromDOMChildren } from '../vdom/fromDOM';
import { h } from '../vdom/h';
import type { ElementVNode } from '../vdom/types';

export interface Phase1Elements {
  /** 실제 영역: VDOM의 변경분만 patch로 반영되는 영역 */
  real: HTMLElement;
  /** 테스트 영역: 사용자가 직접 편집하는 영역 (contenteditable) */
  test: HTMLElement;
  patchButton: HTMLButtonElement;
  backButton: HTMLButtonElement;
  forwardButton: HTMLButtonElement;
}

export interface Phase1Options {
  /** patch(또는 뒤로/앞으로)가 실제 영역에 적용된 직후 호출된다. */
  onPatch?: (patches: Patch[]) => void;
}

/** 영역의 자식들을 하나의 루트 VNode로 감싼다. patch는 루트 하나를 전제로 하기 때문이다. */
function rootOf(children: ElementVNode['children']): ElementVNode {
  return h('div', { 'data-root': '' }, ...children);
}

/**
 * Phase 1 흐름:
 * 실제 영역 → VDOM → 테스트 영역 렌더 → 사용자 편집 → Patch 클릭
 * → fromDOM(테스트 영역)과 이전 VDOM을 diff → 실제 영역에 변경분만 patch → history 저장.
 */
export class Phase1 {
  private readonly history: History<ElementVNode>;
  /** 실제 영역에 지금 보이는 VDOM. history의 current는 이동 후 상태라서 이동 전 상태를 따로 기억해야 diff할 수 있다. */
  private shown: ElementVNode;
  private readonly listeners: [EventTarget, string, EventListener][] = [];

  constructor(
    private readonly els: Phase1Elements,
    private readonly options: Phase1Options = {},
  ) {
    const initial = rootOf(fromDOMChildren(els.real));
    this.history = new History(initial);
    this.shown = initial;
    this.renderReal(initial);
    this.renderTest(initial);

    this.listen(els.patchButton, 'click', () => this.patch());
    this.listen(els.backButton, 'click', () => this.back());
    this.listen(els.forwardButton, 'click', () => this.forward());
    this.updateButtons();
  }

  /** 테스트 영역의 현재 내용을 이전 VDOM과 비교해 실제 영역에 변경분만 적용한다. */
  patch(): Patch[] {
    const next = rootOf(fromDOMChildren(this.els.test));
    const patches = diff(this.history.current, next);
    if (patches.length === 0) return [];
    patch(this.els.real, patches);
    this.shown = next;
    this.history.push(next);
    this.updateButtons();
    this.options.onPatch?.(patches);
    return patches;
  }

  back(): void {
    if (!this.history.canUndo) return;
    this.travel(this.history.undo());
  }

  forward(): void {
    if (!this.history.canRedo) return;
    this.travel(this.history.redo());
  }

  /**
   * 툴바 버튼([data-action])을 연결한다.
   * 툴바는 테스트 영역의 DOM을 직접 편집할 뿐이고, 실제 영역에는 Patch를 눌러야 반영된다.
   */
  bindToolbar(doc: ParentNode): void {
    const actions: Record<string, () => void> = {
      'add-paragraph': () => this.addParagraph(),
      'add-item': () => this.addItem(),
      'remove-last': () => this.removeLast(),
    };
    doc.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      const action = actions[button.dataset.action ?? ''];
      if (action) this.listen(button, 'click', action);
    });
  }

  /** 등록한 이벤트 리스너를 모두 제거한다. */
  destroy(): void {
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
  }

  // --- 내부 ---

  /** history의 상태로 이동한다. 실제 영역은 diff/patch로, 테스트 영역은 통째로 다시 렌더한다. */
  private travel(target: ElementVNode): void {
    const patches = diff(this.shown, target);
    patch(this.els.real, patches);
    this.shown = target;
    this.renderTest(target);
    this.updateButtons();
    this.options.onPatch?.(patches);
  }

  private renderReal(vnode: ElementVNode): void {
    this.els.real.replaceChildren(createDOM(vnode));
  }

  private renderTest(vnode: ElementVNode): void {
    // 테스트 영역에는 래퍼 없이 자식들만 렌더한다. 사용자가 편집하는 영역 그 자체이기 때문이다.
    this.els.test.replaceChildren(...vnode.children.map((child) => createDOM(child)));
  }

  private updateButtons(): void {
    this.els.backButton.disabled = !this.history.canUndo;
    this.els.forwardButton.disabled = !this.history.canRedo;
  }

  private listen(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }

  private addParagraph(): void {
    const p = document.createElement('p');
    p.textContent = '새 문단';
    this.els.test.appendChild(p);
  }

  private addItem(): void {
    let list = this.els.test.querySelector('ul, ol');
    if (!list) {
      list = document.createElement('ul');
      this.els.test.appendChild(list);
    }
    const li = document.createElement('li');
    li.textContent = '새 항목';
    list.appendChild(li);
  }

  private removeLast(): void {
    this.els.test.lastElementChild?.remove();
  }
}

function required<T extends HTMLElement>(doc: ParentNode, selector: string): T {
  const el = doc.querySelector<T>(selector);
  if (!el) throw new Error(`Phase1: ${selector} 요소를 찾을 수 없습니다.`);
  return el;
}

/** 문서의 id 규약(#real, #test, #patch-btn, #back-btn, #forward-btn)과 [data-action] 버튼을 찾아 연결한다. */
export function mountPhase1(doc: Document, options: Phase1Options = {}): Phase1 {
  const phase1 = new Phase1(
    {
      real: required(doc, '#real'),
      test: required(doc, '#test'),
      patchButton: required<HTMLButtonElement>(doc, '#patch-btn'),
      backButton: required<HTMLButtonElement>(doc, '#back-btn'),
      forwardButton: required<HTMLButtonElement>(doc, '#forward-btn'),
    },
    options,
  );
  phase1.bindToolbar(doc);
  return phase1;
}
