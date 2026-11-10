# core — FunctionComponent와 Hooks

## S7 — `FunctionComponent` + `useState` (+ batching)

### 왜 필요한가 — "함수는 매번 새로 실행되는데 상태는 어떻게 유지되는가?"
- 컴포넌트는 `(props) => VNode`인 **함수**다. 렌더할 때마다 함수가 처음부터 다시 실행되고, 지역 변수는 실행이 끝나면 사라진다. 그런데 카운터의 `count`는 렌더가 반복돼도 이어져야 한다.
- 답은 **상태를 함수 밖, 컴포넌트 인스턴스에 두는 것**이다. `FunctionComponent` 인스턴스가 `hooks[]` 배열을 들고 있고, `useState`는 그 배열의 **몇 번째 칸**을 쓸지를 "호출 순서"로 정한다.

### 동작 원리
```
렌더 시작: hookIndex = 0
  useState(10) → hooks[0]  (없으면 만든다)   hookIndex = 1
  useState('a') → hooks[1]                   hookIndex = 2
렌더 끝
```
1. **렌더 컨텍스트.** 훅은 "지금 어느 컴포넌트가 렌더 중인지"를 알아야 한다. `context.ts`의 모듈 전역 `currentHost`가 이것이다. `withRootRender(host, fn)`이 렌더 함수를 실행하는 동안만 `currentHost`를 세팅하고, `finally`로 반드시 복구한다. 렌더 함수가 던져도 컨텍스트가 어긋나지 않는다.
2. **슬롯.** `useState`는 `hooks[hookIndex++]`를 찾아 없으면 `{ value, setState }`를 만들어 넣고, 있으면 그대로 돌려준다. 초기값은 **첫 렌더에만** 쓰이고, 함수형 초기값(`useState(() => expensive())`)은 첫 렌더에서만 호출된다.
3. **setter.** `setState(action)`는 `action`이 함수면 **가장 최근 값**을 넘겨 호출한다. 결과가 `Object.is`로 같으면 아무것도 하지 않는다(동일값 무시). 다르면 값을 즉시 슬롯에 쓰고 렌더를 예약한다. setter 참조는 슬롯을 만들 때 한 번 만들어지므로 렌더가 반복돼도 바뀌지 않는다. 그래서 이벤트 핸들러에서 쓰기 편하고, deps에 넣어도 안전하다.
4. **업데이트.** `update()`는 `hookIndex = 0`으로 되돌리고 렌더 함수를 실행해 새 VDOM을 만든 뒤, 자식 컴포넌트를 펼치고(`resolveTree`) `diff(prev, next)` → `patch(container, patches)` → `prev = next`를 수행한다. **Phase 1에서 만든 diff/patch를 그대로 재사용**한다. 첫 렌더도 `diff(null, next)` = `CREATE []`이므로 mount와 update가 같은 경로를 탄다.

### Batching
`setState`는 값을 바꾸고 **dirty 플래그만 세운다.** `schedule()`이 `queueMicrotask`로 `update()`를 예약하되, 이미 예약돼 있으면 아무것도 하지 않는다. 그래서 한 틱 안에서 `setA(); setB(); setC();`를 해도 렌더는 마이크로태스크에서 **한 번**만 일어난다. 클릭 핸들러가 여러 상태를 바꾸는 흔한 경우에 불필요한 중간 렌더와 patch를 막아 준다. 대신 `setState` 직후에는 DOM이 아직 바뀌지 않았다.

### 자식 컴포넌트 — `resolveTree` (`render.ts`)
- 자식 컴포넌트는 state 없이 props만 받는 **순수 함수**다. `h(Child, props, ...children)`은 `type`이 함수인 VNode가 되고, `diff`/`createDOM`은 문자열 type만 다루므로 비교 전에 `resolveTree`가 재귀적으로 펼친다. `children`은 `props.children`으로 전달된다.
- **Hook은 루트에서만.** 자식을 실행하는 동안은 `withChildRender`로 컨텍스트를 `child`로 바꾼다. 이때 훅을 부르면 "훅은 루트 컴포넌트에서만 사용할 수 있습니다"라는 에러를 던진다. 컴포넌트 밖에서 부르면 "렌더 중에만" 에러다.
- **key 전달.** `h(Item, { key })`의 key는 컴포넌트 VNode에 붙어 있다. 펼치면 컴포넌트 VNode는 사라지므로, 결과 루트에 key가 없으면 그쪽으로 옮긴다. 이걸 빼먹으면 컴포넌트 리스트를 재정렬해도 key 기반 diff(MOVE)가 동작하지 않는다.
- 컴포넌트가 텍스트 VNode를 반환해 인접 텍스트가 생기면 `normalizeChildren`으로 다시 합친다.

