import { getCurrentHost } from './context';
import type { EffectCallback, EffectSlot, HookHost, HookSlot, MemoSlot, StateSlot } from './context';

export type SetState<T> = (action: T | ((prev: T) => T)) => void;

/**
 * 이번 렌더에서 쓸 훅 슬롯을 호출 순서(index)로 찾는다.
 * 훅은 호출 순서로 슬롯과 짝지어지므로, 렌더마다 순서·개수·종류가 달라지면 엉뚱한 슬롯을 읽게 된다.
 * 그래서 첫 렌더 이후에는 어긋남을 발견하는 즉시 에러를 던진다.
 */
function claimSlot<K extends HookSlot['kind']>(
  host: HookHost,
  hookName: string,
  kind: K,
): { index: number; slot: Extract<HookSlot, { kind: K }> | undefined } {
  const index = host.hookIndex++;
  const slot = host.hooks[index];
  if (slot === undefined) {
    if (host.hasRendered) {
      throw new Error(
        `${hookName}: 훅 호출 개수가 이전 렌더보다 많습니다. 훅은 조건문·반복문 안에서 호출하지 말고 항상 같은 순서로 호출해야 합니다.`,
      );
    }
    return { index, slot: undefined };
  }
  if (slot.kind !== kind) {
    throw new Error(
      `${hookName}: 훅 호출 순서가 이전 렌더와 다릅니다. ${index}번째 훅은 ${slot.kind}였는데 ${kind}가 호출되었습니다.`,
    );
  }
  return { index, slot: slot as Extract<HookSlot, { kind: K }> };
}

/** deps가 달라졌는지 Object.is로 얕게 비교한다. deps가 없으면 항상 달라진 것으로 본다. */
function depsChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
  if (prev === undefined || next === undefined) return true;
  if (prev.length !== next.length) return true;
  return next.some((dep, i) => !Object.is(dep, prev[i]));
}

/**
 * 컴포넌트에 상태를 둔다. 상태는 클로저가 아니라 컴포넌트 인스턴스의 hooks[] 배열에
 * "호출 순서(index)"로 저장되므로, 렌더 함수가 매번 새로 실행되어도 값이 유지된다.
 */
export function useState<T>(initial: T | (() => T)): [T, SetState<T>] {
  const host = getCurrentHost('useState');
  const { index, slot: existing } = claimSlot(host, 'useState', 'state');

  let slot: StateSlot | undefined = existing;
  if (!slot) {
    const created: StateSlot = {
      kind: 'state',
      value: typeof initial === 'function' ? (initial as () => T)() : initial,
      setState: (action) => {
        // 함수형 업데이트는 "가장 최근 값"을 받는다. 같은 배치 안에서 연속 호출해도 결과가 이어진다.
        const next = typeof action === 'function' ? (action as (prev: unknown) => unknown)(created.value) : action;
        if (Object.is(next, created.value)) return;
        created.value = next;
        host.schedule();
      },
    };
    host.hooks[index] = created;
    slot = created;
  }
  return [slot.value as T, slot.setState as SetState<T>];
}

/**
 * 비싼 계산 결과를 deps가 같은 동안 캐시한다. deps를 생략하면 매 렌더 다시 계산한다.
 * 다시 계산하지 않을 때 같은 참조를 돌려주므로, 하위 비교(diff의 props 비교 등)를 줄이는 데도 쓸 수 있다.
 */
export function useMemo<T>(factory: () => T, deps?: unknown[]): T {
  const host = getCurrentHost('useMemo');
  const { index, slot } = claimSlot(host, 'useMemo', 'memo');

  if (slot && !depsChanged(slot.deps, deps)) return slot.value as T;

  // factory가 던지면 슬롯을 갱신하지 않는다 (다음 렌더에서 다시 시도한다).
  const value = factory();
  const next: MemoSlot = { kind: 'memo', value, deps };
  host.hooks[index] = next;
  return value;
}

/**
 * 렌더가 DOM에 반영(commit)된 뒤에 부수 효과를 실행한다.
 * deps가 바뀐 렌더에서만 실행되고, 다시 실행하기 전에 이전 effect가 돌려준 cleanup을 먼저 호출한다.
 * 빈 배열이면 mount 때 한 번만 실행되고, unmount 때 cleanup이 호출된다.
 */
export function useEffect(effect: EffectCallback, deps?: unknown[]): void {
  const host = getCurrentHost('useEffect');
  const { index, slot } = claimSlot(host, 'useEffect', 'effect');

  if (!slot) {
    const created: EffectSlot = { kind: 'effect', effect, deps, cleanup: undefined, pending: true };
    host.hooks[index] = created;
    return;
  }
  if (depsChanged(slot.deps, deps)) {
    slot.effect = effect;
    slot.deps = deps;
    slot.pending = true;
  }
}
