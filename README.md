# Mini React

React·Vue 같은 UI 프레임워크 없이 **Vanilla TypeScript**로 만든 작은 Virtual DOM 라이브러리입니다.
"상태가 바뀌면 화면의 **바뀐 부분만** 고친다"가 어떻게 가능한지, 그 핵심을 직접 구현하며 이해하는 것이 목적입니다.

- **Phase 1** — Virtual DOM, `diff`, `patch`, key 기반 재정렬(`MOVE`), undo/redo
- **Phase 2** — `FunctionComponent`, `useState` · `useMemo` · `useEffect`, batching
- **시각화** — 어떤 패치가 적용되었는지 로그로 보여 주고, 건드린 DOM 노드를 깜빡여 표시

TypeScript · Vite · Vitest(jsdom)만 사용합니다. JSX는 쓰지 않고 `h()` 함수로 작성합니다.

## 실행하기

```bash
npm install
npm run dev          # 개발 서버. / 는 Phase 1, /app.html 은 Phase 2
npm test             # 단위·통합·fuzz 테스트 (watch: npm run test:watch)
npm run typecheck    # tsc --noEmit
npm run build        # 타입체크 후 vite build → dist/
```

| 페이지 | 할 수 있는 것 |
|---|---|
| `/` (Phase 1) | **테스트 영역**을 직접 편집하거나 툴바로 태그를 추가·삭제 → **Patch**를 누르면 이전 VDOM과 비교해 바뀐 부분만 **실제 영역**에 반영. 뒤로/앞으로로 이력 이동. 아래 패치 로그와 하이라이트로 무엇이 바뀌었는지 확인 |
| `/app.html` (Phase 2) | 훅으로 만든 Todo 앱(추가·완료·삭제·필터·검색, localStorage 저장). 상태가 바뀔 때마다 patch가 몇 개, 어느 노드에 적용되는지 로그로 확인 |

## 어떻게 동작하나

```
             (Phase 1)                                   (Phase 2)
 실제 DOM ──fromDOM──► VNode                  setState ──► 렌더 함수 실행 ──► 새 VNode
                         │                                                    │
                         ▼                                                    ▼
              diff(이전 VNode, 새 VNode)  ◄──────── 같은 모듈 재사용 ────────┘
                         │
                         ▼
                  Patch[]  (CREATE · REMOVE · REPLACE · TEXT · PROPS · MOVE)
                         │
                         ▼
             patch(container, patches) ──► 실제 DOM에 변경분만 적용 ──► useEffect 실행
```

### 1. VNode와 `h()` (`src/vdom`)
- DOM 노드를 가볍게 표현한 일반 객체입니다. 엘리먼트는 `{ type, props, children, key }`, 텍스트는 `{ type: '#text', text }`.
- `h(type, props, ...children)`이 `null`·`undefined`·boolean·빈 문자열을 지우고, 중첩 배열을 펴고, 숫자를 텍스트로 바꾸고, 인접 텍스트를 합칩니다(**정규화**). `fromDOM`도 같은 규칙을 적용하므로 `DOM → VNode → DOM` 왕복이 일치합니다.
- `fromDOM`은 `<script>`·주석을 버리고 `on*` 속성을 무시하며, 사용자가 입력한 현재 상태는 attribute가 아니라 **property**(`input.value`/`checked`, `select.value`)에서 읽습니다. `createDOM`은 SVG·`foreignObject` 네임스페이스를 처리합니다.

### 2. `diff` — 순수 함수 (`src/diff/diff.ts`)
`diff(oldV, newV) → Patch[]`. DOM을 읽지도 쓰지도 않고 입력도 바꾸지 않습니다.

| 패치 | 발생 조건 |
|---|---|
| `CREATE` / `REMOVE` | old에 없거나 new에 없음 |
| `REPLACE` | `type`이 다름 → 서브트리를 통째로 교체(자식은 비교하지 않음) |
| `TEXT` | 텍스트 내용이 다름 |
| `PROPS` | 같은 `type`에서 속성 추가·변경·삭제 (`set`, `remove`) |
| `MOVE` | key가 있는 형제의 순서가 바뀜 |

- 패치는 루트에서의 자식 인덱스 배열(`path`)로 위치를 가리키고, **반환된 순서대로 적용하면 맞도록** 정렬됩니다(같은 부모의 `REMOVE`는 뒤 인덱스부터).
- props 비교: `style` 같은 일반 객체·배열은 내용으로, 함수(이벤트 핸들러)는 참조로 비교합니다.
- **key 기반 비교**: 형제 중 key가 있으면 key로 짝을 짓고, **최장 증가 부분수열(LIS)**에 속한 노드는 제자리에 두고 나머지만 옮깁니다. 맨 앞 항목을 맨 뒤로 보내도 `MOVE`는 한 번입니다. key가 없으면 인덱스 기준입니다.

