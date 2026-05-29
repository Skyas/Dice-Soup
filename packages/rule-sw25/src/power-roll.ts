import { executePowerRoll } from '@dice-soup/dice-engine';
import { sw25PowerTable } from './power-table';
import { DEFAULT_CRIT_VALUE } from './critical';
import type { Sw25PowerRollResult, Sw25PowerChain } from './types';

type RandFn = () => number;

export interface Sw25PowerRollOpts {
  power: number;
  criticalValue?: number;   // 省略时默认 DEFAULT_CRIT_VALUE (10)
  modifier?: number;        // 固定追加值（力量加值 + 技能等级 + 其他）
  maxChain?: number;
  rand?: RandFn;
  expression?: string;
  playerName?: string;
}

/**
 * SW2.5 威力骰高层封装。
 * 调用 dice-engine 的 executePowerRoll，注入 sw25PowerTable。
 */
export function sw25PowerRoll(opts: Sw25PowerRollOpts): Sw25PowerRollResult {
  const {
    power,
    criticalValue = DEFAULT_CRIT_VALUE,
    modifier = 0,
    maxChain,
    rand,
    expression = `r${power}@${criticalValue}`,
    playerName,
  } = opts;

  const result = executePowerRoll({
    power,
    criticalValue,
    fixedModifier: modifier,
    tableProvider: sw25PowerTable,
    maxChain,
    randomSource: rand,
    expression,
  });

  const chains: Sw25PowerChain[] = result.chains.map((c) => ({
    dice: c.dice,
    sum: c.sum,
    tableDamage: c.tableDamage,
    isCritical: c.isCritical,
  }));

  const header = playerName
    ? `[🎲 Dice&Soup] ${playerName} 威力骰 ${expression}`
    : `威力骰 ${expression}`;

  return {
    power,
    criticalValue,
    modifier,
    chains,
    totalDamage: result.totalDamage,
    finalDamage: result.finalDamage,
    critCount: result.critCount,
    autoFail: result.autoFail,
    detail: `${header}\n${result.detail}`,
  };
}
