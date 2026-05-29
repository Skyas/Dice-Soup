import { CocError } from './errors';
import type { SanCheckResult } from './types';

export interface SanCheckOpts {
  rolled: number;        // 已投 1d100
  sanValue: number;      // 当前 SAN 值
  successLoss: number;   // 成功时的 SAN 损失值
  failureLoss: number;   // 失败时的 SAN 损失值
  cap?: number;          // 损失上限（--cap）
  half?: boolean;        // 先减半（--half）
  playerName?: string;
}

/**
 * 理智检定。
 * 检定规则：投 1d100 ≤ 当前 SAN 值 → 成功（损失少）。
 * 应用顺序（若同时启用）：先减半，再上限截断。
 */
export function sanCheck(opts: SanCheckOpts): SanCheckResult {
  const { rolled, sanValue, successLoss, failureLoss, cap, half, playerName } = opts;

  if (sanValue < 0 || sanValue > 99) {
    throw new CocError('COC_INVALID_SAN_VALUE', `SAN 值必须在 0~99 之间，得到 ${sanValue}`);
  }

  const success = rolled <= sanValue;
  let loss = success ? successLoss : failureLoss;

  if (half) loss = Math.ceil(loss / 2);
  if (cap !== undefined && loss > cap) loss = cap;

  const sanAfter = Math.max(0, sanValue - loss);

  const namePrefix = playerName ? `${playerName} ` : '';
  const successStr = success ? '成功' : '失败';
  const halfStr = half ? '（已减半）' : '';
  const capStr = cap !== undefined ? `（上限${cap}）` : '';
  const detail = `${namePrefix}理智检定: D100=${rolled}/${sanValue} ${successStr} → SAN ${sanValue}→${sanAfter}（损失${loss}${halfStr}${capStr}）`;

  return { rolled, sanBefore: sanValue, loss, sanAfter, success, detail };
}
