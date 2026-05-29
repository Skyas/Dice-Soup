import { describe, it, expect } from 'vitest';
import { DiceEngine } from '../index';
import { DiceError } from '../errors';

function seededRand(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

const engine = new DiceEngine();

describe('Evaluator', () => {
  describe('常量表达式', () => {
    it('纯数字', () => {
      const r = engine.roll('42');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.total).toBe(42);
    });

    it('加法', () => {
      const r = engine.roll('2+3');
      expect(r.ok && r.value.total).toBe(5);
    });

    it('减法', () => {
      const r = engine.roll('10-4');
      expect(r.ok && r.value.total).toBe(6);
    });

    it('乘法', () => {
      const r = engine.roll('3*4');
      expect(r.ok && r.value.total).toBe(12);
    });

    it('整数除法（向零取整）', () => {
      const r = engine.roll('7/2');
      expect(r.ok && r.value.total).toBe(3);
    });

    it('一元负号', () => {
      const r = engine.roll('-5+10');
      expect(r.ok && r.value.total).toBe(5);
    });
  });

  describe('标准骰子', () => {
    it('固定随机数 d6', () => {
      const r = engine.roll('d6', { randomSource: seededRand([0.5]) }); // → 4
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.total).toBeGreaterThanOrEqual(1);
        expect(r.value.total).toBeLessThanOrEqual(6);
      }
    });

    it('3d6 求和', () => {
      // rand 返回 [1/6, 2/6, 3/6] → 骰出 [1, 2, 3], 总和 6
      const r = engine.roll('3d6', { randomSource: seededRand([0, 1 / 6, 2 / 6]) });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.total).toBe(1 + 2 + 3);
    });

    it('1d100 范围正确', () => {
      for (let i = 0; i < 20; i++) {
        const r = engine.roll('1d100');
        if (r.ok) {
          expect(r.value.total).toBeGreaterThanOrEqual(1);
          expect(r.value.total).toBeLessThanOrEqual(100);
        }
      }
    });

    it('4d6kh3 保留最高3个', () => {
      // [1, 6, 5, 4] → kh3 → [6, 5, 4] = 15
      const r = engine.roll('4d6kh3', {
        randomSource: seededRand([0, 5 / 6, 4 / 6, 3 / 6]),
      });
      expect(r.ok && r.value.total).toBe(15);
    });

    it('4d6kl1 保留最低', () => {
      // [1, 2, 3, 4] → kl1 → [1]
      const r = engine.roll('4d6kl1', {
        randomSource: seededRand([0, 1 / 6, 2 / 6, 3 / 6]),
      });
      expect(r.ok && r.value.total).toBe(1);
    });

    it('4d6k3 兼容 kh3', () => {
      const r1 = engine.roll('4d6kh3', { randomSource: seededRand([0, 5 / 6, 4 / 6, 3 / 6]) });
      const r2 = engine.roll('4d6k3', { randomSource: seededRand([0, 5 / 6, 4 / 6, 3 / 6]) });
      expect(r1.ok && r2.ok && r1.value.total).toBe(r2.ok && r2.value.total);
    });

    it('4d6q1 兼容 kl1', () => {
      const r1 = engine.roll('4d6kl1', { randomSource: seededRand([0, 1 / 6, 2 / 6, 3 / 6]) });
      const r2 = engine.roll('4d6q1', { randomSource: seededRand([0, 1 / 6, 2 / 6, 3 / 6]) });
      expect(r1.ok && r2.ok && r1.value.total).toBe(r2.ok && r2.value.total);
    });

    it('2d10dl1 弃低', () => {
      // [1, 8] → dl1 → keep [8]
      const r = engine.roll('2d10dl1', { randomSource: seededRand([0, 7 / 10]) });
      expect(r.ok && r.value.total).toBe(8);
    });

    it('默认面数', () => {
      const r = engine.roll('d', { defaultSides: 20, randomSource: seededRand([0.5]) });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.total).toBeGreaterThanOrEqual(1);
        expect(r.value.total).toBeLessThanOrEqual(20);
      }
    });
  });

  describe('比较式', () => {
    it('1d100<=70 判定成功', () => {
      // rand → 0.5 → roll = 51 → ≤70 成功
      const r = engine.roll('1d100<=70', { randomSource: seededRand([0.5]) });
      expect(r.ok).toBe(true);
      if (r.ok && r.value.comparison) {
        expect(r.value.comparison.success).toBe(true);
        expect(r.value.comparison.operator).toBe('<=');
      }
    });

    it('1d100<=10 判定失败', () => {
      // rand → 0.9 → roll = 91 → >10 失败
      const r = engine.roll('1d100<=10', { randomSource: seededRand([0.9]) });
      expect(r.ok).toBe(true);
      if (r.ok && r.value.comparison) {
        expect(r.value.comparison.success).toBe(false);
      }
    });
  });

  describe('多轮骰', () => {
    it('3#d6 返回 3 次结果', () => {
      const r = engine.roll('3#d6');
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.multiRoll).toHaveLength(3);
      }
    });
  });

  describe('Fate 骰', () => {
    it('4dF 结果在 -4~+4', () => {
      for (let i = 0; i < 10; i++) {
        const r = engine.roll('4dF');
        if (r.ok) {
          expect(r.value.total).toBeGreaterThanOrEqual(-4);
          expect(r.value.total).toBeLessThanOrEqual(4);
        }
      }
    });
  });

  describe('变量', () => {
    it('变量解析', () => {
      const r = engine.roll('STR+2', {
        resolveVariable: (name) => (name === 'STR' ? 15 : undefined),
      });
      expect(r.ok && r.value.total).toBe(17);
    });

    it('未知变量报错', () => {
      const r = engine.roll('UNKNOWN');
      expect(r.ok).toBe(false);
    });
  });

  describe('错误处理', () => {
    it('除以零', () => {
      const r = engine.roll('5/0');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('DICE_DIVIDE_BY_ZERO');
    });

    it('骰面为零', () => {
      const r = engine.roll('d0');
      expect(r.ok).toBe(false);
    });
  });
});
