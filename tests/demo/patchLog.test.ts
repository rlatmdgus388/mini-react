import { PatchLog, describePatch, highlightNodes, summarizePatches } from '../../src/demo/patchLog';
import { mountApp } from '../../src/demo/app';
import type { Patch } from '../../src/diff/diff';
import { createTextVNode, h } from '../../src/vdom/h';
import type { Props, VNode } from '../../src/vdom/types';

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('describePatch', () => {
  it('CREATE: 경로와 만들어진 노드를 보여준다', () => {
    expect(describePatch({ type: 'CREATE', path: [0, 2], vnode: h('li', null, 'x') })).toBe('CREATE [0, 2] <li>');
  });

  it('CREATE: 텍스트 노드는 따옴표로 감싼 내용을 보여준다', () => {
    expect(describePatch({ type: 'CREATE', path: [1], vnode: createTextVNode('hello') })).toBe('CREATE [1] "hello"');
  });

  it('루트 경로는 []로 표시한다', () => {
    expect(describePatch({ type: 'CREATE', path: [], vnode: h('div') })).toBe('CREATE [] <div>');
    expect(describePatch({ type: 'REMOVE', path: [] })).toBe('REMOVE []');
  });

  it('REMOVE', () => {
    expect(describePatch({ type: 'REMOVE', path: [1] })).toBe('REMOVE [1]');
  });

  it('REPLACE: 바뀐 노드를 → 로 보여준다', () => {
    expect(describePatch({ type: 'REPLACE', path: [0], vnode: h('section') })).toBe('REPLACE [0] → <section>');
  });

  it('TEXT: 새 텍스트를 보여준다', () => {
    expect(describePatch({ type: 'TEXT', path: [0, 1], text: 'new' })).toBe('TEXT [0, 1] → "new"');
  });

  it('긴 텍스트는 24자에서 줄이고 …을 붙인다', () => {
    const long = 'a'.repeat(40);
    expect(describePatch({ type: 'TEXT', path: [0], text: long })).toBe(`TEXT [0] → "${'a'.repeat(24)}…"`);
  });

  it('줄바꿈은 보이게 이스케이프한다', () => {
    expect(describePatch({ type: 'TEXT', path: [0], text: 'a\nb' })).toBe('TEXT [0] → "a\\nb"');
  });

  it('PROPS: 추가/변경은 이름="값", 삭제는 -이름', () => {
    const patch: Patch = { type: 'PROPS', path: [1], set: { class: 'b', id: 'x' }, remove: ['title'] };
    expect(describePatch(patch)).toBe('PROPS [1] class="b" id="x" -title');
  });

  it('PROPS: 숫자·불리언은 따옴표 없이, 함수는 ƒ로, 객체는 JSON으로 보여준다', () => {
    const patch: Patch = {
      type: 'PROPS',
      path: [],
      set: { tabindex: 3, disabled: true, onClick: () => {}, style: { color: 'red' } },
      remove: [],
    };
    expect(describePatch(patch)).toBe('PROPS [] tabindex=3 disabled=true onClick=ƒ style={"color":"red"}');
  });

  it('PROPS: set과 remove가 모두 비어 있어도 에러 없이 표시한다', () => {
    expect(describePatch({ type: 'PROPS', path: [0], set: {}, remove: [] })).toBe('PROPS [0]');
  });

  it('MOVE: 이동할 자리를 보여준다', () => {
    expect(describePatch({ type: 'MOVE', path: [2], to: 0 })).toBe('MOVE [2] → 0');
  });

  it('함수형 컴포넌트 type은 함수 이름으로 보여준다', () => {
    const Card = (props: Props): VNode => h('div', null, props.x);
    expect(describePatch({ type: 'CREATE', path: [0], vnode: h(Card) })).toBe('CREATE [0] <Card>');
  });
});

describe('summarizePatches', () => {
  it('종류별 개수를 고정된 순서로 요약한다', () => {
    const patches: Patch[] = [
      { type: 'TEXT', path: [0], text: 'a' },
      { type: 'CREATE', path: [1], vnode: h('i') },
      { type: 'TEXT', path: [2], text: 'b' },
      { type: 'REMOVE', path: [3] },
    ];
    expect(summarizePatches(patches)).toBe('CREATE 1 · REMOVE 1 · TEXT 2');
  });

  it('패치가 없으면 "변경 없음"', () => {
    expect(summarizePatches([])).toBe('변경 없음');
  });
});

