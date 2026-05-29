import type { RollResult, PowerRollResult } from './types';

/**
 * 格式化普通骰子结果为人类可读字符串。
 */
export function formatRollResult(result: RollResult, expr: string): string {
  if (result.multiRoll) {
    const lines = result.multiRoll.map((r, i) => `  第${i + 1}次: ${r.detail}`);
    return `[🎲] ${expr}\n${lines.join('\n')}`;
  }

  if (result.comparison) {
    const { operator, target, actual, success } = result.comparison;
    const successStr = success ? '✅ 成功' : '❌ 失败';
    return `[🎲] ${expr} = ${actual} ${operator} ${target} → ${successStr}`;
  }

  return `[🎲] ${expr} = ${result.detail}`;
}

/**
 * 格式化威力骰结果为人类可读多行字符串。
 */
export function formatPowerRollResult(result: PowerRollResult, playerName = ''): string {
  const header = playerName
    ? `[🎲 Dice&Soup] ${playerName} 威力骰 ${result.expression}`
    : `[🎲] 威力骰 ${result.expression}`;
  return `${header}\n${result.detail}`;
}