### 설계 결정
- **루트 하나, 컨테이너 모델.** `patch`와 같은 규약으로, 컨테이너의 첫 번째 자식이 루트 DOM이다. `mount()`는 컨테이너를 비우고 시작한다.
- **`update()`는 동기, `schedule()`은 비동기.** 직접 `update()`를 부르면 즉시 반영되고(테스트·`setProps`), `setState`를 통하면 배치된다. 반환값으로 적용한 패치를 돌려주고, `onPatch` 옵션으로도 받을 수 있다(S10 시각화용). 빈 패치면 `onPatch`는 호출하지 않는다.
- **렌더가 던지면 `prev`를 갱신하지 않는다.** DOM과 `prev`가 어긋나지 않는다.
- **인스턴스마다 `hooks[]`가 따로다.** 같은 렌더 함수를 두 번 마운트해도 상태가 섞이지 않는다.

### 한계 (의도적)
- 훅 개수·종류가 렌더마다 달라지는 것(조건부 훅)의 검증, `useMemo`, `useEffect`는 S8에서 다룬다.
- 렌더 도중의 `setState`는 별도로 처리하지 않는다. 같은 값이면 무시되지만, 매번 다른 값을 쓰면 렌더가 끝없이 예약될 수 있다.
- 마이크로태스크 배치라서 렌더는 이벤트 핸들러가 끝난 직후에 일어난다. 우선순위 스케줄링이나 시간 분할은 없다.

---

## S8 — `useMemo` / `useEffect` / unmount / 훅 제약

### 왜 필요한가
- **`useMemo`**: 렌더 함수는 매번 처음부터 실행되므로, 비싼 계산(필터링·통계)도 매번 다시 한다. deps가 같은 동안 결과를 캐시한다. 같은 **참조**를 돌려주므로 diff의 props 비교(`Object.is`)도 줄여 준다.
- **`useEffect`**: 렌더 함수는 순수해야 한다(DOM 수정·타이머·`document.title`·저장 등을 하면 안 된다). 그런 **부수 효과**를 렌더 밖, DOM에 반영된 뒤에 실행할 자리가 필요하다.

### 슬롯 종류
`hooks[]`의 한 칸은 이제 세 종류다.

| kind | 담는 것 |
|---|---|
| `state` | 값, setter |
| `memo` | 캐시한 값, 그때의 deps |
| `effect` | effect 함수, 마지막 deps, 돌려받은 cleanup, `pending`(이번 렌더에서 실행할지) |

### deps 규칙 (`depsChanged`)
- deps가 **없으면** 항상 바뀐 것으로 본다(매 렌더). `[]`는 처음 한 번뿐이다.
- 있으면 길이가 다르거나 어느 한 칸이라도 `Object.is`가 다르면 바뀐 것이다. **얕은 비교**라서 객체·배열은 내용이 같아도 새로 만들면 다른 값이다. (`NaN`은 같은 값으로 본다)

### `useMemo`
슬롯이 있고 deps가 같으면 캐시를 돌려준다. 아니면 `factory()`를 실행하고 슬롯을 갱신한다. `factory`가 던지면 슬롯을 갱신하지 않으므로 다음 렌더에서 다시 시도한다.

### `useEffect`와 commit 이후 실행
렌더 중에는 실행하지 않고 슬롯에 `pending = true`만 표시한다. `update()`가 `diff → patch → prev 갱신`(commit)을 마친 직후 `flushEffects()`가 실행한다. 그래서 effect 안에서 DOM을 읽으면 이미 새 화면이다.

```
update():  렌더 → (훅 개수 검사) → resolveTree → diff → patch → onPatch → flushEffects
flushEffects:  ① pending인 effect의 이전 cleanup을 모두 호출 → ② effect를 선언 순서대로 실행, 돌려준 함수를 cleanup으로 저장
```
- **cleanup은 새 effect보다 먼저.** 같은 렌더에 effect가 여러 개면 cleanup을 전부 먼저 호출한 뒤 effect들을 실행한다. 구독을 해제하고 다시 거는 흔한 패턴이 안전하다.
- **빈 패치여도 실행한다.** 화면이 그대로여도 deps가 바뀌었다면 effect는 실행되어야 한다(예: 저장·로깅).
- **함수가 아닌 반환값은 무시한다.** `() => count++` 같은 화살표 함수가 실수로 값을 돌려줘도 cleanup으로 오해하지 않는다.
- **예외.** effect나 cleanup 하나가 던져도 나머지는 실행하고, 첫 예외를 마지막에 다시 던진다. 렌더 자체가 던지면 commit 전이라 effect는 실행되지 않는다.
- **effect 안의 `setState`**는 일반 setState와 같이 배치되어 다음 마이크로태스크에서 리렌더된다.
- **effect·cleanup 안에서 `unmount()`가 불려도 정리가 새지 않는다.** cleanup은 호출 직전에 슬롯에서 떼어 내므로, cleanup 도중 `unmount()`가 불리면 아직 호출되지 않은 cleanup은 unmount가 호출하고 flush는 다시 호출하지 않는다(중복 없음). unmount된 뒤에는 같은 flush의 남은 effect를 실행하지 않고, 방금 실행한 effect가 돌려준 cleanup은 저장하지 않고 바로 호출한다.

