import type { GrowthResult } from './types';

export interface GrowthOpts {
  skillName: string;
  currentValue: number;
  rolled: number;         // 已投 1d100
  gainRolled: number;     // 成功时成长值（已投，默认 1d10）
}

/**
 * 技能成长检定。
 * 规则：投 1d100，若 > 当前技能值 → 成功，技能值 += gainRolled。
 */
export function growthCheck(opts: GrowthOpts): GrowthResult {
  const { skillName, currentValue, rolled, gainRolled } = opts;

  const grew = rolled > currentValue;
  const newValue = grew ? currentValue + gainRolled : currentValue;
  const gain = grew ? gainRolled : 0;

  const resultStr = grew
    ? `成功！${skillName} +${gain} → ${newValue}`
    : `失败，${skillName} 保持 ${currentValue}`;

  const detail = `${skillName} 成长检定: D100=${rolled}/${currentValue} → ${resultStr}`;

  return { skillName, currentValue, rolled, grew, newValue, gain, detail };
}
