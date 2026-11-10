import { Phase1, mountPhase1 } from '../../src/demo/phase1';
import type { Patch } from '../../src/diff/diff';

const FIXTURE = `
  <div id="real"><h1>제목</h1><p>첫 문단</p><ul><li>하나</li><li>둘</li></ul></div>
  <div id="test" contenteditable="true"></div>
  <button id="patch-btn">Patch</button>
  <button id="back-btn">뒤로</button>
  <button id="forward-btn">앞으로</button>
  <button data-action="add-paragraph">문단 추가</button>
  <button data-action="add-item">항목 추가</button>
  <button data-action="remove-last">마지막 삭제</button>
`;

function setup(onPatch?: (patches: Patch[]) => void) {
  document.body.innerHTML = FIXTURE;
  const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const els = {
    real: $('#real'),
    test: $('#test'),
    patchButton: $<HTMLButtonElement>('#patch-btn'),
    backButton: $<HTMLButtonElement>('#back-btn'),
    forwardButton: $<HTMLButtonElement>('#forward-btn'),
  };
  const phase1 = new Phase1(els, { onPatch });
  return { ...els, phase1 };
}

/** 렌더 결과에서 내용만 비교하기 위한 텍스트 */
const text = (el: Element) => el.textContent;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Phase1', () => {
  describe('초기화', () => {
    it('실제 영역을 VDOM으로 읽어 테스트 영역에 같은 내용을 렌더한다', () => {
      const { real, test } = setup();
      expect(text(test)).toBe(text(real));
      expect(test.querySelector('h1')!.textContent).toBe('제목');
      expect(test.querySelectorAll('li')).toHaveLength(2);
    });

    it('두 영역의 구조가 같다', () => {
      const { real, test } = setup();
      expect(real.querySelectorAll('*').length - 1).toBe(test.querySelectorAll('*').length);
    });

    it('초기에는 뒤로/앞으로 버튼이 모두 비활성이다', () => {
      const { backButton, forwardButton } = setup();
      expect(backButton.disabled).toBe(true);
      expect(forwardButton.disabled).toBe(true);
    });

    it('스크립트가 들어 있어도 테스트 영역에 렌더되지 않는다', () => {
      document.body.innerHTML = FIXTURE.replace('<h1>제목</h1>', '<h1>제목</h1><script>window.__x = 1</script>');
      const real = document.querySelector<HTMLElement>('#real')!;
      const test = document.querySelector<HTMLElement>('#test')!;
      new Phase1(
        {
          real,
          test,
          patchButton: document.querySelector('#patch-btn')!,
          backButton: document.querySelector('#back-btn')!,
          forwardButton: document.querySelector('#forward-btn')!,
        },
      );
      expect(test.querySelector('script')).toBeNull();
      expect(real.querySelector('script')).toBeNull();
    });
  });

  describe('Patch', () => {
    it('테스트 영역에서 텍스트를 고치고 Patch하면 실제 영역이 같아진다', () => {
      const { real, test, patchButton } = setup();
      test.querySelector('p')!.firstChild!.textContent = '고친 문단';
      patchButton.click();
      expect(real.querySelector('p')!.textContent).toBe('고친 문단');
      expect(text(real)).toBe(text(test));
    });

    it('변경된 부분만 patch하고 나머지 실제 영역 노드는 그대로 유지한다', () => {
      const { real, test, patchButton } = setup();
      const h1 = real.querySelector('h1');
      const ul = real.querySelector('ul');
      const firstLi = real.querySelector('li');
      const p = real.querySelector('p');
      test.querySelector('p')!.firstChild!.textContent = '고친 문단';
      patchButton.click();
      expect(real.querySelector('h1')).toBe(h1);
      expect(real.querySelector('ul')).toBe(ul);
      expect(real.querySelector('li')).toBe(firstLi);
      expect(real.querySelector('p')).toBe(p);
    });

    it('onPatch 콜백에 패치 목록이 전달된다 (텍스트만 바꾸면 TEXT 하나)', () => {
      const received: Patch[][] = [];
      const { test, patchButton } = setup((patches) => received.push(patches));
      test.querySelector('p')!.firstChild!.textContent = '고친 문단';
      patchButton.click();
      expect(received).toHaveLength(1);
      expect(received[0]!.map((p) => p.type)).toEqual(['TEXT']);
    });

    it('변경이 없으면 빈 패치이고 history에 쌓지 않는다', () => {
      const received: Patch[][] = [];
      const { patchButton, backButton, phase1 } = setup((p) => received.push(p));
      patchButton.click();
      expect(received).toEqual([]);
      expect(backButton.disabled).toBe(true);
      expect(phase1.patch()).toEqual([]);
    });

    it('Patch 후에는 뒤로 버튼이 활성화된다', () => {
      const { test, patchButton, backButton, forwardButton } = setup();
      test.querySelector('p')!.firstChild!.textContent = '고침';
      patchButton.click();
      expect(backButton.disabled).toBe(false);
      expect(forwardButton.disabled).toBe(true);
    });

    it('요소를 추가·삭제해도 반영된다 (CREATE/REMOVE)', () => {
      const { real, test, patchButton } = setup();
      const li = document.createElement('li');
      li.textContent = '셋';
      test.querySelector('ul')!.appendChild(li);
      test.querySelector('h1')!.remove();
      patchButton.click();
      expect(real.querySelectorAll('li')).toHaveLength(3);
      expect(real.querySelector('h1')).toBeNull();
      expect(text(real)).toBe(text(test));
    });

    it('속성 변경도 반영된다 (PROPS)', () => {
      const { real, test, patchButton } = setup();
      test.querySelector('p')!.setAttribute('class', 'hot');
      patchButton.click();
      expect(real.querySelector('p')!.getAttribute('class')).toBe('hot');
    });

    it('테스트 영역에 script가 주입되어도 실제 영역에는 반영되지 않는다', () => {
      const { real, test, patchButton } = setup();
      const script = document.createElement('script');
      script.textContent = 'window.__hacked = 1';
      test.appendChild(script);
      test.querySelector('p')!.firstChild!.textContent = '변경';
      patchButton.click();
      expect(real.querySelector('script')).toBeNull();
    });
  });

  describe('onPatch 확장 인자', () => {
    it('변경된 노드와 출처(Patch/뒤로/앞으로)를 함께 전달한다', () => {
      const calls: { touched: Node[]; source: string }[] = [];
      document.body.innerHTML = FIXTURE;
      const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
      const phase1 = new Phase1(
        {
          real: $('#real'),
          test: $('#test'),
          patchButton: $<HTMLButtonElement>('#patch-btn'),
          backButton: $<HTMLButtonElement>('#back-btn'),
          forwardButton: $<HTMLButtonElement>('#forward-btn'),
        },
        { onPatch: (_patches, touched, source) => calls.push({ touched, source }) },
      );
      $('#test').querySelector('p')!.firstChild!.textContent = '변경';
      phase1.patch();
      phase1.back();
      phase1.forward();
      expect(calls.map((c) => c.source)).toEqual(['Patch', '뒤로', '앞으로']);
      expect(calls[0]!.touched).toEqual([$('#real').querySelector('p')!.firstChild]);
    });
  });

  describe('뒤로 / 앞으로', () => {
    function twoEdits() {
      const ctx = setup();
      const { test, patchButton } = ctx;
      test.querySelector('p')!.firstChild!.textContent = '1차';
      patchButton.click();
      test.querySelector('p')!.firstChild!.textContent = '2차';
      patchButton.click();
      return ctx;
    }

    it('뒤로 하면 두 영역이 이전 상태로 돌아간다', () => {
      const { real, test, backButton } = twoEdits();
      backButton.click();
      expect(real.querySelector('p')!.textContent).toBe('1차');
      expect(test.querySelector('p')!.textContent).toBe('1차');
    });

    it('앞으로 하면 다시 적용된다', () => {
      const { real, test, backButton, forwardButton } = twoEdits();
      backButton.click();
      forwardButton.click();
      expect(real.querySelector('p')!.textContent).toBe('2차');
      expect(test.querySelector('p')!.textContent).toBe('2차');
    });

    it('처음까지 되돌리면 뒤로 버튼이 비활성, 앞으로 버튼이 활성이다', () => {
      const { real, backButton, forwardButton } = twoEdits();
      backButton.click();
      backButton.click();
      expect(real.querySelector('p')!.textContent).toBe('첫 문단');
      expect(backButton.disabled).toBe(true);
      expect(forwardButton.disabled).toBe(false);
    });

    it('끝까지 앞으로 가면 앞으로 버튼이 비활성이다', () => {
      const { backButton, forwardButton } = twoEdits();
      backButton.click();
      forwardButton.click();
      expect(forwardButton.disabled).toBe(true);
      expect(backButton.disabled).toBe(false);
    });

    it('경계에서 phase1.back()/forward()를 호출해도 에러 없이 무시된다', () => {
      const { real, phase1 } = setup();
      expect(() => phase1.back()).not.toThrow();
      expect(() => phase1.forward()).not.toThrow();
      expect(real.querySelector('p')!.textContent).toBe('첫 문단');
    });

    it('뒤로 하면 테스트 영역의 저장되지 않은 편집은 버려지고 기록된 상태로 다시 렌더된다', () => {
      const { test, patchButton, backButton } = setup();
      test.querySelector('p')!.firstChild!.textContent = '저장됨';
      patchButton.click();
      test.querySelector('p')!.firstChild!.textContent = '저장 안 됨';
      backButton.click();
      expect(test.querySelector('p')!.textContent).toBe('첫 문단');
    });

    it('뒤로 갈 때도 실제 영역은 바뀐 부분만 patch한다 (변경 없는 노드 유지)', () => {
      const received: Patch[][] = [];
      const { real, test, patchButton, backButton } = setup((p) => received.push(p));
      test.querySelector('p')!.firstChild!.textContent = '1차';
      patchButton.click();
      const h1 = real.querySelector('h1');
      backButton.click();
      expect(real.querySelector('h1')).toBe(h1);
      expect(received).toHaveLength(2);
      expect(received[1]!.map((p) => p.type)).toEqual(['TEXT']);
    });

    it('뒤로 간 뒤 새로 Patch하면 앞으로 기록(redo)이 사라진다', () => {
      const { test, patchButton, backButton, forwardButton } = twoEdits();
      backButton.click();
      test.querySelector('p')!.firstChild!.textContent = '새 갈래';
      patchButton.click();
      expect(forwardButton.disabled).toBe(true);
      backButton.click();
      expect(test.querySelector('p')!.textContent).toBe('1차');
    });

    it('요소 추가/삭제도 뒤로/앞으로로 복원된다', () => {
      const { real, test, patchButton, backButton, forwardButton } = setup();
      const li = document.createElement('li');
      li.textContent = '셋';
      test.querySelector('ul')!.appendChild(li);
      patchButton.click();
      expect(real.querySelectorAll('li')).toHaveLength(3);
      backButton.click();
      expect(real.querySelectorAll('li')).toHaveLength(2);
      expect(test.querySelectorAll('li')).toHaveLength(2);
      forwardButton.click();
      expect(real.querySelectorAll('li')).toHaveLength(3);
      expect(test.querySelectorAll('li')).toHaveLength(3);
    });
  });

  describe('툴바', () => {
    function clickAction(action: string) {
      document.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
    }

    it('문단 추가: 테스트 영역 끝에 p가 생기고 Patch하면 실제 영역에도 생긴다', () => {
      const { real, test, phase1 } = setup();
      phase1.bindToolbar(document);
      clickAction('add-paragraph');
      expect(test.querySelectorAll('p')).toHaveLength(2);
      expect(real.querySelectorAll('p')).toHaveLength(1);
      phase1.patch();
      expect(real.querySelectorAll('p')).toHaveLength(2);
    });

    it('항목 추가: 첫 번째 목록 끝에 li를 추가한다', () => {
      const { real, test, phase1 } = setup();
      phase1.bindToolbar(document);
      clickAction('add-item');
      expect(test.querySelectorAll('li')).toHaveLength(3);
      phase1.patch();
      expect(real.querySelectorAll('li')).toHaveLength(3);
    });

    it('마지막 요소 삭제: 테스트 영역 마지막 요소가 사라진다', () => {
      const { real, test, phase1 } = setup();
      phase1.bindToolbar(document);
      clickAction('remove-last');
      expect(test.querySelector('ul')).toBeNull();
      expect(real.querySelector('ul')).not.toBeNull();
      phase1.patch();
      expect(real.querySelector('ul')).toBeNull();
    });

    it('빈 테스트 영역에서 삭제해도 에러가 없다', () => {
      const { test, phase1 } = setup();
      phase1.bindToolbar(document);
      test.replaceChildren();
      expect(() => clickAction('remove-last')).not.toThrow();
    });

    it('목록이 없을 때 항목 추가는 새 ul을 만든다', () => {
      const { test, phase1 } = setup();
      phase1.bindToolbar(document);
      test.querySelector('ul')!.remove();
      clickAction('add-item');
      expect(test.querySelectorAll('ul > li')).toHaveLength(1);
    });
  });

  describe('destroy', () => {
    it('destroy 후에는 버튼 클릭이 더 이상 동작하지 않는다', () => {
      const { real, test, patchButton, phase1 } = setup();
      phase1.destroy();
      test.querySelector('p')!.firstChild!.textContent = '무시됨';
      patchButton.click();
      expect(real.querySelector('p')!.textContent).toBe('첫 문단');
    });
  });

  describe('destroy 보강', () => {
    it('destroy 후에는 툴바 버튼 클릭도 무시된다', () => {
      const { test, phase1 } = setup();
      phase1.bindToolbar(document);
      phase1.destroy();
      document.querySelector<HTMLButtonElement>('[data-action="add-paragraph"]')!.click();
      expect(test.querySelectorAll('p')).toHaveLength(1);
    });

    it('destroy는 리스너만 해제한다 (메서드를 직접 호출하면 여전히 동작한다)', () => {
      const { real, test, phase1 } = setup();
      phase1.destroy();
      test.querySelector('p')!.firstChild!.textContent = '직접 호출';
      phase1.patch();
      expect(real.querySelector('p')!.textContent).toBe('직접 호출');
    });
  });

  describe('mountPhase1', () => {
    it('문서의 id/data-action 요소를 찾아 연결한다', () => {
      document.body.innerHTML = FIXTURE;
      const phase1 = mountPhase1(document);
      const test = document.querySelector('#test')!;
      test.querySelector('p')!.firstChild!.textContent = '연결됨';
      document.querySelector<HTMLButtonElement>('#patch-btn')!.click();
      expect(document.querySelector('#real p')!.textContent).toBe('연결됨');
      document.querySelector<HTMLButtonElement>('[data-action="add-paragraph"]')!.click();
      expect(test.querySelectorAll('p')).toHaveLength(2);
      phase1.destroy();
    });

    it('필수 요소가 없으면 어떤 요소가 없는지 알려주는 에러를 던진다', () => {
      document.body.innerHTML = '<div id="real"></div>';
      expect(() => mountPhase1(document)).toThrow(/#test/);
    });
  });
});
