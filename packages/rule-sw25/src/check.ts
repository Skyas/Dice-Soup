import type { BehaviorCheckResult } from './types';

type RandFn = () => number;

function rollD6(rand: RandFn): number {
  return Math.floor(rand() * 6) + 1;
}

/**
 * SW2.5 行为判定。
 * 达成值 = 2d6 + modifier，与目标值比较。
 * 特殊出目：双6=自动成功（视为骰出值+5），双1=自动失败。
 */
export function behaviorCheck(opts: {
  modifier?: number;
  targetValue?: number;
  rand?: RandFn;
  playerName?: string;
  checkName?: string;
}): BehaviorCheckResult {
  const {
    modifier = 0,
    targetValue,
    rand = () => Math.random(),
    playerName,
    checkName = '行为判定',
  } = opts;

  const d1 = rollD6(rand);
  const d2 = rollD6(rand);
  const diceSum = d1 + d2;

  const isAutoSuccess = diceSum === 12;
  const isAutoFail = diceSum === 2;

  // 自动成功时视为骰出值+5计算达成值
  const effectiveSum = isAutoSuccess ? 12 + 5 : diceSum;
  const total = effectiveSum + modifier;

  let success: boolean | undefined;
  if (targetValue !== undefined) {
    if (isAutoSuccess) success = true;
    else if (isAutoFail) success = false;
    else success = total >= targetValue;
  }

  const namePrefix = playerName ? `${playerName} ` : '';
  const autoStr = isAutoSuccess ? '【自动成功！】' : isAutoFail ? '【自动失败！】' : '';
  const modStr = modifier !== 0 ? `${modifier >= 0 ? '+' : ''}${modifier}` : '';
  const vsStr = targetValue !== undefined ? ` vs ${targetValue} → ${success ? '成功' : '失败'}` : '';
  const detail =
    `${namePrefix}${checkName}: 2d6=[${d1},${d2}]=${diceSum}${modStr}=达成值${total}${autoStr}${vsStr}`;

  return { dice: [d1, d2], diceSum, modifier, total, targetValue, success, isAutoSuccess, isAutoFail, detail };
}
