export interface HistoryOptions {
  /** 보관할 최대 상태 개수. 넘으면 가장 오래된 상태부터 버린다. 기본은 제한 없음. */
  limit?: number;
}

/**
 * undo/redo를 위한 상태 스택. 상태를 복사하지 않고 참조 그대로 보관하므로
 * 상태는 불변 스냅샷(예: VNode)으로 다루는 것을 전제로 한다.
 */
export class History<T> {
  private readonly states: T[];
  private cursor = 0;
  private readonly limit: number;

  constructor(initial: T, options: HistoryOptions = {}) {
    const limit = options.limit ?? Infinity;
    if (!(limit >= 1)) throw new Error('History: limit은 1 이상이어야 합니다.');
    this.limit = limit;
    this.states = [initial];
  }

  get current(): T {
    return this.states[this.cursor] as T;
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.states.length - 1;
  }

  /** 보관 중인 상태 개수 */
  get size(): number {
    return this.states.length;
  }

  /** 현재 상태의 위치 (0부터) */
  get index(): number {
    return this.cursor;
  }

  /** 새 상태를 쌓는다. 되돌려 둔 미래(redo)는 버린다. */
  push(state: T): void {
    this.states.length = this.cursor + 1;
    this.states.push(state);
    if (this.states.length > this.limit) this.states.shift();
    this.cursor = this.states.length - 1;
  }

  /** 한 단계 되돌린다. 처음이면 아무것도 하지 않고 현재 상태를 돌려준다. */
  undo(): T {
    if (this.canUndo) this.cursor--;
    return this.current;
  }

  /** 한 단계 다시 적용한다. 끝이면 아무것도 하지 않고 현재 상태를 돌려준다. */
  redo(): T {
    if (this.canRedo) this.cursor++;
    return this.current;
  }
}
