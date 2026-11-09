# demo — 데모 페이지

## S6 — Phase 1 데모 (`phase1.ts`, `index.html`)

### 왜 필요한가
- 앞에서 만든 `fromDOM` → `diff` → `patch` → `History`가 실제로 맞물려 동작하는지 눈으로 확인하는 페이지다. "변경된 부분만 DOM에 반영된다"는 Virtual DOM의 핵심을 직접 체험할 수 있다.

### 화면 구성
| 영역 | 역할 |
|---|---|
| 실제 영역 | patch로만 바뀌는 영역. 변경 없는 노드는 그대로 유지된다 |
| 테스트 영역 | `contenteditable`. 사용자가 직접 고치거나 툴바로 태그를 추가·삭제한다 |
| Patch / 뒤로 / 앞으로 | Patch는 변경분을 실제 영역에 반영하고 history에 저장. 뒤로·앞으로는 history 이동. 이동할 수 없으면 `disabled` |

### 동작 흐름
1. **초기화.** 실제 영역을 `fromDOMChildren`으로 읽어 루트 VNode로 감싼다. 실제 영역을 이 VNode로 다시 렌더하고, 테스트 영역에도 같은 내용을 렌더한다. 이 VNode가 history의 첫 상태다.
2. **Patch.** `fromDOMChildren(테스트 영역)`을 새 루트 VNode로 만들고, 실제 영역에 보이는 VNode와 `diff`한다. 패치가 없으면 아무것도 하지 않는다(history에도 쌓지 않는다). 있으면 실제 영역에 `patch`하고 history에 push한다.
3. **뒤로/앞으로.** history의 상태로 이동한다. 실제 영역은 지금 보이는 VNode와 이동할 VNode를 `diff`/`patch`해서 **바뀐 부분만** 고치고, 테스트 영역은 그 상태로 통째로 다시 렌더한다.

### 설계 결정
- **루트 래퍼.** `patch`는 루트 VNode 하나를 전제로 한다. 영역의 자식이 여러 개일 수 있으므로 `div[data-root]`로 감싸 하나의 루트로 만든다. 실제 영역에는 래퍼째 렌더하고 CSS `display: contents`로 레이아웃 영향을 없앤다. 테스트 영역은 사용자가 편집하는 영역 그 자체여야 하므로 래퍼 없이 자식만 렌더한다. 비교는 항상 `fromDOMChildren`으로 읽은 자식들을 같은 래퍼로 감싸 하므로 두 영역의 래퍼 차이는 diff에 나타나지 않는다.
- **실제 영역의 VNode를 따로 기억한다.** `History.current`는 이동한 뒤의 상태라서, 이동 전 상태를 알려면 실제 영역에 지금 보이는 VNode(`shown`)를 따로 들고 있어야 `diff`를 낼 수 있다.
- **뒤로 갈 때 테스트 영역의 저장되지 않은 편집은 버린다.** 편집 내용과 history 상태를 합치는 것은 모호하고 위험하다. "마지막으로 Patch한 상태로 돌아간다"는 단순한 규칙을 택했다.
- **툴바는 테스트 영역의 DOM만 편집한다.** 실제 영역에는 반드시 Patch를 눌러야 반영된다. 사용자가 편집한 것과 같은 경로(`fromDOM` → `diff`)를 타기 때문에, 툴바와 직접 편집을 구분할 필요가 없다.
- **`onPatch` 콜백.** patch가 적용될 때마다 패치 목록을 넘겨준다. 패치 로그 시각화(S10)가 이 콜백에 붙는다.
- **`script`는 반영되지 않는다.** `fromDOM`이 `script`를 버리므로, 테스트 영역에 주입해도 실제 영역에 나타나지 않는다.
- **테스트 가능한 구조.** `Phase1` 클래스는 요소를 인자로 받고 `destroy()`로 리스너를 정리한다. 문서의 id 규약을 찾아 연결하는 `mountPhase1(document)`는 얇은 래퍼이고, 페이지 진입점(`phase1Entry.ts`)은 이것만 호출한다. 그래서 jsdom에서 페이지 없이 동작을 검증할 수 있다.

