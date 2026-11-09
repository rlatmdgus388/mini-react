import type { Patch } from '../diff/diff';
import { isTextVNode } from '../vdom/h';
import type { VNode } from '../vdom/types';

/** 요약과 로그에서 쓰는 패치 종류의 표시 순서 */
const TYPE_ORDER: Patch['type'][] = ['CREATE', 'REMOVE', 'REPLACE', 'TEXT', 'PROPS', 'MOVE'];

/** 한 줄에 보여줄 텍스트·속성 값의 최대 길이 */
const MAX_TEXT = 24;

const formatPath = (path: number[]): string => `[${path.join(', ')}]`;

/** 따옴표로 감싸고, 줄바꿈은 보이게 이스케이프하고, 길면 줄인다. */
function quote(text: string): string {
  const escaped = text.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  return `"${escaped.length > MAX_TEXT ? `${escaped.slice(0, MAX_TEXT)}…` : escaped}"`;
}

function describeVNode(vnode: VNode): string {
  if (isTextVNode(vnode)) return quote(vnode.text);
  const name = typeof vnode.type === 'string' ? vnode.type : vnode.type.name || 'Anonymous';
  return `<${name}>`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'function') return 'ƒ';
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[객체]';
    }
  }
  return String(value);
}

/** 패치 하나를 사람이 읽는 한 줄로 설명한다. 예: `TEXT [0, 1] → "new"` */
export function describePatch(patch: Patch): string {
  const path = formatPath(patch.path);
  switch (patch.type) {
    case 'CREATE':
      return `CREATE ${path} ${describeVNode(patch.vnode)}`;
    case 'REMOVE':
      return `REMOVE ${path}`;
    case 'REPLACE':
      return `REPLACE ${path} → ${describeVNode(patch.vnode)}`;
    case 'TEXT':
      return `TEXT ${path} → ${quote(patch.text)}`;
    case 'MOVE':
      return `MOVE ${path} → ${patch.to}`;
    case 'PROPS': {
      const parts = [
        ...Object.entries(patch.set).map(([name, value]) => `${name}=${formatValue(value)}`),
        ...patch.remove.map((name) => `-${name}`),
      ];
      return parts.length > 0 ? `PROPS ${path} ${parts.join(' ')}` : `PROPS ${path}`;
    }
  }
}

/** 패치 종류별 개수를 한 줄로 요약한다. 예: `CREATE 1 · TEXT 2` */
export function summarizePatches(patches: readonly Patch[]): string {
  const counts = new Map<Patch['type'], number>();
  for (const patch of patches) counts.set(patch.type, (counts.get(patch.type) ?? 0) + 1);
  const parts = TYPE_ORDER.filter((type) => counts.has(type)).map((type) => `${type} ${counts.get(type)}`);
  return parts.length > 0 ? parts.join(' · ') : '변경 없음';
}

interface LogEntry {
  id: number;
  source: string;
  time: string;
  summary: string;
  lines: { type: Patch['type']; text: string }[];
}

export interface PatchLogOptions {
  /** 보관할 최대 항목 수. 넘으면 가장 오래된 항목부터 버린다. 기본 50. */
  maxEntries?: number;
}

/**
 * 어떤 패치가 적용되었는지 패널에 기록한다. 최신 항목이 위에 쌓인다.
 * 패치 내용은 사용자 입력이 섞여 있을 수 있으므로 항상 textContent로만 넣는다.
 */
export class PatchLog {
  private readonly maxEntries: number;
  private readonly body: HTMLElement;
  private entries: LogEntry[] = [];
  private seq = 0;

  constructor(container: HTMLElement, options: PatchLogOptions = {}) {
    const maxEntries = options.maxEntries ?? 50;
    if (!(maxEntries >= 1)) throw new Error('PatchLog: maxEntries는 1 이상이어야 합니다.');
    this.maxEntries = maxEntries;

    const root = document.createElement('div');
    root.className = 'patch-log';

    const header = document.createElement('div');
    header.className = 'log-header';
    const title = document.createElement('h2');
    title.textContent = '패치 로그';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'log-clear';
    clear.textContent = '지우기';
    clear.addEventListener('click', () => this.clear());
    header.append(title, clear);

    this.body = document.createElement('div');
    this.body.className = 'log-body';
    root.append(header, this.body);
    container.replaceChildren(root);
    this.render();
  }