### 3. `patch` (`src/diff/patch.ts`)
패치를 DOM에 적용하되 **노드를 최대한 재사용**합니다. 속성·텍스트만 바뀐 노드는 같은 객체로 남고, `MOVE`는 `insertBefore`로 노드를 옮깁니다. 그래서 입력창의 **포커스·커서·입력 중인 값**이 유지됩니다. 새 노드는 부모의 네임스페이스를 이어받고, `select`의 `value`는 option이 생긴 뒤에 적용합니다. 변경이 일어난 노드 목록을 돌려줘서 시각화에 쓰입니다.

### 4. history (`src/history`)
상태를 복사하지 않고 참조만 쌓는 제네릭 undo/redo 스택. VNode는 불변 스냅샷으로 다루므로 싸게 되돌릴 수 있습니다. 되돌린 뒤 새로 편집하면 redo 기록이 사라지고, 경계에서의 undo/redo는 무시됩니다.

### 5. `FunctionComponent`와 훅 (`src/core`)
> "함수는 매번 새로 실행되는데, 상태는 어떻게 유지되는가?"

- 컴포넌트는 `(props) => VNode`인 함수입니다. 상태는 함수 안이 아니라 **컴포넌트 인스턴스의 `hooks[]` 배열에 호출 순서(index)로** 저장됩니다. 렌더 중에는 "지금 렌더 중인 컴포넌트"를 모듈 전역으로 알려 두고, 훅은 이를 통해 자기 슬롯을 찾습니다.
- 업데이트는 항상 `새 VNode 생성 → diff(prev, next) → patch → useEffect 실행`입니다. **Phase 1의 모듈을 그대로 재사용**합니다.
- `useState`: 함수형 업데이트, `Object.is` 동일값 무시. `setState`는 dirty 플래그만 세우고 `queueMicrotask`로 `update()`를 한 번만 예약하므로 **한 틱 안의 여러 `setState`는 렌더 한 번**으로 합쳐집니다(batching).
- `useMemo`: deps를 `Object.is`로 얕게 비교해 캐시. `useEffect`: DOM에 반영된 뒤 실행, deps가 바뀐 렌더에서만, 다시 실행하기 전에 이전 cleanup을 먼저, `unmount` 때 cleanup.
- **규칙을 강제합니다.** 훅은 루트 컴포넌트에서만 쓸 수 있고(자식은 state 없이 props만 받는 순수 함수), 렌더마다 훅의 순서·개수가 달라지면 commit 전에 에러를 던져 DOM을 이전 상태로 유지합니다.

## 왜 Virtual DOM인가 — Reflow와 Repaint

DOM을 바꾸면 브라우저는 필요에 따라 **Reflow**(레이아웃 재계산)와 **Repaint**(다시 그리기)를 수행합니다. 상태가 바뀔 때마다 DOM을 통째로 다시 만들면 비용도 크고, 입력창의 포커스·스크롤·선택 상태까지 사라집니다.

Virtual DOM은 객체끼리 비교하는 싼 계산으로 **무엇이 바뀌었는지**를 먼저 알아낸 뒤, 실제 DOM에는 그 부분만 반영합니다. 손으로 최적화한 DOM 조작보다 빠르다는 뜻은 아닙니다. 상태 → 화면을 **선언적으로** 쓰면서도 변경을 최소로 유지해 주는 도구입니다. 데모의 하이라이트 애니메이션이 `background-color`/`box-shadow`만 바꾸는 것도 같은 맥락입니다. 재생 중에는 레이아웃을 건드리지 않아 주변 요소를 밀어내지 않습니다(다만 애니메이션을 재시작하려고 시작 시점에 리플로우를 한 번 강제하므로 "Reflow가 전혀 없다"는 뜻은 아닙니다).

## 실제 React와의 차이

