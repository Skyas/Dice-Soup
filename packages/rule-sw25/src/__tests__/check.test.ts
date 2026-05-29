import { describe, it, expect } from 'vitest';
import { behaviorCheck } from '../check';

function seededRand(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('SW2.5 行为判定', () => {
  it('基本判定（无目标值）', () => {
    const r = behaviorCheck({ modifier: 3, rand: seededRand([2 / 6, 3 / 6]) });
    expect(r.diceSum).toBe(7);
    expect(r.total).toBe(10);
    expect(r.success).toBeUndefined();
  });

  it('vs 目标值成功', () => {
    const r = behaviorCheck({ modifier: 5, targetValue: 12, rand: seededRand([2 / 6, 3 / 6]) });
    expect(r.success).toBe(true);
  });

  it('vs 目标值失败', () => {
    const r = behaviorCheck({ modifier: 0, targetValue: 12, rand: seededRand([0, 0]) });
    // [1,1]=2 → 自动失败
    expect(r.isAutoFail).toBe(true);
    expect(r.success).toBe(false);
  });

  it('双6=自动成功', () => {
    // rand → 5/6 → d6=6
    const r = behaviorCheck({ modifier: 0, targetValue: 20, rand: seededRand([5 / 6, 5 / 6]) });
    expect(r.isAutoSuccess).toBe(true);
    expect(r.success).toBe(true);
    expect(r.total).toBe(17); // 12+5+0
  });

  it('双1=自动失败', () => {
    const r = behaviorCheck({ modifier: 100, targetValue: 1, rand: seededRand([0, 0]) });
    expect(r.isAutoFail).toBe(true);
    expect(r.success).toBe(false);
  });

  it('detail 包含关键信息', () => {
    const r = behaviorCheck({ modifier: 3, targetValue: 10, playerName: '骑士', rand: seededRand([2 / 6, 3 / 6]) });
    expect(r.detail).toContain('骑士');
    expect(r.detail).toContain('2d6');
    expect(r.detail).toContain('10');
  });
});
