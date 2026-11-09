import { STORAGE_KEY, mountApp } from '../../src/demo/app';
import type { Todo } from '../../src/demo/app';
import type { FunctionComponent } from '../../src/core/FunctionComponent';
import type { Patch } from '../../src/diff/diff';

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

let root: HTMLElement;
let app: FunctionComponent | undefined;
let patches: Patch[][];

function mount(saved?: unknown): HTMLElement {
  if (saved !== undefined) {
    localStorage.setItem(STORAGE_KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
  }
  root = document.createElement('div');
  document.body.appendChild(root);
  patches = [];
  app = mountApp(root, { onPatch: (p) => patches.push(p) });
  return root;
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
const $$ = (selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector));
const texts = () => $$('li .text').map((el) => el.textContent);

async function type(selector: string, value: string): Promise<void> {
  const input = $<HTMLInputElement>(selector);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}

async function add(text: string): Promise<void> {
  await type('input[name="draft"]', text);
  $<HTMLFormElement>('form.add').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
}

async function click(el: HTMLElement): Promise<void> {
  el.click();
  await flush();
}

function stats() {
  return $('.stats').textContent!.replace(/\s+/g, ' ').trim();
}

beforeEach(() => {
  localStorage.clear();
  document.title = '';
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = '';
});

describe('Todo 앱', () => {
  describe('초기 화면', () => {
    it('제목, 입력창, 필터, 빈 상태 안내를 보여준다', () => {
      mount();
      expect($('h1').textContent).toBe('Todo');
      expect($('input[name="draft"]')).not.toBeNull();
      expect($$('.filters button').map((b) => b.textContent)).toEqual(['전체', '진행 중', '완료']);
      expect($('.empty')).not.toBeNull();
      expect($$('li')).toHaveLength(0);
    });

    it('통계는 0으로 시작한다', () => {
      mount();
      expect(stats()).toContain('전체 0');
      expect(stats()).toContain('진행 중 0');
      expect(stats()).toContain('완료 0');
    });

    it('첫 렌더는 CREATE 패치 하나로 이루어진다', () => {
      mount();
      expect(patches).toHaveLength(1);
      expect(patches[0]!.map((p) => p.type)).toEqual(['CREATE']);
    });
  });

  describe('추가', () => {
    it('입력 후 submit하면 목록에 항목이 생기고 입력창이 비워진다', async () => {
      mount();
      await add('우유 사기');
      expect(texts()).toEqual(['우유 사기']);
      expect($<HTMLInputElement>('input[name="draft"]').value).toBe('');
      expect($('.empty')).toBeNull();
    });

    it('항목은 추가한 순서대로 쌓인다', async () => {
      mount();
      await add('A');
      await add('B');
      await add('C');
      expect(texts()).toEqual(['A', 'B', 'C']);
    });

    it('앞뒤 공백은 지우고, 빈 입력이나 공백뿐인 입력은 무시한다', async () => {
      mount();
      await add('   ');
      await add('');
      await add('  공백  ');
      expect(texts()).toEqual(['공백']);
    });

    it('submit의 기본 동작(페이지 이동)을 막는다', async () => {
      mount();
      await type('input[name="draft"]', 'x');
      const event = new Event('submit', { bubbles: true, cancelable: true });
      $('form.add').dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('HTML이 들어 있는 입력도 텍스트로만 표시한다', async () => {
      mount();
      await add('<img src=x onerror=alert(1)>');
      expect($$('li img')).toHaveLength(0);
      expect(texts()).toEqual(['<img src=x onerror=alert(1)>']);
    });

    it('통계가 갱신된다', async () => {
      mount();
      await add('A');
      await add('B');
      expect(stats()).toContain('전체 2');
      expect(stats()).toContain('진행 중 2');
    });
  });

  describe('완료 / 삭제', () => {
    it('체크박스를 누르면 완료 상태가 되고 통계가 바뀐다', async () => {
      mount();
      await add('A');
      await add('B');
      await click($$('li input[type="checkbox"]')[0]!);
      expect($$('li')[0]!.classList.contains('done')).toBe(true);
      expect($$('li')[1]!.classList.contains('done')).toBe(false);
      expect($$('li input[type="checkbox"]')[0]).toHaveProperty('checked', true);
      expect(stats()).toContain('진행 중 1');
      expect(stats()).toContain('완료 1');
    });

    it('다시 누르면 완료가 해제된다', async () => {
      mount();
      await add('A');
      await click($('li input[type="checkbox"]'));
      await click($('li input[type="checkbox"]'));
      expect($('li').classList.contains('done')).toBe(false);
      expect($('li input[type="checkbox"]')).toHaveProperty('checked', false);
    });

    it('삭제 버튼을 누르면 그 항목만 사라진다', async () => {
      mount();
      await add('A');
      await add('B');
      await add('C');
      await click($$('li button[data-action="delete"]')[1]!);
      expect(texts()).toEqual(['A', 'C']);
      expect(stats()).toContain('전체 2');
    });

    it('완료 항목 지우기는 완료된 것만 삭제한다', async () => {
      mount();
      await add('A');
      await add('B');
      await add('C');
      await click($$('li input[type="checkbox"]')[0]!);
      await click($$('li input[type="checkbox"]')[2]!);
      await click($('button.clear-done'));
      expect(texts()).toEqual(['B']);
    });

    it('완료된 항목이 없으면 완료 항목 지우기 버튼이 비활성이다', async () => {
      mount();
      await add('A');
      expect($<HTMLButtonElement>('button.clear-done').disabled).toBe(true);
      await click($('li input[type="checkbox"]'));
      expect($<HTMLButtonElement>('button.clear-done').disabled).toBe(false);
    });
  });

  describe('필터 / 검색', () => {
    async function seed() {
      mount();
      await add('apple');
      await add('Banana');
      await add('avocado');
      await click($$('li input[type="checkbox"]')[1]!); // Banana 완료
    }

    it('진행 중 필터는 완료되지 않은 항목만 보여준다', async () => {
      await seed();
      await click($('button[data-filter="active"]'));
      expect(texts()).toEqual(['apple', 'avocado']);
    });

    it('완료 필터는 완료된 항목만 보여준다', async () => {
      await seed();
      await click($('button[data-filter="done"]'));
      expect(texts()).toEqual(['Banana']);
    });

    it('전체 필터로 돌아오면 모두 보인다', async () => {
      await seed();
      await click($('button[data-filter="done"]'));
      await click($('button[data-filter="all"]'));
      expect(texts()).toEqual(['apple', 'Banana', 'avocado']);
    });

    it('현재 필터 버튼이 눌림 상태(aria-pressed)로 표시된다', async () => {
      await seed();
      expect($('button[data-filter="all"]').getAttribute('aria-pressed')).toBe('true');
      await click($('button[data-filter="done"]'));
      expect($('button[data-filter="done"]').getAttribute('aria-pressed')).toBe('true');
      expect($('button[data-filter="all"]').getAttribute('aria-pressed')).toBe('false');
    });

    it('검색어는 대소문자를 구분하지 않고 포함 여부로 거른다', async () => {
      await seed();
      await type('input[name="query"]', 'AN');
      expect(texts()).toEqual(['Banana']);
      await type('input[name="query"]', 'a');
      expect(texts()).toEqual(['apple', 'Banana', 'avocado']);
    });

    it('필터와 검색을 함께 적용한다', async () => {
      await seed();
      await click($('button[data-filter="active"]'));
      await type('input[name="query"]', 'av');
      expect(texts()).toEqual(['avocado']);
    });

    it('결과가 없으면 안내 문구를 보여주고 통계는 전체 기준을 유지한다', async () => {
      await seed();
      await type('input[name="query"]', 'zzz');
      expect(texts()).toEqual([]);
      expect($('.empty')).not.toBeNull();
      expect(stats()).toContain('전체 3');
    });

    it('검색어를 지우면 다시 모두 보인다', async () => {
      await seed();
      await type('input[name="query"]', 'zzz');
      await type('input[name="query"]', '');
      expect(texts()).toHaveLength(3);
    });
  });

  describe('useEffect: 저장과 문서 제목', () => {
    it('상태가 바뀌면 localStorage에 저장한다', async () => {
      mount();
      await add('A');
      await click($('li input[type="checkbox"]'));
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.todos).toEqual([{ id: 1, text: 'A', done: true }]);
      expect(saved.nextId).toBe(2);
    });

    it('저장된 데이터가 있으면 처음 렌더에 복원한다', () => {
      const todos: Todo[] = [
        { id: 1, text: '복원 A', done: false },
        { id: 2, text: '복원 B', done: true },
      ];
      mount({ todos, nextId: 3 });
      expect(texts()).toEqual(['복원 A', '복원 B']);
      expect($$('li')[1]!.classList.contains('done')).toBe(true);
    });

    it('복원한 뒤 추가하면 id가 이어진다 (key 충돌 없음)', async () => {
      mount({ todos: [{ id: 5, text: 'old', done: false }], nextId: 6 });
      await add('new');
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(saved.todos.map((t: Todo) => t.id)).toEqual([5, 6]);
    });

    it('저장된 데이터가 손상되었으면 빈 목록으로 시작한다', () => {
      mount('{not json');
      expect($$('li')).toHaveLength(0);
      expect($('.empty')).not.toBeNull();
    });

    it('저장된 데이터의 모양이 틀려도 빈 목록으로 시작한다', () => {
      mount({ todos: 'nope', nextId: 'x' });
      expect($$('li')).toHaveLength(0);
    });

    it('문서 제목에 남은 항목 수를 표시한다', async () => {
      mount();
      expect(document.title).toBe('Todo (0개 남음)');
      await add('A');
      await add('B');
      expect(document.title).toBe('Todo (2개 남음)');
      await click($('li input[type="checkbox"]'));
      expect(document.title).toBe('Todo (1개 남음)');
    });

    it('저장은 상태가 바뀔 때만 한다 (검색어 입력만으로는 저장하지 않는다)', async () => {
      mount();
      await add('A');
      const spy = vi.spyOn(localStorage, 'setItem');
      await type('input[name="query"]', 'x');
      await click($('button[data-filter="done"]'));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('변경된 노드만 patch', () => {
    async function threeItems() {
      mount();
      await add('A');
      await add('B');
      await add('C');
      patches.length = 0;
    }

    it('한 항목을 완료하면 다른 항목의 DOM 노드는 그대로 유지된다', async () => {
      await threeItems();
      const [liA, liB, liC] = $$('li');
      await click($$('li input[type="checkbox"]')[1]!);
      expect($$('li')[0]).toBe(liA);
      expect($$('li')[1]).toBe(liB);
      expect($$('li')[2]).toBe(liC);
    });

    it('한 항목을 완료하면 구조를 바꾸는 패치(CREATE/REMOVE/REPLACE/MOVE)가 없다', async () => {
      await threeItems();
      await click($$('li input[type="checkbox"]')[1]!);
      const types = patches.flat().map((p) => p.type);
      expect(types.length).toBeGreaterThan(0);
      expect(types.every((t) => t === 'PROPS' || t === 'TEXT')).toBe(true);
    });

    it('한 항목을 완료해도 다른 항목 안에서는 DOM 변경이 일어나지 않는다 (MutationObserver)', async () => {
      await threeItems();
      const others = [$$('li')[0]!, $$('li')[2]!];
      const records: MutationRecord[] = [];
      const observer = new MutationObserver((batch) => records.push(...batch));
      observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
      await click($$('li input[type="checkbox"]')[1]!);
      records.push(...observer.takeRecords()); // 아직 전달되지 않은 레코드도 모은다
      observer.disconnect();
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        for (const li of others) expect(li.contains(record.target)).toBe(false);
      }
    });

    it('항목을 추가하면 새 항목만 CREATE되고 기존 항목 노드는 그대로다', async () => {
      await threeItems();
      const before = $$('li');
      await add('D');
      expect($$('li').slice(0, 3)).toEqual(before);
      const creates = patches.flat().filter((p) => p.type === 'CREATE');
      expect(creates).toHaveLength(1);
      expect(patches.flat().some((p) => p.type === 'REMOVE' || p.type === 'REPLACE')).toBe(false);
    });

    it('중간 항목을 삭제하면 REMOVE 하나뿐이고 남은 항목 노드는 그대로다', async () => {
      await threeItems();
      const [liA, , liC] = $$('li');
      await click($$('li button[data-action="delete"]')[1]!);
      expect($$('li')).toEqual([liA, liC]);
      expect(patches.flat().filter((p) => p.type === 'REMOVE')).toHaveLength(1);
      expect(patches.flat().some((p) => p.type === 'CREATE' || p.type === 'MOVE')).toBe(false);
    });

    it('필터를 바꿔 목록에서 빠지는 항목만 REMOVE된다', async () => {
      await threeItems();
      await click($$('li input[type="checkbox"]')[0]!);
      const [, liB, liC] = $$('li');
      patches.length = 0;
      await click($('button[data-filter="active"]'));
      expect($$('li')).toEqual([liB, liC]);
      expect(patches.flat().filter((p) => p.type === 'REMOVE')).toHaveLength(1);
    });

    it('이벤트 핸들러가 안정적이라 리렌더 때 핸들러 관련 PROPS 패치가 나오지 않는다', async () => {
      await threeItems();
      await click($$('li input[type="checkbox"]')[0]!);
      await add('D');
      await type('input[name="query"]', 'a');
      const changedKeys = patches
        .flat()
        .flatMap((p) => (p.type === 'PROPS' ? [...Object.keys(p.set), ...p.remove] : []));
      expect(changedKeys.filter((k) => k.startsWith('on'))).toEqual([]);
    });

    it('아무것도 바뀌지 않는 상태 변경(같은 필터 다시 클릭)은 패치가 없다', async () => {
      await threeItems();
      await click($('button[data-filter="all"]'));
      expect(patches).toEqual([]);
    });
  });

  describe('입력 포커스', () => {
    it('입력 중에 리렌더되어도 같은 input 노드와 포커스, 값이 유지된다', async () => {
      mount();
      const input = $<HTMLInputElement>('input[name="draft"]');
      input.focus();
      expect(document.activeElement).toBe(input);
      await type('input[name="draft"]', 'ab');
      await type('input[name="draft"]', 'abc');
      expect($('input[name="draft"]')).toBe(input);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe('abc');
    });

    it('검색창에 입력하는 동안 추가 입력창에 쓰던 내용은 보존된다', async () => {
      mount();
      await type('input[name="draft"]', '작성 중');
      await type('input[name="query"]', 'q');
      expect($<HTMLInputElement>('input[name="draft"]').value).toBe('작성 중');
    });

    it('항목을 추가해도 검색창의 포커스와 값이 유지된다', async () => {
      mount();
      const query = $<HTMLInputElement>('input[name="query"]');
      query.focus();
      await type('input[name="query"]', 'a');
      await add('apple');
      expect($('input[name="query"]')).toBe(query);
      expect(query.value).toBe('a');
    });

    it('입력창에 타이핑하는 동안은 입력창 value 외에 바뀌는 DOM이 없다', async () => {
      mount();
      patches.length = 0;
      await type('input[name="draft"]', 'hello');
      const changed = patches.flat();
      expect(changed.every((p) => p.type === 'PROPS')).toBe(true);
    });
  });

  describe('컴포넌트 구조와 정리', () => {
    it('자식 컴포넌트는 훅 없이 props만으로 동작한다 (루트에서만 훅 사용)', async () => {
      // 자식에서 훅을 호출하면 마운트 시점에 에러가 나므로, 정상 마운트와 전체 조작이 곧 검증이다.
      expect(() => mount()).not.toThrow();
      await add('A');
      await click($('li input[type="checkbox"]'));
      await click($('li button[data-action="delete"]'));
      expect($$('li')).toHaveLength(0);
    });

    it('unmount하면 DOM이 비워지고 이후 조작은 아무 일도 일으키지 않는다', async () => {
      mount();
      await add('A');
      const form = $('form.add');
      app!.unmount();
      expect(root.childNodes).toHaveLength(0);
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flush();
      expect(root.childNodes).toHaveLength(0);
    });

    it('목록 항목을 빠르게 연속 조작해도 렌더는 배치되어 결과가 맞다', async () => {
      mount();
      await add('A');
      await add('B');
      const boxes = $$('li input[type="checkbox"]');
      boxes[0]!.click();
      boxes[1]!.click();
      await flush();
      expect($$('li.done')).toHaveLength(2);
      expect(stats()).toContain('완료 2');
    });
  });
});
