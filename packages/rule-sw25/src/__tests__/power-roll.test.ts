import { describe, it, expect } from 'vitest';
import { sw25PowerRoll } from '../power-roll';
import { sw25PowerTable } from '../power-table';

function seededRand(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('SW2.5 威力骰', () => {
  it('r30@10 无爆击', () => {
    // [3,4]=7 → 查表 power30 diceSum7 = 7，不爆
    const r = sw25PowerRoll({
      power: 30,
      criticalValue: 10,
      rand: seededRand([2 / 6, 3 / 6]),
    });
    expect(r.autoFail).toBe(false);
    expect(r.critCount).toBe(0);
    expect(r.chains).toHaveLength(1);
    expect(r.chains[0]!.tableDamage).toBe(sw25PowerTable.lookup(30, 7));
  });

  it('r30@10+4 追加值', () => {
    const r = sw25PowerRoll({
      power: 30,
      criticalValue: 10,
      modifier: 4,
      rand: seededRand([2 / 6, 3 / 6]),
    });
    expect(r.modifier).toBe(4);
    expect(r.finalDamage).toBe(r.totalDamage + 4);
  });

  it('自动失败（出目2）', () => {
    const r = sw25PowerRoll({
      power: 30,
      criticalValue: 10,
      rand: seededRand([0, 0]),
    });
    expect(r.autoFail).toBe(true);
    expect(r.finalDamage).toBe(0);
  });

  it('r30@13 永不爆击', () => {
    // 出目12 < 13，不爆
    const r = sw25PowerRoll({
      power: 30,
      criticalValue: 13,
      rand: seededRand([5 / 6, 5 / 6]),
    });
    expect(r.critCount).toBe(0);
    expect(r.chains).toHaveLength(1);
  });

  it('detail 包含链式信息', () => {
    const r = sw25PowerRoll({
      power: 30,
      criticalValue: 10,
      playerName: '战士甲',
      rand: seededRand([2 / 6, 3 / 6]),
    });
    expect(r.detail).toContain('战士甲');
    expect(r.detail).toContain('第1链');
    expect(r.detail).toContain('最终伤害');
  });

  it('威力表查表结果正确 - power10 diceSum8', () => {
    const r = sw25PowerRoll({
      power: 10,
      criticalValue: 13,
      rand: seededRand([3 / 6, 3 / 6]), // → d6: 4, 4 → sum=8
    });
    // power10 sum8 = 4（查计划书表格）
    expect(r.chains[0]!.tableDamage).toBe(sw25PowerTable.lookup(10, 8));
  });
});