### `unmount()`
- 모든 effect의 cleanup을 **선언 순서대로** 호출하고 컨테이너를 비운다. 두 번 불러도 cleanup은 한 번뿐이다.
- 이후의 `setState`는 값만 바뀌고 렌더도 effect도 일으키지 않는다. 이미 예약돼 있던 렌더도 실행되지 않는다. 사라진 컴포넌트가 DOM을 건드리는 문제를 막는다.
- 다시 `mount()`하면 `hooks[]`를 비우고 **상태와 effect가 새로 시작**된다. `unmount()` 없이 `mount()`를 다시 불러도 먼저 이전 mount를 정리하므로 cleanup이 새지 않는다.

### 훅 사용 제약
훅은 호출 **순서**로 슬롯과 짝지어진다. 렌더마다 순서·개수가 달라지면 엉뚱한 슬롯(다른 종류일 수도 있다)을 읽는다. 그래서 첫 렌더 이후에는 다음을 에러로 막는다.

| 위반 | 검사 위치 | 메시지 |
|---|---|---|
| 같은 자리에서 다른 종류의 훅 호출 | `claimSlot` | "훅 호출 순서가 이전 렌더와 다릅니다" |
| 이전보다 훅을 더 많이 호출 | `claimSlot` | "훅 호출 개수가 이전 렌더보다 많습니다" |
| 이전보다 훅을 적게 호출 | `update()`의 렌더 직후 검사 | "훅 호출 개수가 이전 렌더와 다릅니다" |
| 자식 컴포넌트에서 호출 | `getCurrentHost` (S7) | "훅은 루트 컴포넌트에서만…" |
| 컴포넌트 밖에서 호출 | `getCurrentHost` (S7) | "훅은 컴포넌트 렌더 중에만…" |

개수 검사는 **commit(diff/patch) 전에** 하므로, 에러가 나도 DOM은 이전 렌더 결과를 유지한다.

### 설계 결정
- **effect는 paint를 기다리지 않는다.** 브라우저의 `useEffect`는 화면이 그려진 뒤에 실행되지만, 여기서는 commit 직후 동기로 실행한다(`useLayoutEffect`에 가깝다). 스케줄러가 없는 단순한 모델에서 "DOM에 반영된 뒤"라는 핵심 보장만 지킨다.
- **훅 개수 기준은 "성공한 첫 렌더"다.** 첫 렌더는 `hooks[]`를 채우는 단계라 기준이 없고, 슬롯 생성은 첫 렌더에서만 허용된다. 첫 렌더가 중간에 던졌다면 `hooks[]`에 일부만 남아 있고 기준이 확정되지 않았으므로, 재시도 때 `hooks[]`를 비우고 처음부터 시작한다. (그렇지 않으면 재시도에서 훅을 더 적게 호출했을 때 남은 슬롯이 뒤에 붙어 이후 렌더가 모두 개수 오류로 막힌다)

### 한계 (의도적)
- **여러 effect/cleanup이 던지면 첫 예외만 다시 던지고 나머지는 버린다.** 모두 실행은 하지만 예외를 모아 보고하지는 않는다. 마이크로태스크(setState로 예약된 렌더)에서 던진 예외는 호출한 곳이 없어 처리되지 않은 오류가 된다.
- **렌더가 실패해도 그 렌더에서 이미 지나간 `useMemo`/`useEffect` 슬롯은 갱신된 채 남는다.** 슬롯의 값·deps·effect가 새 값으로 바뀌고 effect는 `pending`이 된다. 다음 성공 렌더에서 그 effect가 정확히 한 번 실행되므로 결과는 맞지만(테스트로 고정), "commit 전에는 슬롯을 건드리지 않는다"는 트랜잭션 보장은 없다. 실패한 렌더 중의 `setState`는 이미 값이 반영된다.
- 마이크로태스크 배치 덕분에 effect의 `setState`가 곧바로 연쇄 렌더로 이어질 수 있다. deps를 잘못 쓰면 무한 루프가 가능하며 막지 않는다.
- `useRef`, `useCallback`, 컨텍스트는 없다. 안정적인 콜백이 필요하면 `useMemo(() => fn, [])`로 같은 효과를 낸다(S9에서 사용).
- Strict Mode처럼 effect를 일부러 두 번 실행해 버그를 드러내는 기능은 없다.