### 한계 (의도적)
- 사용자가 `contenteditable`에서 만든 브라우저별 마크업(예: Enter 키의 `<div>`/`<br>`)은 그대로 VNode로 읽힌다. 정리(normalize)하지 않는다.
- 커서(선택 영역) 위치는 복원하지 않는다. 뒤로/앞으로로 테스트 영역을 다시 렌더하면 커서가 사라진다.

---

## S9 — Phase 2 Todo 데모 (`app.ts`, `app.html`)

### 왜 필요한가
- S7·S8에서 만든 `FunctionComponent`와 훅이 실제 앱에서 맞물려 동작하는지, 그리고 "상태가 바뀌면 **변경된 노드만** DOM에 반영된다"는 핵심이 지켜지는지 확인하는 페이지다.

### 구조: 상태는 루트에만, 자식은 순수 함수
```
TodoApp (루트: useState ×4, useMemo ×3, useEffect ×2)
 ├─ AddForm      draft, onSubmit, onInput
 ├─ SearchBox    query, onInput
 ├─ Filters      filter, onClick
 ├─ TodoList     todos, total, onClick
 │   └─ TodoItem (key = todo.id)
 └─ Summary      total/active/done, onClearDone
```
- 훅은 `TodoApp`에서만 호출한다. 자식은 props를 받아 VNode를 돌려주는 순수 함수이고, 자식에서 훅을 부르면 마운트 시점에 에러가 난다(S7).
- **상태**: `data`(`todos` + `nextId`), `draft`(추가 입력창), `filter`, `query`.
- **`useMemo`**: `stats`(전체/진행/완료 개수)와 `visible`(필터·검색을 적용한 목록)은 deps가 같으면 다시 계산하지 않는다. 입력창에 글자를 칠 때마다 전체 목록을 다시 거르지 않는다.
- **`useEffect`**: ① `data`가 바뀔 때만 `localStorage`에 저장, ② 남은 항목 수가 바뀔 때만 `document.title` 갱신. 둘 다 DOM에 반영된 **뒤에** 실행된다.

### 설계 결정
- **핸들러를 안정된 참조로 유지한다.** 렌더 함수는 매번 다시 실행되므로 `onClick: () => ...`처럼 쓰면 렌더마다 새 함수가 만들어진다. diff는 함수를 **참조로** 비교하므로(S3) 모든 항목에서 "props가 바뀌었다"고 판단해 불필요한 `PROPS` 패치가 쏟아진다. 그래서 핸들러를 `useMemo(() => ({ ... }), [])`로 한 번만 만든다. (`useCallback`이 하는 일을 `useMemo`로 한다.) setter는 참조가 안정적이고 함수형 업데이트로 최신 값을 읽으므로 오래된 클로저 문제가 없다.
- **이벤트 위임.** 항목마다 `onClick`을 달면 항목별 핸들러가 필요하고, 그러면 `todo.id`를 캡처한 새 함수가 렌더마다 생긴다. 대신 `ul` 하나에 핸들러를 달고 `data-action`/`data-id` 속성으로 대상을 찾는다. 필터 버튼도 같은 방식(`data-filter`)이다.
- **`key = todo.id`.** 삭제·필터 변경으로 항목이 빠져도 나머지 `li` 노드가 재사용된다. `nextId`를 저장해 삭제해도 id가 겹치지 않는다.
- **입력창은 제어 컴포넌트다.** `value`는 `draft` 상태에서 오고, `onInput`이 상태를 갱신한다. 렌더 후 `patch`는 같은 `input` 노드의 `value` property만 갱신하므로 **포커스와 커서가 유지된다.** 추가 후 `setDraft('')`로 비운다.
- **제출은 폼 `submit`.** Enter와 버튼이 같은 경로이고, `preventDefault`로 페이지 이동을 막는다. 입력값은 폼 요소에서 직접 읽는다. 핸들러가 안정된 참조라 `draft` 상태를 클로저로 볼 수 없기 때문이다.
- **저장 데이터를 믿지 않는다.** `loadData`는 JSON 파싱 실패·모양 불일치·**id 중복**(key가 겹치므로) 시 빈 목록으로 시작하고, `nextId`가 기존 최대 id보다 작으면 올려서 key 충돌을 막는다.
- **텍스트는 텍스트로만 들어간다.** 사용자가 `<img onerror=...>`를 입력해도 `createDOM`이 텍스트 노드로 만들므로 HTML로 해석되지 않는다.