| 주제 | 이 프로젝트 | 실제 React |
|---|---|---|
| 조정(reconcile) | 재귀 diff 한 번, 동기 | Fiber 아키텍처, 작업 단위로 쪼개 중단·재개·우선순위 처리 |
| 배치 | `queueMicrotask`로 한 틱 안의 setState를 합침 | 우선순위 기반 스케줄러, 이벤트 종류별 처리 |
| 재정렬 | key + LIS로 최소 이동 (key가 유일한 형제 기준) | key 맵과 `lastPlacedIndex` 휴리스틱 |
| props 비교 | 일반 객체·배열은 **내용** 비교, 함수는 참조 | 요소의 props는 참조로 다루고 `style`만 필드 단위 diff |
| 이벤트 | 네이티브 `addEventListener`, 실제 DOM 노드에 직접 | 루트에 위임하는 합성 이벤트(SyntheticEvent) |
| `useEffect` 타이밍 | commit 직후 **동기** 실행 (`useLayoutEffect`에 가까움) | 화면이 그려진 뒤(paint 이후) 실행 |
| 훅 | `useState`, `useMemo`, `useEffect` | `useRef`, `useCallback`, `useReducer`, `useContext` 등 다수 |
| 기타 | JSX 없음, 클래스 컴포넌트·Context·Portal·Suspense·Error Boundary·Strict Mode 없음 | 있음 |
| 훅 규칙 | 렌더 중 즉시 에러로 강제 | 린트 규칙 + 개발 모드 경고 |

## 폴더 구조

```
mini_react/
├─ index.html · app.html        # Phase 1 / Phase 2 데모 페이지
├─ src/
│  ├─ vdom/     types · h · fromDOM · createDOM · props
│  ├─ diff/     diff(순수 함수) · patch(DOM 적용)
│  ├─ history/  undo/redo 스택
│  ├─ core/     FunctionComponent · hooks · render(resolveTree) · context
│  ├─ demo/     phase1 · app(Todo) · patchLog(로그·하이라이트)
│  └─ styles/
└─ tests/       # src와 1:1 대응
```
각 폴더의 `README.md`에 그 폴더가 **왜 필요한지, 동작 원리, 설계 결정, 의도적 한계**가 있습니다.

## 만든 방식

- **TDD.** 세션마다 실패하는 테스트를 먼저 커밋하고(Red), 그다음 구현 커밋을 했습니다. 세션(S0~S10)은 테스트와 타입체크 게이트를 통과해야 다음으로 넘어갔습니다.
- **fuzz 테스트.** 시드 기반 난수로 랜덤 트리 약 3,000쌍에서 "patch 결과 == 새 트리를 렌더한 것"을 확인합니다(key 중복·혼합 목록·깊은 중첩·큰 목록 포함). 실패하면 시드가 출력되어 재현할 수 있습니다.
- **변이 검증.** 핵심 로직을 일부러 망가뜨려(LIS 제거, 배치 가드 제거, deps 비교 무력화 등) 테스트가 실제로 잡는지 확인했습니다.
- **독립 검증.** 각 세션이 끝나면 읽기 전용 에이전트(`session-verifier`)가 게이트·규칙·로직을 따로 검토했고, 지적된 결함(effect 안에서 `unmount`할 때의 cleanup 누수, 첫 렌더 실패 후 재시도 등)은 재현 테스트를 먼저 쓰고 고쳤습니다.

세션별 브랜치 (각 브랜치는 앞 세션 위에 쌓여 있습니다. `main`에는 프로젝트 규칙 문서와 검증 에이전트만 있습니다):

| 브랜치 | 내용 |
|---|---|
| `s0-setup` | Vite + TS + Vitest(jsdom) |
| `s1-h` | VNode 타입, `h()` |
| `s2-dom-convert` | `fromDOM` / `createDOM` / `props` |
| `s3-diff` | `diff` 5가지 케이스 |
| `s4-patch` | `patch` 적용 |
| `s5-keyed` | key 기반 diff(`MOVE`) + fuzz |
| `s6-history` | history + Phase 1 데모 |
| `s7-usestate` | `FunctionComponent` + `useState` + batching |
| `s8-memo-effect` | `useMemo` / `useEffect` / unmount / 훅 제약 |
| `s9-todo` | Phase 2 Todo 데모 + 통합 |
| `s10-visualize` | 패치 로그·하이라이트, 최종 README |

## 알려진 한계

- 단일 루트 컴포넌트만 지원하고 컴포넌트 트리 전체가 한 번에 다시 렌더됩니다(부분 갱신 없음).
- key 없는 노드(텍스트 포함)는 인덱스로 식별되므로, key 있는 항목이 앞에 끼면 뒤쪽의 key 없는 노드는 재사용되지 않습니다.
- 렌더 도중의 무조건적인 `setState`나 잘못된 deps는 무한 렌더로 이어질 수 있고 막지 않습니다.
- 한글 IME 조합 중 리렌더, 실제 브라우저에서의 커서 위치 유지, 애니메이션 모양은 jsdom 테스트로 검증하지 못했습니다.
