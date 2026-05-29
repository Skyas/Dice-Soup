import { describe, it, expect } from 'vitest';
import { DiceEngine } from '../index';

const engine = new DiceEngine();

describe('集成测试', () => {
  it('.r 3d6+2 标准骰', () => {
    const r = engine.roll('3d6+2');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total).toBeGreaterThanOrEqual(5);  // 3+2
      expect(r.value.total).toBeLessThanOrEqual(20);    // 18+2
    }
  });

  it('.r 4d6kh3 人物生成', () => {
    const r = engine.roll('4d6kh3');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total).toBeGreaterThanOrEqual(3);
      expect(r.value.total).toBeLessThanOrEqual(18);
    }
  });

  it('.r 2d10dl1 弃低', () => {
    const r = engine.roll('2d10dl1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total).toBeGreaterThanOrEqual(1);
      expect(r.value.total).toBeLessThanOrEqual(10);
    }
  });

  it('.r 4d6k3 === .r 4d6kh3', () => {
    // 用固定随机数确保两者结果相同
    let seed = 0;
    const fixed = () => {
      seed = (seed + 0.17) % 1;
      return seed;
    };
    const r1 = engine.roll('4d6k3', { randomSource: fixed });
    seed = 0;
    const r2 = engine.roll('4d6kh3', { randomSource: fixed });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.total).toBe(r2.value.total);
    }
  });

  it('.r 1d100<=70 包含 comparison', () => {
    const r = engine.roll('1d100<=70');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.comparison).toBeDefined();
      expect(r.value.comparison?.operator).toBe('<=');
      expect(r.value.comparison?.target).toBe(70);
    }
  });

  it('.r 3#d6+2 多轮骰', () => {
    const r = engine.roll('3#d6+2');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.multiRoll).toHaveLength(3);
      r.value.multiRoll?.forEach((sub) => {
        expect(sub.total).toBeGreaterThanOrEqual(3);
        expect(sub.total).toBeLessThanOrEqual(8);
      });
    }
  });

  it('.r 4dF fate骰范围', () => {
    const r = engine.roll('4dF');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total).toBeGreaterThanOrEqual(-4);
      expect(r.value.total).toBeLessThanOrEqual(4);
    }
  });

  it('.r d20优势 兼容', () => {
    const r = engine.roll('d20优势');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total).toBeGreaterThanOrEqual(1);
      expect(r.value.total).toBeLessThanOrEqual(20);
    }
  });

  it('.r d20劣势 兼容', () => {
    const r = engine.roll('d20劣势');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total).toBeGreaterThanOrEqual(1);
      expect(r.value.total).toBeLessThanOrEqual(20);
    }
  });

  it('parse API 返回 AST', () => {
    const r = engine.parse('3d6+2');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.type).toBe('binary');
    }
  });

  it('无效表达式返回 err', () => {
    const r = engine.roll('not_a_var_without_context');
    expect(r.ok).toBe(false);
  });
});