### 검증 방법 (`tests/demo/app.test.ts`)
"변경된 노드만 patch"는 세 가지로 교차 확인한다.
1. **노드 identity**: 상태 변경 전후로 다른 `li`가 같은 객체다.
2. **패치 종류**: `onPatch`로 받은 패치가 완료 토글이면 `PROPS`/`TEXT`뿐, 추가면 `CREATE` 하나, 삭제면 `REMOVE` 하나다.
3. **실제 DOM 변경**: `MutationObserver`로 모은 변경 레코드 중 다른 항목 안쪽을 건드린 것이 없다.

또한 리렌더 후 핸들러 관련 `PROPS`(`on*`)가 나오지 않는 것, 입력 중 같은 `input` 노드와 포커스·값이 유지되는 것, 같은 필터를 다시 눌러도(값이 같은 setState) 패치가 없는 것을 확인한다.

### 테스트 환경 보정 (`tests/setup.ts`)
Node 25+는 `--localstorage-file` 없이는 전역 `localStorage`를 `undefined`로 막아 두고 jsdom 것까지 가린다. 실제 브라우저에서는 문제가 없으므로, 테스트에서만 메모리 기반 `Storage`를 설치한다. 앱 코드는 이 보정을 모른다.

### 한계 (의도적)
- 목록 정렬·편집·드래그 이동은 없다. 재정렬이 일어나는 경우의 `MOVE`는 diff 단위 테스트(S5)에서 검증한다.
- 저장은 `localStorage`뿐이고, 여러 탭 간 동기화(`storage` 이벤트)는 처리하지 않는다.
- 이벤트 위임은 `closest()`로 대상을 찾으므로, 항목 안에 다른 `data-action` 요소를 중첩하면 가장 가까운 것이 선택된다.

---

## S10 — 패치 로그와 하이라이트 시각화 (`patchLog.ts`)

### 왜 필요한가
- Virtual DOM의 핵심은 눈에 보이지 않는다. "무엇이 바뀌어서 DOM의 어느 부분만 고쳤는지"를 직접 보여 주어야 diff/patch가 정말 **바뀐 부분만** 건드린다는 것이 체감된다.
- 두 가지를 보여 준다: ① **로그** — 어떤 패치가 몇 개, 어떤 경로에 적용되었는지 ② **하이라이트** — 실제 DOM에서 patch가 건드린 노드를 잠깐 깜빡이게 한다.

### 데이터 흐름
```
patch(container, patches) ──► 건드린 노드 목록(Node[]) 반환
        │
FunctionComponent / Phase1  ──► onPatch(patches, touched[, source])
        │
   ┌────┴─────┐
PatchLog.record   highlightNodes(touched)
   (로그 패널)        (깜빡임)
```
- `patch()`는 이제 **변경이 일어난 노드**를 반환한다(S4의 반환 타입이 `void`에서 `Node[]`로 확장, 기존 호출부는 영향 없음). CREATE/REPLACE/MOVE는 새로 들어오거나 옮겨진 노드, TEXT는 텍스트 노드, PROPS는 요소, REMOVE는 자식이 사라진 **부모 요소**다. 사라진 노드는 더 이상 화면에 없으니 "어디서 사라졌는지"를 부모로 알려 준다.
- `onPatch`에 두 번째 인자 `touched`(와 `Phase1`은 세 번째 인자 `source`: `'Patch' | '뒤로' | '앞으로'`)를 더했다. 기존처럼 첫 인자만 받아도 된다.
- `Phase1`의 뒤로/앞으로는 이제 변경이 없으면(빈 패치) `onPatch`를 호출하지 않는다. `FunctionComponent`와 같은 규칙이라 빈 항목이 로그에 쌓이지 않는다.

