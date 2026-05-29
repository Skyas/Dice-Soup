/**
 * CoC 奖励骰 / 惩罚骰。
 * 这里提供高层封装：已调 dice-engine 计算，再作 CoC 格式化。
 * 实际骰子投掷通过 DiceEngine 处理（b/p token）。
 */

export interface BonusPenaltyResult {
  tensPool: number[];  // 所有十位骰出目（0~9）
  units: number;       // 个位骰出目（0~9）
  chosenTens: number;  // 实际使用的十位（奖励取最小，惩罚取最大）
  total: number;       // 最终百分骰结果（1~100）
  detail: string;
}

/**
 * 计算 CoC 奖励骰结果（纯计算，需外部传入已投出的随机值）。
 * @param tensValues 十位骰出目（0~9，共 extra+1 个）
 * @param unitValue  个位骰出目（0~9）
 * @param isBonus    true=奖励骰（取最小），false=惩罚骰（取最大）
 */
export function calcBonusPenalty(
  tensValues: number[],
  unitValue: number,
  isBonus: boolean,
): BonusPenaltyResult {
  const chosenTens = isBonus
    ? Math.min(...tensValues)
    : Math.max(...tensValues);

  // 00（十位=0）+ 0（个位=0）= 100（非 0）
  const total = chosenTens === 0 && unitValue === 0 ? 100 : chosenTens * 10 + unitValue;

  const diceStr = tensValues.map((t) => t === 0 ? '00' : String(t * 10)).join('/');
  const unitStr = unitValue === 0 ? '0' : String(unitValue);
  const chosenStr = chosenTens === 0 ? '00' : String(chosenTens * 10);
  const typeStr = isBonus ? '奖励骰' : '惩罚骰';

  const detail = `${typeStr}: 十位=[${diceStr}]，个位=${unitStr}，选${chosenStr} → ${total}`;

  return { tensPool: tensValues, units: unitValue, chosenTens, total, detail };
}
