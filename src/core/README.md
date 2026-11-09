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
