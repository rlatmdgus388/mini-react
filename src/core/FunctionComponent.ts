import { diff } from '../diff/diff';
import type { Patch } from '../diff/diff';
import { patch } from '../diff/patch';
import type { Props, VNode } from '../vdom/types';
import { withRootRender } from './context';
import type { EffectSlot, HookHost, HookSlot } from './context';
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
  hasRendered = false;

  private prev: VNode | null = null;
  private scheduled = false;
  /** unmount된 뒤에는 렌더·effect를 하지 않는다. mount()가 다시 호출되면 풀린다. */
  private disposed = false;

  constructor(
    private readonly renderFn: (props: P) => VNode,
    private readonly container: Element,
    private props: P = {} as P,
    private readonly options: FunctionComponentOptions = {},
  ) {}

  /** 컨테이너를 비우고 상태를 새로 시작해 첫 렌더를 한다. */
  mount(): void {
    this.disposed = false;
    this.hooks = [];
    this.hookIndex = 0;
    this.hasRendered = false;
    this.container.replaceChildren();
    this.prev = null;
    this.update();
  }

  /** effect의 cleanup을 선언 순서대로 호출하고 DOM을 비운다. 이후의 setState는 무시된다. */
  unmount(): void {
    if (this.disposed) return;
    this.disposed = true;
    const slots = this.hooks.filter((s): s is EffectSlot => s.kind === 'effect');
    const errors: unknown[] = [];
    for (const slot of slots) {
      const cleanup = slot.cleanup;
      slot.cleanup = undefined;
      try {
        cleanup?.();
      } catch (error) {
        errors.push(error);
      }
    }
    this.container.replaceChildren();
    this.prev = null;
    if (errors.length > 0) throw errors[0];
  }

  /** 지금 상태로 렌더하고 이전 VDOM과 비교해 바뀐 부분만 DOM에 반영한다. 적용한 패치를 돌려준다. */
  update(): Patch[] {
    if (this.disposed) return [];
    this.hookIndex = 0;
    const rendered = withRootRender(this, () => this.renderFn(this.props));
    // 이전 렌더보다 훅을 적게 호출했다면 hooks[]의 뒷부분이 엉뚱한 슬롯으로 남으므로 commit 전에 막는다.
    if (this.hasRendered && this.hookIndex !== this.hooks.length) {
      throw new Error(
        '훅 호출 개수가 이전 렌더와 다릅니다. 훅은 조건문·반복문 안에서 호출하지 말고 항상 같은 순서로 호출해야 합니다.',
      );
    }
    this.hasRendered = true;
    const next = resolveTree(rendered);

    const patches = diff(this.prev, next);
    if (patches.length > 0) {
      patch(this.container, patches);
      this.options.onPatch?.(patches);
    }
    this.prev = next;
    this.flushEffects();
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
    if (this.scheduled || this.disposed) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.update();
    });
  }

  /**
   * commit(DOM 반영) 직후 이번 렌더에서 실행 대상이 된 effect를 실행한다.
   * 모든 cleanup을 먼저 호출하고 그다음 effect를 선언 순서대로 실행한다.
   * 하나가 던져도 나머지는 실행하고, 첫 예외를 마지막에 다시 던진다.
   */
  private flushEffects(): void {
    const pending = this.hooks.filter((s): s is EffectSlot => s.kind === 'effect' && s.pending);
    const errors: unknown[] = [];
    const attempt = (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        errors.push(error);
      }
    };

    for (const slot of pending) {
      slot.pending = false;
      const cleanup = slot.cleanup;
      slot.cleanup = undefined;
      if (cleanup) attempt(cleanup);
    }
    for (const slot of pending) {
      attempt(() => {
        const result = slot.effect();
        slot.cleanup = typeof result === 'function' ? result : undefined;
      });
    }
    if (errors.length > 0) throw errors[0];
  }
}