### `describePatch` / `summarizePatches`
패치를 한 줄로 설명한다.

| 패치 | 예시 |
|---|---|
| CREATE | `CREATE [0, 2] <li>` |
| REMOVE | `REMOVE [1]` |
| REPLACE | `REPLACE [0] → <section>` |
| TEXT | `TEXT [0, 1] → "새 텍스트"` |
| PROPS | `PROPS [1] class="b" tabindex=3 onClick=ƒ -title` |
| MOVE | `MOVE [2] → 0` |

경로는 루트에서의 자식 인덱스(`[]`는 루트), 텍스트·문자열 값은 24자에서 줄이고 줄바꿈은 `\n`으로 보이게 한다. 함수는 `ƒ`, 객체는 JSON, 삭제된 속성은 `-이름`이다. 요약은 `CREATE 1 · TEXT 2`처럼 고정된 순서로 센다.

### `PatchLog`
- 최신 항목이 위에 쌓이고(번호 `#N`, 출처, 시각), 최대 `maxEntries`(기본 50)개를 넘으면 오래된 것부터 버린다. 지우기 버튼이 있고, 지워도 번호는 이어서 센다.
- **패치 내용은 항상 `textContent`로만 넣는다.** 패치의 텍스트·속성 값에는 사용자 입력이 섞여 있다(Todo에 `<img onerror=…>`를 입력할 수 있다). `innerHTML`을 쓰면 로그 패널이 XSS 통로가 되므로 테스트로 막았다.
- **색에만 의존하지 않는다.** 패치 종류는 색 배지와 함께 `TEXT`, `CREATE` 같은 **글자**로도 표시한다.

### `highlightNodes`
- 요소는 그대로, **텍스트 노드는 부모 요소**를 강조한다(텍스트 노드에는 스타일을 줄 수 없다). DOM에서 떨어진 노드와 부모 없는 텍스트 노드는 건너뛴다.
- 같은 요소를 다시 하이라이트하면 **타이머를 갱신**한다. 갱신하지 않으면 첫 번째 타이머가 일찍 클래스를 떼어 두 번째 깜빡임이 짧게 끊긴다. 클래스를 뗐다 붙이며 리플로우를 한 번 강제해 CSS 애니메이션도 처음부터 다시 재생한다.
- 반환값은 즉시 모두 떼는 함수다. 요소가 하이라이트 도중 제거되어도 에러가 없다.
- 애니메이션은 `background-color`/`box-shadow`만 바꾼다. 레이아웃에 영향을 주는 속성이 아니라서 **Reflow 없이 Repaint만** 일으킨다(시각화 때문에 측정하려는 대상이 흐트러지지 않게). `prefers-reduced-motion`이면 애니메이션 대신 윤곽선만 보여 준다.

### 한계 (의도적)
- 하이라이트는 "이번 patch가 건드린 노드"를 보여 줄 뿐, 그 안에서 어떤 속성이 바뀌었는지까지는 로그를 봐야 한다.
- 로그는 메모리에만 있고 새로고침하면 사라진다.
- 시각화는 사람이 보는 용도라, 실제 브라우저에서의 모양(애니메이션 타이밍, 색 대비)은 jsdom 테스트로 검증하지 못한다. 스타일은 빌드와 개발 서버 서빙까지만 확인했다.
