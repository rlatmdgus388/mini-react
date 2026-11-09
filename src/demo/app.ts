import { FunctionComponent } from '../core/FunctionComponent';
import type { FunctionComponentOptions } from '../core/FunctionComponent';
import { useEffect, useMemo, useState } from '../core/hooks';
import { h } from '../vdom/h';
import type { Props, VNode } from '../vdom/types';

export interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export type Filter = 'all' | 'active' | 'done';

interface TodoData {
  todos: Todo[];
  /** 다음에 쓸 id. 삭제해도 줄지 않아 key가 겹치지 않는다. */
  nextId: number;
}

export const STORAGE_KEY = 'mini-react-todos';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '진행 중' },
  { value: 'done', label: '완료' },
];

/** 클래스가 없을 때는 빈 class 속성 대신 속성 자체를 만들지 않는다. */
const cls = (...names: (string | false)[]): Props => {
  const joined = names.filter(Boolean).join(' ');
  return joined ? { class: joined } : {};
};

function isTodo(value: unknown): value is Todo {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'number' && typeof v.text === 'string' && typeof v.done === 'boolean';
}

/** localStorage에서 복원한다. 없거나 손상되었거나 모양이 틀리면 빈 목록으로 시작한다. */
function loadData(): TodoData {
  const empty: TodoData = { todos: [], nextId: 1 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return empty;
    const { todos, nextId } = parsed as Record<string, unknown>;
    if (!Array.isArray(todos) || !todos.every(isTodo)) return empty;
    // id가 중복되면 목록의 key가 겹쳐 항목이 엉뚱한 노드를 재사용하므로 손상된 데이터로 본다.
    if (new Set(todos.map((t) => t.id)).size !== todos.length) return empty;
    const maxId = todos.reduce((max, t) => Math.max(max, t.id), 0);
    return { todos, nextId: typeof nextId === 'number' ? Math.max(nextId, maxId + 1) : maxId + 1 };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// 자식 컴포넌트: state 없이 props만 받는 순수 함수다. 훅은 쓰지 않는다.
// ---------------------------------------------------------------------------

function AddForm(props: Props): VNode {
  const { draft, onSubmit, onInput } = props as { draft: string; onSubmit: EventListener; onInput: EventListener };
  return h(
    'form',
    { class: 'add', onSubmit },
    h('input', { type: 'text', name: 'draft', value: draft, placeholder: '할 일을 입력하세요', 'aria-label': '새 할 일', onInput }),
    h('button', { type: 'submit', class: 'primary' }, '추가'),
  );
}

function SearchBox(props: Props): VNode {
  const { query, onInput } = props as { query: string; onInput: EventListener };
  return h('input', { type: 'search', name: 'query', value: query, placeholder: '검색', 'aria-label': '검색', onInput });
}

function Filters(props: Props): VNode {
  const { filter, onClick } = props as { filter: Filter; onClick: EventListener };
  return h(
    'div',
    { class: 'filters', role: 'group', onClick },
    FILTERS.map((f) =>
      h(
        'button',
        { key: f.value, type: 'button', 'data-filter': f.value, 'aria-pressed': String(filter === f.value), ...cls(filter === f.value && 'active') },
        f.label,
      ),
    ),
  );
}

function TodoItem(props: Props): VNode {
  const { todo } = props as { todo: Todo };
  return h(
    'li',
    { key: todo.id, 'data-id': todo.id, ...cls(todo.done && 'done') },
    h('input', { type: 'checkbox', checked: todo.done, 'data-action': 'toggle', 'aria-label': `${todo.text} 완료` }),
    h('span', { class: 'text' }, todo.text),
    h('button', { type: 'button', 'data-action': 'delete', 'aria-label': `${todo.text} 삭제` }, '삭제'),
  );
}

function TodoList(props: Props): VNode {
  const { todos, total, onClick } = props as { todos: Todo[]; total: number; onClick: EventListener };
  return h(
    'div',
    { class: 'list' },
    // 항목 클릭은 ul 하나에서 이벤트 위임으로 처리한다. 항목마다 핸들러를 만들면 렌더마다 새 함수가 생겨
    // diff가 모든 항목에 PROPS 패치를 내기 때문이다.
    h('ul', { onClick }, todos.map((todo) => h(TodoItem, { key: todo.id, todo }))),
    todos.length === 0 && h('p', { class: 'empty' }, total === 0 ? '할 일이 없습니다.' : '조건에 맞는 항목이 없습니다.'),
  );
}

function Summary(props: Props): VNode {
  const { total, active, done, onClearDone } = props as {
    total: number;
    active: number;
    done: number;
    onClearDone: EventListener;
  };
  return h(
    'footer',
    { class: 'summary' },
    h('p', { class: 'stats' }, h('span', null, `전체 ${total}`), ' · ', h('span', null, `진행 중 ${active}`), ' · ', h('span', null, `완료 ${done}`)),
    h('button', { type: 'button', class: 'clear-done', disabled: done === 0, onClick: onClearDone }, '완료 항목 지우기'),
  );
}

// ---------------------------------------------------------------------------
// 루트 컴포넌트: 상태와 훅은 여기에만 있다.
// ---------------------------------------------------------------------------

export function TodoApp(): VNode {
  const [data, setData] = useState<TodoData>(loadData);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  // 핸들러는 렌더마다 새로 만들면 diff가 "props가 바뀌었다"고 판단해 불필요한 PROPS 패치를 낸다.
  // 그래서 한 번만 만들어 재사용한다 (useCallback이 하는 일을 useMemo로 한다).
  // setter는 참조가 안정적이고 함수형 업데이트로 최신 값을 읽으므로 오래된 클로저 문제가 없다.
  const handlers = useMemo(
    () => ({
      onDraftInput: (e: Event) => setDraft((e.target as HTMLInputElement).value),
      onQueryInput: (e: Event) => setQuery((e.target as HTMLInputElement).value),
      onSubmit: (e: Event) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        const text = (form.elements.namedItem('draft') as HTMLInputElement).value.trim();
        if (!text) return;
        setData((d) => ({ todos: [...d.todos, { id: d.nextId, text, done: false }], nextId: d.nextId + 1 }));
        setDraft('');
      },
      onListClick: (e: Event) => {
        const target = (e.target as Element).closest('[data-action]');
        const id = Number(target?.closest('li[data-id]')?.getAttribute('data-id'));
        if (!target || Number.isNaN(id)) return;
        const action = target.getAttribute('data-action');
        if (action === 'toggle') {
          setData((d) => ({ ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
        } else if (action === 'delete') {
          setData((d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) }));
        }
      },
      onFilterClick: (e: Event) => {
        const value = (e.target as Element).closest('button[data-filter]')?.getAttribute('data-filter');
        if (FILTERS.some((f) => f.value === value)) setFilter(value as Filter);
      },
      onClearDone: () => setData((d) => ({ ...d, todos: d.todos.filter((t) => !t.done) })),
    }),
    [],
  );

  // 파생 데이터는 useMemo로 계산한다. 입력창만 바뀌는 렌더에서는 다시 계산하지 않는다.
  const stats = useMemo(() => {
    const done = data.todos.filter((t) => t.done).length;
    return { total: data.todos.length, active: data.todos.length - done, done };
  }, [data.todos]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.todos.filter(
      (t) => (filter === 'all' || (filter === 'done') === t.done) && t.text.toLowerCase().includes(q),
    );
  }, [data.todos, filter, query]);

  // 부수 효과: 렌더가 화면에 반영된 뒤에 저장하고 문서 제목을 맞춘다.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 저장만 건너뛴다.
    }
  }, [data]);

  useEffect(() => {
    document.title = `Todo (${stats.active}개 남음)`;
  }, [stats.active]);

  return h(
    'div',
    { class: 'todo-app' },
    h('h1', null, 'Todo'),
    h(AddForm, { draft, onSubmit: handlers.onSubmit, onInput: handlers.onDraftInput }),
    h(SearchBox, { query, onInput: handlers.onQueryInput }),
    h(Filters, { filter, onClick: handlers.onFilterClick }),
    h(TodoList, { todos: visible, total: stats.total, onClick: handlers.onListClick }),
    h(Summary, { ...stats, onClearDone: handlers.onClearDone }),
  );
}

/** 컨테이너에 Todo 앱을 마운트한다. */
export function mountApp(container: Element, options: FunctionComponentOptions = {}): FunctionComponent {
  const app = new FunctionComponent(TodoApp, container, {}, options);
  app.mount();
  return app;
}
