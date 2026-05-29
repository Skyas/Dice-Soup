import { describe, it, expect } from 'vitest';
import { executePowerRoll } from '../power-roll';
import type { PowerTableProvider } from '../types';
import { DiceError } from '../errors';

// 简单的测试用 PowerTableProvider
const mockTable: PowerTableProvider = {
  lookup(power: number, diceSum: number): number {
    // 简化：power/10 + diceSum - 2
    return Math.max(0, Math.floor(power / 10) + diceSum - 2);
  },
  isAutoFail(diceSum: number): boolean {
    return diceSum === 2;
  },
};

function seededRand(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

// d6 出目: rand * 6 + 1 → floor(rand*6)+1
// rand=0.0 → 1, rand=1/6 → 2, rand=2/6 → 3, rand=4/6 → 5, rand=5/6 → 6

describe('PowerRoll', () => {
  it('基本威力骰无爆击', () => {
    // 2d6 = [3, 4] = 7, 不触发爆击(C值10)
    const result = executePowerRoll({
      power: 30,
      criticalValue: 10,
      tableProvider: mockTable,
      randomSource: seededRand([2 / 6, 3 / 6]), // → d6: 3, 4
    });
    expect(result.autoFail).toBe(false);
    expect(result.chains).toHaveLength(1);
    expect(result.critCount).toBe(0);
    expect(result.chains[0]!.sum).toBe(7);
    expect(result.chains[0]!.isCritical).toBe(false);
  });

  it('自动失败（出目2）', () => {
    const result = executePowerRoll({
      power: 30,
      criticalValue: 10,
      tableProvider: mockTable,
      randomSource: seededRand([0, 0]), // → 1+1=2
    });
    expect(result.autoFail).toBe(true);
    expect(result.finalDamage).toBe(0);
    expect(result.chains).toHaveLength(1);
  });

  it('爆击链式投骰', () => {
    // 第1次: [5,6]=11 ≥10 → 爆击 → 第2次: [2,3]=5 < 10 → 停止
    const result = executePowerRoll({
      power: 20,
      criticalValue: 10,
      tableProvider: mockTable,
      randomSource: seededRand([4 / 6, 5 / 6, 1 / 6, 2 / 6]),
    });
    expect(result.critCount).toBeGreaterThanOrEqual(1);
    expect(result.chains.length).toBeGreaterThanOrEqual(2);
  });

  it('固定追加值', () => {
    const result = executePowerRoll({
      power: 30,
      criticalValue: 10,
      fixedModifier: 4,
      tableProvider: mockTable,
      randomSource: seededRand([2 / 6, 3 / 6]), // [3,4]=7
    });
    expect(result.modifier).toBe(4);
    expect(result.finalDamage).toBe(result.totalDamage + 4);
  });

  it('C值≥13 永不爆击', () => {
    // 投多次，确保出目12也不触发
    const result = executePowerRoll({
      power: 30,
      criticalValue: 13,
      tableProvider: mockTable,
      randomSource: seededRand([5 / 6, 5 / 6]), // → [6,6]=12 < 13
    });
    expect(result.critCount).toBe(0);
    expect(result.chains).toHaveLength(1);
  });

  it('安全上限 maxChain', () => {
    // 每次出目都 ≥ C值，应该在 maxChain 次后抛错
    expect(() => executePowerRoll({
      power: 30,
      criticalValue: 2,
      tableProvider: mockTable,
      maxChain: 5,
      randomSource: seededRand([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    })).toThrow(DiceError);
  });

  it('威力值超范围报错', () => {
    expect(() => executePowerRoll({
      power: 101,
      criticalValue: 10,
      tableProvider: mockTable,
    })).toThrow(DiceError);
  });

  it('负威力值报错', () => {
    expect(() => executePowerRoll({
      power: -1,
      criticalValue: 10,
      tableProvider: mockTable,
    })).toThrow(DiceError);
  });

  it('detail 输出包含链式信息', () => {
    const result = executePowerRoll({
      power: 30,
      criticalValue: 10,
      tableProvider: mockTable,
      randomSource: seededRand([2 / 6, 3 / 6]),
    });
    expect(result.detail).toContain('第1链');
    expect(result.detail).toContain('最终伤害');
  });
});