  get size(): number {
    return this.entries.length;
  }

  /** 패치를 한 항목으로 기록한다. 빈 패치(변경 없음)는 기록하지 않는다. */
  record(source: string, patches: readonly Patch[]): void {
    if (patches.length === 0) return;
    this.entries.unshift({
      id: ++this.seq,
      source,
      time: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
      summary: summarizePatches(patches),
      lines: patches.map((patch) => ({ type: patch.type, text: describePatch(patch) })),
    });
    if (this.entries.length > this.maxEntries) this.entries.length = this.maxEntries;
    this.render();
  }

  /** 항목을 모두 지운다. 번호는 이어서 센다. */
  clear(): void {
    this.entries = [];
    this.render();
  }

  private render(): void {
    if (this.entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'log-empty';
      empty.textContent = '아직 적용된 패치가 없습니다.';
      this.body.replaceChildren(empty);
      return;
    }

    const list = document.createElement('ol');
    list.className = 'log-entries';
    for (const entry of this.entries) {
      const item = document.createElement('li');
      item.className = 'log-entry';

      const title = document.createElement('div');
      title.className = 'log-title';
      title.textContent = `#${entry.id} · ${entry.source} · ${entry.time}`;

      const summary = document.createElement('div');
      summary.className = 'log-summary';
      summary.textContent = entry.summary;

      const lines = document.createElement('ul');
      lines.className = 'log-patches';
      for (const line of entry.lines) {
        const row = document.createElement('li');
        row.className = `log-patch patch-${line.type}`;
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = line.type;
        const detail = document.createElement('span');
        detail.className = 'log-detail';
        detail.textContent = line.text.slice(line.type.length);
        row.append(badge, detail);
        lines.append(row);
      }

      item.append(title, summary, lines);
      list.append(item);
    }
    this.body.replaceChildren(list);
  }
}

export interface HighlightOptions {
  /** 하이라이트를 유지할 시간(ms). 기본 600. */
  duration?: number;
  /** 붙일 클래스 이름. 기본 `patch-highlight`. */
  className?: string;
}

// 요소·클래스 이름별로 진행 중인 타이머. 같은 요소를 다시 하이라이트하면 타이머를 갱신한다.
const activeTimers = new WeakMap<Element, Map<string, ReturnType<typeof setTimeout>>>();

/**
 * 변경된 노드를 잠깐 강조한다. 텍스트 노드는 부모 요소를 강조하고, DOM에서 떨어진 노드는 무시한다.
 * @returns 호출하면 지금 걸린 하이라이트를 즉시 모두 뗀다.
 */
export function highlightNodes(nodes: readonly Node[], options: HighlightOptions = {}): () => void {
  const { duration = 600, className = 'patch-highlight' } = options;

  const elements = new Set<Element>();
  for (const node of nodes) {
    const element = node instanceof Element ? node : node.parentElement;
    if (element?.isConnected) elements.add(element);
  }

  const stop = (element: Element): void => {
    const timers = activeTimers.get(element);
    const timer = timers?.get(className);
    if (timer !== undefined) clearTimeout(timer);
    timers?.delete(className);
    element.classList.remove(className);
  };

  for (const element of elements) {
    // 이미 걸려 있으면 떼었다가 다시 붙여서 CSS 애니메이션을 처음부터 재생한다.
    stop(element);
    void (element as HTMLElement).offsetWidth; // 리플로우를 강제해 애니메이션을 재시작한다
    element.classList.add(className);

    let timers = activeTimers.get(element);
    if (!timers) activeTimers.set(element, (timers = new Map()));
    timers.set(
      className,
      setTimeout(() => stop(element), duration),
    );
  }

  return () => elements.forEach(stop);
}