describe('PatchLog', () => {
  function setup(options?: { maxEntries?: number }) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    return { container, log: new PatchLog(container, options) };
  }

  const text = (n: number): Patch => ({ type: 'TEXT', path: [n], text: `t${n}` });

  it('처음에는 빈 상태 안내를 보여준다', () => {
    const { container, log } = setup();
    expect(container.querySelector('.log-empty')).not.toBeNull();
    expect(log.size).toBe(0);
  });

  it('record하면 항목이 생기고 번호·출처·요약·패치 줄을 보여준다', () => {
    const { container, log } = setup();
    log.record('Patch', [text(0), { type: 'REMOVE', path: [1] }]);
    expect(container.querySelector('.log-empty')).toBeNull();
    const entry = container.querySelector('.log-entry')!;
    expect(entry.querySelector('.log-title')!.textContent).toContain('#1');
    expect(entry.querySelector('.log-title')!.textContent).toContain('Patch');
    expect(entry.querySelector('.log-summary')!.textContent).toBe('REMOVE 1 · TEXT 1');
    const lines = Array.from(entry.querySelectorAll('.log-patch')).map((el) => el.textContent);
    expect(lines).toEqual(['TEXT [0] → "t0"', 'REMOVE [1]']);
  });

  it('패치 줄에 종류별 클래스를 붙인다 (색 외에 텍스트로도 구분된다)', () => {
    const { container, log } = setup();
    log.record('x', [text(0), { type: 'REMOVE', path: [1] }]);
    expect(container.querySelector('.log-patch.patch-TEXT')).not.toBeNull();
    expect(container.querySelector('.log-patch.patch-REMOVE')).not.toBeNull();
    expect(container.querySelector('.log-patch.patch-TEXT .badge')!.textContent).toBe('TEXT');
  });

  it('새 항목이 위에 쌓이고 번호가 늘어난다', () => {
    const { container, log } = setup();
    log.record('첫째', [text(0)]);
    log.record('둘째', [text(1)]);
    const titles = Array.from(container.querySelectorAll('.log-title')).map((el) => el.textContent);
    expect(titles[0]).toContain('#2');
    expect(titles[0]).toContain('둘째');
    expect(titles[1]).toContain('#1');
  });

  it('빈 패치는 기록하지 않는다', () => {
    const { container, log } = setup();
    log.record('x', []);
    expect(log.size).toBe(0);
    expect(container.querySelector('.log-empty')).not.toBeNull();
  });

  it('maxEntries를 넘으면 가장 오래된 항목부터 버린다', () => {
    const { container, log } = setup({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) log.record(`r${i}`, [text(i)]);
    expect(log.size).toBe(3);
    const titles = Array.from(container.querySelectorAll('.log-title')).map((el) => el.textContent ?? '');
    expect(titles.map((t) => /#(\d+)/.exec(t)![1])).toEqual(['5', '4', '3']);
  });

  it('지우기 버튼은 항목을 비우고 빈 상태로 돌아간다', () => {
    const { container, log } = setup();
    log.record('x', [text(0)]);
    container.querySelector<HTMLButtonElement>('button.log-clear')!.click();
    expect(log.size).toBe(0);
    expect(container.querySelector('.log-entry')).toBeNull();
    expect(container.querySelector('.log-empty')).not.toBeNull();
  });

  it('clear() 후에도 번호는 이어서 센다', () => {
    const { container, log } = setup();
    log.record('x', [text(0)]);
    log.clear();
    log.record('y', [text(1)]);
    expect(container.querySelector('.log-title')!.textContent).toContain('#2');
  });

  it('패치 내용에 HTML이 있어도 텍스트로만 표시한다', () => {
    const { container, log } = setup();
    log.record('<b>src</b>', [{ type: 'TEXT', path: [0], text: '<img src=x onerror=alert(1)>' }]);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('.log-patch')!.textContent).toContain('<img src=x');
  });

  it('입력 패치 배열을 변형하지 않는다', () => {
    const { log } = setup();
    const patches = Object.freeze([Object.freeze(text(0)), Object.freeze(text(1))]) as unknown as Patch[];
    expect(() => log.record('x', patches)).not.toThrow();
  });

  it('maxEntries가 1 미만이면 에러', () => {
    const container = document.createElement('div');
    expect(() => new PatchLog(container, { maxEntries: 0 })).toThrow();
  });
});

describe('highlightNodes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function el(tag = 'div'): HTMLElement {
    const node = document.createElement(tag);
    document.body.appendChild(node);
    return node;
  }

  it('요소에 하이라이트 클래스를 붙이고 duration 뒤에 뗀다', () => {
    const target = el();
    highlightNodes([target], { duration: 500 });
    expect(target.classList.contains('patch-highlight')).toBe(true);
    vi.advanceTimersByTime(499);
    expect(target.classList.contains('patch-highlight')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(target.classList.contains('patch-highlight')).toBe(false);
  });

  it('텍스트 노드는 부모 요소를 하이라이트한다', () => {
    const parent = el('p');
    parent.textContent = 'hello';
    highlightNodes([parent.firstChild!]);
    expect(parent.classList.contains('patch-highlight')).toBe(true);
  });

  it('같은 요소를 여러 번 넘겨도 한 번만 처리한다', () => {
    const target = el();
    expect(() => highlightNodes([target, target, target])).not.toThrow();
    expect(target.classList.contains('patch-highlight')).toBe(true);
  });

  it('DOM에서 떨어진 노드는 무시한다', () => {
    const detached = document.createElement('div');
    highlightNodes([detached]);
    expect(detached.classList.contains('patch-highlight')).toBe(false);
  });

  it('부모가 없는 텍스트 노드는 무시한다', () => {
    expect(() => highlightNodes([document.createTextNode('x')])).not.toThrow();
  });

  it('다시 하이라이트하면 타이머가 갱신되어 먼저 건 타이머가 일찍 떼지 않는다', () => {
    const target = el();
    highlightNodes([target], { duration: 600 });
    vi.advanceTimersByTime(400);
    highlightNodes([target], { duration: 600 });
    vi.advanceTimersByTime(300); // 첫 타이머 기준 700ms
    expect(target.classList.contains('patch-highlight')).toBe(true);
    vi.advanceTimersByTime(300); // 두 번째 타이머 기준 600ms
    expect(target.classList.contains('patch-highlight')).toBe(false);
  });

  it('클래스 이름을 바꿀 수 있다', () => {
    const target = el();
    highlightNodes([target], { className: 'flash' });
    expect(target.classList.contains('flash')).toBe(true);
    expect(target.classList.contains('patch-highlight')).toBe(false);
  });

  it('반환된 함수를 부르면 즉시 모두 뗀다', () => {
    const a = el();
    const b = el();
    const cancel = highlightNodes([a, b]);
    cancel();
    expect(a.classList.contains('patch-highlight')).toBe(false);
    expect(b.classList.contains('patch-highlight')).toBe(false);
    vi.advanceTimersByTime(5000); // 이미 뗐으므로 타이머가 돌아도 문제없다
  });

  it('하이라이트 중 요소가 제거되어도 에러가 없다', () => {
    const target = el();
    highlightNodes([target], { duration: 100 });
    target.remove();
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
  });

  it('원래 있던 class는 유지한다', () => {
    const target = el();
    target.className = 'keep me';
    highlightNodes([target], { duration: 100 });
    vi.advanceTimersByTime(100);
    expect(target.className).toBe('keep me');
  });
});

