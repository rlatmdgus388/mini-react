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

# S2 — DOM ↔ VNode 변환 (`fromDOM.ts`, `createDOM.ts`, `props.ts`)

## 역할
```
실제 DOM ──fromDOM──▶ VNode ──createDOM──▶ 실제 DOM
```
Phase 1에서 "실제 영역/테스트 영역의 DOM을 읽어 VDOM으로 바꾸고(fromDOM), VDOM으로 DOM을 만든다(createDOM)". 핵심 요구는 **왕복해도 같은 결과**(멱등)이다.

## fromDOM — 무엇을 읽고 무엇을 버리는가
| 대상 | 처리 | 이유 |
|---|---|---|
| 주석, `<script>` | 버림 | 렌더 대상이 아니고, script는 XSS 위험 |
| `on*` 속성 | 버림 | 인라인 핸들러는 문자열 코드라 위험. 핸들러는 함수로만 다룬다 |
| 줄바꿈 포함 공백 전용 텍스트 | 버림 (`<pre>` 안에서는 보존) | HTML 들여쓰기는 의미 없는 잡음이라 diff를 오염시킨다 |
| 태그 사이 한 칸 공백 | 보존 | `<b>a</b> <i>b</i>`의 공백은 화면에 보인다 |
| 인접 텍스트 노드 | 병합 | `h()`와 같은 정규화로 맞춘다 |
| 불리언 attribute (`disabled`) | `true`로 정규화 | `disabled`와 `disabled=""`를 같은 값으로 보기 위해 |
| SVG 태그 | `localName` 그대로 | `viewBox`, `foreignObject`는 대소문자 구분 |

### attribute vs property
사용자가 입력창에 타이핑하면 DOM의 **attribute(`value="..."`)는 그대로고 property(`el.value`)만 바뀐다.** 그래서 "현재 상태"를 읽으려면 property를 봐야 한다.
- `input`: `value`(텍스트류), `checked`(checkbox/radio)를 property에서 읽는다.
- checkbox/radio/button 등은 `value`가 attribute 자체이므로 property를 읽지 않는다 (checkbox의 `.value`는 기본 `"on"`이라 읽으면 오염된다).
- `textarea`: `value`를 prop으로 읽고 자식 텍스트는 두지 않는다.

## createDOM — VNode → DOM
- 텍스트는 `createTextNode`로 만든다. **`innerHTML`을 쓰지 않아서** `<img onerror=...>` 같은 문자열도 텍스트로만 들어간다 (HTML 주입 차단).
- **네임스페이스**: `svg`부터 SVG 네임스페이스(`createElementNS`)로 만들고 자손이 상속한다. `foreignObject` 안쪽은 다시 HTML. `parentNs` 인자는 S4 patch가 새 노드를 만들 때 SVG 문맥을 이어받게 하려는 것이다.
- `type` prop을 가장 먼저 적용한다. `input.type`에 따라 `value`가 property인지 attribute인지 달라지기 때문이다.
- 함수형 컴포넌트 type은 에러로 거절한다. 컴포넌트는 S7에서 렌더(resolve)한 VNode만 DOM이 된다.

## props — 속성 적용 규칙 (`setProp`/`removeProp`)
- `null`/`undefined`/`false`는 "제거", `true`는 빈 attribute(`disabled=""`), 숫자는 문자열로 (`0`도 유효).
- `className`→`class`, `htmlFor`→`for` 별칭. `key`/`children`은 DOM으로 나가지 않는다.
- `style`: 문자열은 그대로, 객체는 `cssText`를 비우고 다시 채운다 → 다음 렌더에서 빠진 스타일이 남지 않는다.
- **이벤트**: `onClick` 같은 함수만 `addEventListener`로 등록하고, 같은 이벤트를 다시 설정하면 **이전 리스너를 먼저 제거**한다 (재렌더 시 핸들러 중복 방지). 문자열 값은 무시. 리스너는 `WeakMap<Element, Map>`에 보관해 요소가 사라지면 함께 정리된다.
- `value`/`checked`는 property로 설정한다. 제거 시 `''`/`false`로 되돌리고 초기 attribute도 지운다.

## 알려진 한계 (의도적)
- `<input value="init">`처럼 attribute로 초기값이 있는 입력창은 fromDOM→createDOM 후 property로만 설정되어 **HTML 직렬화 결과에는 `value` attribute가 사라진다.** 화면에 보이는 값은 같다.
- `select`는 단일 선택의 `value`만 왕복한다. 다중 선택(`multiple`)의 선택 상태와 `contenteditable` 같은 특수 속성은 일반 attribute로만 처리한다.
