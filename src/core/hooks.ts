import { getCurrentHost } from './context';
import type { StateSlot } from './context';

export type SetState<T> = (action: T | ((prev: T) => T)) => void;

/**
 * 컴포넌트에 상태를 둔다. 상태는 클로저가 아니라 컴포넌트 인스턴스의 hooks[] 배열에
 * "호출 순서(index)"로 저장되므로, 렌더 함수가 매번 새로 실행되어도 값이 유지된다.
 */
export function useState<T>(initial: T | (() => T)): [T, SetState<T>] {
  const host = getCurrentHost('useState');
  const index = host.hookIndex++;

  let slot = host.hooks[index] as StateSlot | undefined;
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
