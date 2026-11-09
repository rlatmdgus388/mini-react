import { History } from '../../src/history/history';

describe('History', () => {
  describe('초기 상태', () => {
    it('초기 상태가 current이고 undo/redo 모두 불가능하다', () => {
      const history = new History('a');
      expect(history.current).toBe('a');
      expect(history.canUndo).toBe(false);
      expect(history.canRedo).toBe(false);
      expect(history.size).toBe(1);
      expect(history.index).toBe(0);
    });
  });

  describe('push', () => {
    it('새 상태가 current가 되고 undo가 가능해진다', () => {
      const history = new History('a');
      history.push('b');
      expect(history.current).toBe('b');
      expect(history.canUndo).toBe(true);
      expect(history.canRedo).toBe(false);
      expect(history.size).toBe(2);
      expect(history.index).toBe(1);
    });

    it('여러 번 push하면 순서대로 쌓인다', () => {
      const history = new History(0);
      [1, 2, 3].forEach((n) => history.push(n));
      expect(history.size).toBe(4);
      expect(history.current).toBe(3);
    });

    it('undo한 뒤 push하면 되돌렸던 미래(redo 스택)는 버려진다', () => {
      const history = new History('a');
      history.push('b');
      history.push('c');
      history.undo();
      history.undo();
      history.push('x');
      expect(history.current).toBe('x');
      expect(history.canRedo).toBe(false);
      expect(history.size).toBe(2);
      expect(history.undo()).toBe('a');
    });
  });

  describe('undo / redo', () => {
    it('undo는 이전 상태를 돌려주고 current를 옮긴다', () => {
      const history = new History('a');
      history.push('b');
      history.push('c');
      expect(history.undo()).toBe('b');
      expect(history.current).toBe('b');
      expect(history.canRedo).toBe(true);
      expect(history.canUndo).toBe(true);
    });

    it('redo는 되돌렸던 상태를 다시 적용한다', () => {
      const history = new History('a');
      history.push('b');
      history.undo();
      expect(history.redo()).toBe('b');
      expect(history.current).toBe('b');
      expect(history.canRedo).toBe(false);
    });

    it('undo/redo를 반복해도 상태가 어긋나지 않는다', () => {
      const history = new History(0);
      for (let i = 1; i <= 5; i++) history.push(i);
      for (let i = 4; i >= 0; i--) expect(history.undo()).toBe(i);
      for (let i = 1; i <= 5; i++) expect(history.redo()).toBe(i);
    });
  });

  describe('경계', () => {
    it('맨 처음에서 undo해도 에러 없이 current를 그대로 돌려준다', () => {
      const history = new History('a');
      expect(history.undo()).toBe('a');
      expect(history.current).toBe('a');
      expect(history.canUndo).toBe(false);
      expect(history.index).toBe(0);
    });

    it('맨 끝에서 redo해도 에러 없이 current를 그대로 돌려준다', () => {
      const history = new History('a');
      history.push('b');
      expect(history.redo()).toBe('b');
      expect(history.canRedo).toBe(false);
      expect(history.index).toBe(1);
    });

    it('undo로 처음까지 가면 canUndo가 false, canRedo가 true', () => {
      const history = new History('a');
      history.push('b');
      history.undo();
      expect(history.canUndo).toBe(false);
      expect(history.canRedo).toBe(true);
    });
  });

  describe('상태 보존', () => {
    it('객체 상태를 복사하지 않고 같은 참조로 돌려준다 (불변 스냅샷 전제)', () => {
      const a = { v: 1 };
      const b = { v: 2 };
      const history = new History(a);
      history.push(b);
      expect(history.undo()).toBe(a);
      expect(history.redo()).toBe(b);
    });

    it('falsy 값(0, 빈 문자열, null)도 상태로 다룬다', () => {
      const history = new History<number | null | string>(0);
      history.push('');
      history.push(null);
      expect(history.undo()).toBe('');
      expect(history.undo()).toBe(0);
      expect(history.redo()).toBe('');
    });
  });

  describe('개수 제한', () => {
    it('limit을 넘으면 가장 오래된 상태부터 버린다', () => {
      const history = new History(0, { limit: 3 });
      [1, 2, 3, 4].forEach((n) => history.push(n));
      expect(history.size).toBe(3);
      expect(history.current).toBe(4);
      expect(history.undo()).toBe(3);
      expect(history.undo()).toBe(2);
      expect(history.canUndo).toBe(false);
    });

    it('limit이 1 미만이면 에러', () => {
      expect(() => new History(0, { limit: 0 })).toThrow();
    });

    it('limit에 도달한 뒤에도 index/current가 일관된다', () => {
      const history = new History('a', { limit: 2 });
      history.push('b');
      history.push('c');
      expect(history.index).toBe(1);
      expect(history.current).toBe('c');
      expect(history.undo()).toBe('b');
      expect(history.redo()).toBe('c');
    });
  });
});