describe('통합: Todo 앱 + 패치 로그 + 하이라이트', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  function setup() {
    const appRoot = document.createElement('div');
    const logRoot = document.createElement('div');
    document.body.append(appRoot, logRoot);
    const log = new PatchLog(logRoot);
    let first = true;
    const app = mountApp(appRoot, {
      onPatch: (patches, touched) => {
        log.record(first ? 'mount' : 'update', patches);
        first = false;
        highlightNodes(touched);
      },
    });
    return { appRoot, logRoot, log, app };
  }

  async function addTodo(appRoot: HTMLElement, value: string) {
    const input = appRoot.querySelector<HTMLInputElement>('input[name="draft"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    appRoot.querySelector('form.add')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
  }

  it('첫 렌더(mount)가 CREATE로 기록된다', () => {
    const { logRoot, app } = setup();
    expect(logRoot.querySelector('.log-title')!.textContent).toContain('mount');
    expect(logRoot.querySelector('.patch-CREATE')).not.toBeNull();
    app.unmount();
  });

  it('항목을 추가하면 CREATE가 기록되고 새 항목이 하이라이트된다', async () => {
    const { appRoot, logRoot, app } = setup();
    await addTodo(appRoot, '우유');
    const titles = Array.from(logRoot.querySelectorAll('.log-title')).map((el) => el.textContent);
    expect(titles[0]).toContain('update');
    expect(logRoot.querySelector('.log-entry .patch-CREATE')).not.toBeNull();
    const li = appRoot.querySelector('li')!;
    expect(li.classList.contains('patch-highlight')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(li.classList.contains('patch-highlight')).toBe(false);
    app.unmount();
  });

  it('바뀌지 않은 항목은 하이라이트되지 않는다', async () => {
    const { appRoot, app } = setup();
    await addTodo(appRoot, 'A');
    vi.advanceTimersByTime(1000);
    await addTodo(appRoot, 'B');
    const [liA, liB] = Array.from(appRoot.querySelectorAll('li'));
    expect(liB!.classList.contains('patch-highlight')).toBe(true);
    expect(liA!.classList.contains('patch-highlight')).toBe(false);
    app.unmount();
  });

  it('완료 토글은 PROPS만 기록하고 CREATE/REMOVE는 기록하지 않는다', async () => {
    const { appRoot, logRoot, log, app } = setup();
    await addTodo(appRoot, 'A');
    log.clear();
    appRoot.querySelector<HTMLInputElement>('li input[type="checkbox"]')!.click();
    await flush();
    expect(logRoot.querySelector('.patch-PROPS')).not.toBeNull();
    expect(logRoot.querySelector('.patch-CREATE, .patch-REMOVE, .patch-REPLACE')).toBeNull();
    app.unmount();
  });
});
