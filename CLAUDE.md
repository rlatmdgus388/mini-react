# CLAUDE.md

## 절대 규칙
- 항상 한국어로 답변한다. (코드 식별자와 기술 용어는 원문 유지)
- React, Vue 등 외부 UI 프레임워크를 사용하지 않는다. Vanilla TypeScript만 쓴다. (개발 도구인 Vite, Vitest, jsdom은 허용)
- TDD를 지킨다. 실패하는 테스트를 먼저 작성하고, 구현은 그다음에 한다.
- 세션(S0~S10)의 게이트(테스트, 타입체크)를 통과하기 전에는 다음 세션으로 넘어가지 않는다.
- Hook은 루트 컴포넌트에서만 사용한다. 자식 컴포넌트는 state 없이 props만 받는 순수 함수다.
- `diff()`는 DOM에 의존하지 않는 순수 함수로 유지한다.
- 각 세션이 끝나면 해당 기능 폴더(`src/vdom`, `src/diff` 등)의 `README.md`에 그 세션에서 구현한 개념(왜 필요한지, 동작 원리, 설계 결정)을 설명으로 추가한다. 게이트 통과 후, 다음 세션으로 넘어가기 전에 한다.
- 기존 `plan-review-mcp/`, `.claude/` 폴더는 수정하지 않는다.

## 아키텍처
- 기술 스택: TypeScript, Vite, Vitest(jsdom). JSX는 쓰지 않고 `h()` 함수로 작성한다.
- 설계 상세는 `/Users/airm4/.claude/plans/pasted-content-id-a585-melodic-pie.md`를 참고한다.

```
mini_react/
├─ index.html          # Phase 1 데모 (실제/테스트 영역, Patch/뒤로/앞으로)
├─ app.html            # Phase 2 데모 (Todo 앱)
├─ src/
│  ├─ vdom/            # types, h, fromDOM, createDOM
│  ├─ diff/            # diff (순수 함수), patch (DOM 적용)
│  ├─ history/         # undo/redo 스택
│  ├─ core/            # FunctionComponent, hooks, render
│  ├─ demo/            # phase1, app, patchLog
│  └─ styles/
└─ tests/              # src와 1:1 대응
```

## 세션 계획 (TDD)
각 세션은 실패하는 테스트 작성 → 구현 → 게이트 통과 → 해당 폴더 README 갱신 순서로 진행한다.

| 세션 | 범위 | 대응 테스트 파일 | 게이트(통과 조건) | 상태 |
|---|---|---|---|---|
| S0 | Vite + TS + Vitest(jsdom) 세팅 | 환경 점검용 샘플 테스트 (S1 도입 시 제거) | `npm test` green, 타입체크, 빌드 통과 | 완료 |
| S1 | VNode 타입, `h()` | `tests/vdom/h.test.ts` | null/중첩배열/숫자/key 정규화 테스트 통과 | 완료 |
| S2 | `fromDOM` / `createDOM` / `props` | `tests/vdom/fromDOM.test.ts`, `tests/vdom/createDOM.test.ts`, `tests/vdom/props.test.ts` | DOM→VDOM→DOM 왕복 동일, 공백·주석·script·SVG·input 엣지 통과 | 완료 |
| S3 | `diff` 5가지 케이스 | `tests/diff/diff.test.ts` | 케이스별 패치 목록 정확, 동일 트리는 빈 패치 | 완료 |
| S4 | `patch` 적용 | `tests/diff/patch.test.ts` | diff→patch 후 DOM이 목표 VDOM과 동일, 변경 없는 노드는 identity 유지 | 완료 |
| S5 | keyed diff(MOVE) + fuzz | `tests/diff/keyed.test.ts`, `tests/diff/fuzz.test.ts` | 랜덤 트리 쌍에서 patch 결과가 새 트리 렌더와 동일 | 완료 |
| S6 | history + Phase 1 데모 페이지 | `tests/history/history.test.ts`, `tests/demo/phase1.test.ts` | undo/redo 및 경계 비활성, 두 영역 동기화 | 예정 |
| S7 | `FunctionComponent` + `useState` (+ batching) | `tests/core/FunctionComponent.test.ts`, `tests/core/useState.test.ts` | 상태 유지, 리렌더, 함수형 업데이트, 동일값 무시, 배치 시 렌더 1회 | 예정 |
| S8 | `useMemo` / `useEffect` | `tests/core/useMemo.test.ts`, `tests/core/useEffect.test.ts` | deps 재계산, cleanup 순서, mount/unmount, 훅 사용 제약 위반 에러 | 예정 |
| S9 | Phase 2 Todo 데모 + 통합 | `tests/demo/app.test.ts` | 상태 변경 시 변경된 노드만 patch (spy로 검증), 입력 포커스 유지 | 예정 |
| S10 | 패치 로그·하이라이트 시각화, 최종 README | `tests/demo/patchLog.test.ts` | 전체 테스트·타입체크·빌드 통과 | 예정 |

## 빌드/테스트
- 개발 서버: `npm run dev`
- 테스트: `npm test` (감시 모드는 `npm run test:watch`, 커버리지는 `npx vitest run --coverage`)
- 타입체크: `npm run typecheck`
- 빌드: `npm run build` (타입체크 후 `vite build`, 결과물은 `dist/`)
- 세션 게이트: `npm test`와 `npm run typecheck`가 모두 통과해야 한다.

## 도메인 컨텍스트
- **VNode**: `ElementVNode { type, props, children, key }`와 `TextVNode { type: '#text', text }`로 이루어진 가상 DOM 노드.
- **정규화**: `null`, `undefined`, boolean, 빈 문자열은 제거하고, 숫자는 텍스트로 바꾸며, 인접 텍스트는 병합한다. `fromDOM`도 같은 규칙을 적용해 DOM→VDOM→DOM 왕복이 일치하게 한다.
- **Diff 5가지 케이스**: CREATE, REMOVE, REPLACE(type 변경), TEXT, PROPS. 확장으로 keyed children용 MOVE가 있다.
- **Phase 1 흐름**: 실제 영역 → VDOM → 테스트 영역 렌더 → 사용자 편집 → Patch 클릭 → `fromDOM(테스트 영역)`과 이전 VDOM을 diff → 실제 영역에 변경분만 patch → history에 저장.
- **Phase 2 흐름**: setState → 렌더(새 VDOM) → diff → patch → useEffect 실행. 상태는 `FunctionComponent`의 `hooks[]` 배열에 호출 순서(index)로 저장한다.
- **Batching**: setState는 dirty 플래그만 세우고 `queueMicrotask`로 `update()`를 한 번만 실행한다.

## 코딩 컨벤션
- 네이밍: 파일은 모듈이 하나의 함수면 camelCase(`fromDOM.ts`), 클래스면 PascalCase(`FunctionComponent.ts`). 타입과 클래스는 PascalCase, 함수와 변수는 camelCase, 상수는 UPPER_SNAKE_CASE를 쓴다.
- 테스트 파일은 `tests/<src 경로>/<모듈>.test.ts` 형태로 src와 1:1 대응시키고, 설명(`describe`/`it`)은 한국어로 쓴다.
- `any`는 쓰지 않는다. 불가피하면 이유를 주석으로 남긴다.
- 입력 객체(props 등)는 변형하지 않는다. 새 객체를 만들어 반환한다.
- 커밋 메시지는 `type: 요약` 형식(feat, fix, test, refactor, docs, chore)으로 한국어로 쓰고, 세션 단위로 커밋한다. (예: `feat: S1 h() 구현`)
- 엣지 케이스는 구현 전에 테스트로 먼저 고정한다.
