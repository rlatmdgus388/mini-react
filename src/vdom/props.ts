import type { Props } from './types';

/** 값이 attribute가 아닌 property로 다뤄져야 하는 input type (value가 attribute 자체인 타입) */
export const ATTRIBUTE_VALUE_INPUT_TYPES = new Set([
  'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'hidden', 'file',
]);

/** 존재 여부로 의미가 정해지는 불리언 attribute */
export const BOOLEAN_ATTRS = new Set([
  'disabled', 'readonly', 'required', 'hidden', 'multiple', 'autofocus', 'open',
  'selected', 'novalidate', 'autoplay', 'controls', 'loop', 'muted', 'reversed', 'async', 'defer',
]);

const ATTR_ALIASES: Record<string, string> = { className: 'class', htmlFor: 'for' };

const EVENT_RE = /^on[a-z]/i;
const handlers = new WeakMap<Element, Map<string, EventListener>>();

export function isEventProp(name: string): boolean {
  return EVENT_RE.test(name);
}

/** 인라인 핸들러(문자열) 주입 방지를 위해 함수일 때만 리스너로 등록한다. */
function setHandler(el: Element, name: string, value: unknown): void {
  const event = name.slice(2).toLowerCase();
  let map = handlers.get(el);
  const prev = map?.get(event);
  if (prev) el.removeEventListener(event, prev);
  if (typeof value === 'function') {
    if (!map) handlers.set(el, (map = new Map()));
    map.set(event, value as EventListener);
    el.addEventListener(event, value as EventListener);
  } else {
    map?.delete(event);
  }
}

function usesProperty(el: Element, name: 'value' | 'checked'): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return name === 'value';
  if (el instanceof HTMLInputElement) {
    const attrValued = ATTRIBUTE_VALUE_INPUT_TYPES.has(el.type);
    return name === 'checked' ? true : !attrValued;
  }
  return false;
}

function applyStyle(el: Element, value: unknown): void {
  if (typeof value === 'string') {
    el.setAttribute('style', value);
    return;
  }
  const style = (el as HTMLElement).style;
  style.cssText = '';
  for (const [k, v] of Object.entries(value as Props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.includes('-')) style.setProperty(k, String(v));
    else (style as unknown as Record<string, string>)[k] = String(v);
  }
}

/**
 * el에 prop을 반영한다. prev는 이전 값(현재는 호출 측 편의를 위해 받기만 한다).
 * null/undefined/false는 제거로 취급한다.
 */
export function setProp(el: Element, name: string, value: unknown, prev?: unknown): void {
  if (name === 'key' || name === 'children') return;
  if (isEventProp(name)) {
    setHandler(el, name, value);
    return;
  }
  if (value === null || value === undefined || value === false) {
    removeProp(el, name, prev);
    return;
  }
  const attr = ATTR_ALIASES[name] ?? name;
  if (name === 'style') return applyStyle(el, value);
  if ((name === 'value' || name === 'checked') && usesProperty(el, name)) {
    (el as unknown as Record<string, unknown>)[name] = name === 'checked' ? Boolean(value) : String(value);
    return;
  }
  el.setAttribute(attr, value === true ? '' : String(value));
}

export function removeProp(el: Element, name: string, _prev?: unknown): void {
  if (name === 'key' || name === 'children') return;
  if (isEventProp(name)) {
    setHandler(el, name, null);
    return;
  }
  if ((name === 'value' || name === 'checked') && usesProperty(el, name)) {
    (el as unknown as Record<string, unknown>)[name] = name === 'checked' ? false : '';
    // 초기 attribute가 남아 있으면 함께 제거
    el.removeAttribute(name);
    return;
  }
  el.removeAttribute(ATTR_ALIASES[name] ?? name);
}
