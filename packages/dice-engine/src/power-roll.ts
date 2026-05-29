import { DiceError } from './errors';
import type { PowerRollOptions, PowerRollResult, PowerRollChain } from './types';

const DEFAULT_MAX_CHAIN = 20;

/**
 * SW2.5 威力骰求值框架。
 * 规则逻辑（威力表数据）通过 PowerTableProvider 外部注入。
 */
export function executePowerRoll(opts: PowerRollOptions): PowerRollResult {
  const {
    power,
    criticalValue,
    fixedModifier = 0,
    tableProvider,
    maxChain = DEFAULT_MAX_CHAIN,
    randomSource,
    expression = '',
  } = opts;

  if (power < 0 || power > 100) {
    throw new DiceError('DICE_POWER_VALUE_OUT_OF_RANGE', `威力值必须在 0~100 之间，得到 ${power}`);
  }
  if (criticalValue < 2) {
    throw new DiceError('DICE_CRITICAL_VALUE_INVALID', `C值必须 >= 2，得到 ${criticalValue}`);
  }

  const rand = randomSource ?? (() => Math.random());
  const rollD6 = () => Math.floor(rand() * 6) + 1;

  const chains: PowerRollChain[] = [];
  let totalDamage = 0;
  let critCount = 0;

  // 首次投骰
  const firstD1 = rollD6();
  const firstD2 = rollD6();
  const firstSum = firstD1 + firstD2;

  // 出目 2 → 自动失败
  if (tableProvider.isAutoFail(firstSum)) {
    const chain: PowerRollChain = {
      dice: [firstD1, firstD2],
      sum: firstSum,
      tableDamage: 0,
      isCritical: false,
    };
    chains.push(chain);
    return buildResult(chains, 0, fixedModifier, critCount, true, expression);
  }

  // 链式投骰
  let d1 = firstD1;
  let d2 = firstD2;
  let sum = firstSum;
  let chainIndex = 0;

  while (chainIndex < maxChain) {
    const damage = tableProvider.lookup(power, sum);
    const isCritical = sum >= criticalValue;

    chains.push({ dice: [d1, d2], sum, tableDamage: damage, isCritical });
    totalDamage += damage;
    chainIndex++;

    if (!isCritical) break;

    // 振り足し：继续投骰
    critCount++;
    if (chainIndex >= maxChain) {
      throw new DiceError('DICE_POWER_CHAIN_LIMIT', `威力骰链式次数超过上限 ${maxChain}`);
    }
    d1 = rollD6();
    d2 = rollD6();
    sum = d1 + d2;
  }

  return buildResult(chains, totalDamage, fixedModifier, critCount, false, expression);
}

function buildResult(
  chains: PowerRollChain[],
  totalDamage: number,
  modifier: number,
  critCount: number,
  autoFail: boolean,
  expression: string,
): PowerRollResult {
  const finalDamage = autoFail ? 0 : totalDamage + modifier;

  const detailLines: string[] = [];
  chains.forEach((c, i) => {
    const critMark = c.isCritical ? ' → 振り足し！' : '';
    const autoMark = autoFail && i === 0 ? ' → 自动失败（出目2）' : '';
    detailLines.push(
      `  第${i + 1}链: 2d6=[${c.dice[0]},${c.dice[1]}]=${c.sum} → 查表得 ${c.tableDamage}${critMark}${autoMark}`,
    );
  });

  if (!autoFail) {
    const sumStr = chains.map((c) => c.tableDamage).join('+');
    const modStr = modifier !== 0 ? `，追加${modifier >= 0 ? '+' : ''}${modifier}` : '';
    detailLines.push(`  合计: ${sumStr}=${totalDamage}${modStr}，最终伤害 = ${finalDamage}`);
  }

  return {
    totalDamage,
    modifier,
    finalDamage,
    chains,
    critCount,
    autoFail,
    expression,
    detail: detailLines.join('\n'),
  };
}
