import { diff } from '../diff/diff';
import type { Patch } from '../diff/diff';
import { patch } from '../diff/patch';
import type { Props, VNode } from '../vdom/types';
import { withRootRender } from './context';
import type { HookHost, HookSlot } from './context';
import { resolveTree } from './render';

export interface FunctionComponentOptions {
  /** DOM에 patch가 적용된 직후, 적용된 패치 목록과 함께 호출된다. (빈 패치면 호출하지 않는다) */
  onPatch?: (patches: Patch[]) => void;
}

/**
 * 루트 컴포넌트 하나를 컨테이너에 연결한다.
 * 상태(hooks[])를 이 인스턴스가 들고 있고, 업데이트는 항상
 * 새 VDOM 생성 → diff(prev, next) → patch → prev = next 순서로 진행된다.
 */
export class FunctionComponent<P extends Props = Props> implements HookHost {
  hooks: HookSlot[] = [];
  hookIndex = 0;

  private prev: VNode | null = null;
  private scheduled = false;

  constructor(
    private readonly renderFn: (props: P) => VNode,
    private readonly container: Element,
    private props: P = {} as P,
    private readonly options: FunctionComponentOptions = {},
  ) {}

  /** 컨테이너를 비우고 첫 렌더를 한다. */
  mount(): void {
    this.container.replaceChildren();
    this.prev = null;
    this.update();
  }

  /** 지금 상태로 렌더하고 이전 VDOM과 비교해 바뀐 부분만 DOM에 반영한다. 적용한 패치를 돌려준다. */
  update(): Patch[] {
    this.hookIndex = 0;
    const rendered = withRootRender(this, () => this.renderFn(this.props));
    const next = resolveTree(rendered);

    const patches = diff(this.prev, next);
    if (patches.length > 0) {
      patch(this.container, patches);
      this.options.onPatch?.(patches);
    }
    this.prev = next;
    return patches;
  }

  setProps(props: P): void {
    this.props = props;
    this.update();
  }

  /**
   * 렌더를 예약한다 (batching). 이미 예약되어 있으면 아무것도 하지 않으므로,
   * 한 틱 안에서 setState를 여러 번 불러도 update()는 마이크로태스크에서 한 번만 실행된다.
   */
  schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.update();
    });
  }
}
