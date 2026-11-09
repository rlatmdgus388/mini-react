export const TEXT = '#text' as const;

export type Key = string | number;
// props 값은 속성 문자열, 불리언, 숫자, style 객체, 이벤트 핸들러 함수 등 임의의 타입이 올 수 있다.
// 키마다 타입이 다르고 사용자가 자유롭게 정하므로 unknown으로는 호출부마다 단언이 필요해져 any를 허용한다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Props = Record<string, any>;

export interface TextVNode {
  type: typeof TEXT;
  text: string;
}

export interface ElementVNode {
  type: string | FunctionalComponent;
  props: Props;
  children: VNode[];
  key: Key | null;
}

export type VNode = TextVNode | ElementVNode;

/** props만 받는 순수 함수 컴포넌트 (자식 컴포넌트는 state를 갖지 않는다) */
export type FunctionalComponent = (props: Props) => VNode;

/** h()의 children 인자로 허용되는 값 */
export type Child = VNode | string | number | boolean | null | undefined | Child[];
