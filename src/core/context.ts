/** 훅 한 칸. 컴포넌트 인스턴스의 hooks[] 배열에 호출 순서(index)로 저장된다. */
export interface StateSlot {
  kind: 'state';
  value: unknown;
  setState: (action: unknown) => void;
}

export type HookSlot = StateSlot;

/** 훅이 상태를 읽고 쓰기 위해 필요한 컴포넌트의 최소 인터페이스 */
export interface HookHost {
  hooks: HookSlot[];
  /** 이번 렌더에서 다음에 사용할 훅 슬롯 번호 */
  hookIndex: number;
  /** 다시 렌더하도록 예약한다 (배치) */
  schedule(): void;
}

type RenderPhase = 'idle' | 'root' | 'child';

// 함수는 매번 새로 실행되므로 "지금 렌더 중인 컴포넌트"를 모듈 전역으로 알려 둔다.
// 훅은 이것을 통해 자기 컴포넌트의 hooks[] 배열을 찾는다.
let currentHost: HookHost | null = null;
let phase: RenderPhase = 'idle';

/** 루트 컴포넌트의 렌더 함수를 실행하는 동안만 훅을 허용한다. */
export function withRootRender<T>(host: HookHost, fn: () => T): T {
  const prevHost = currentHost;
  const prevPhase = phase;
  currentHost = host;
  phase = 'root';
  try {
    return fn();
  } finally {
    currentHost = prevHost;
    phase = prevPhase;
  }
}

/** 자식 컴포넌트(순수 함수)를 실행하는 동안은 훅을 금지한다. */
export function withChildRender<T>(fn: () => T): T {
  const prevPhase = phase;
  phase = 'child';
  try {
    return fn();
  } finally {
    phase = prevPhase;
  }
}

/** 훅이 호출될 때 현재 렌더 중인 컴포넌트를 돌려준다. 허용되지 않는 위치면 에러를 던진다. */
export function getCurrentHost(hookName: string): HookHost {
  if (phase === 'child') {
    throw new Error(
      `${hookName}: 훅은 루트 컴포넌트에서만 사용할 수 있습니다. 자식 컴포넌트는 state 없이 props만 받는 순수 함수입니다.`,
    );
  }
  if (phase !== 'root' || !currentHost) {
    throw new Error(`${hookName}: 훅은 컴포넌트 렌더 중에만 호출할 수 있습니다.`);
  }
  return currentHost;
}
