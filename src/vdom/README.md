# vdom — Virtual DOM

## 왜 Virtual DOM인가
- 실제 DOM 조작은 비싸다. 속성이나 구조가 바뀌면 브라우저가 **Reflow**(레이아웃 재계산)와 **Repaint**(다시 그리기)를 일으킬 수 있고, 이를 여러 번 반복하면 느려진다.
- Virtual DOM은 DOM 구조를 가볍게 표현한 일반 JS 객체 트리다. 객체끼리 비교하는 것은 싸므로, 먼저 **무엇이 바뀌었는지** 계산하고 실제 DOM에는 **바뀐 부분만** 반영한다. (diff/patch는 `src/diff`에서 다룬다)

## VNode 구조 (`types.ts`)
| 종류 | 형태 | 설명 |
|---|---|---|
| TextVNode | `{ type: '#text', text }` | 텍스트 노드 |
| ElementVNode | `{ type, props, children, key }` | 엘리먼트. `type`은 태그명(string) 또는 함수형 컴포넌트 |

- `key`는 `props`에서 분리해 따로 둔다. 리스트에서 같은 항목을 식별(재정렬 시 노드 재사용)하는 용도라서 DOM 속성으로 나가면 안 된다.
- `FunctionalComponent = (props) => VNode`. 자식 컴포넌트는 state 없이 props만 받는 순수 함수다.

## `h(type, props, ...children)` (`h.ts`)
JSX가 컴파일되면 결과가 되는 호출 형태를 직접 쓰는 것이다. VNode를 만들면서 children을 **정규화**한다.

| 규칙 | 이유 |
|---|---|
| `null`/`undefined`/boolean 제거 | `cond && <X/>` 같은 조건부 렌더링 지원 |
| 중첩 배열 flatten | `items.map(...)` 결과를 그대로 children으로 쓰기 위해 |
| 숫자 → 텍스트 (`0`은 유지) | DOM에는 문자열만 존재 |
| 빈 문자열 제거 | DOM에서 빈 텍스트 노드는 사라지므로 왕복 일치가 깨진다 |
| 인접 텍스트 병합 | `fromDOM`이 읽는 구조와 같게 맞추기 위해 |
| props 비변형 | 호출자의 객체를 건드리지 않는 순수성 |
| 객체 child는 `TypeError` | 잘못된 입력을 조용히 넘기지 않는다 |

핵심: **정규화는 한 곳(h)에서 하고, `fromDOM`도 같은 규칙을 따른다.** 그래야 `DOM → VDOM → DOM`이 항상 같은 결과가 된다.

---

