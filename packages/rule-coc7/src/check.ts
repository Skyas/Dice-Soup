import { CocError } from './errors';
import { getSpecialLevel, getHouseRule2Special, LEVEL_NAMES } from './house-rules';
import type { HouseRule } from './house-rules';
import type { SuccessLevel, SkillCheckResult } from './types';

/**
 * 标准技能检定（1d100 vs 技能值）。
 * 返回完整判定结果，含成功等级和人类可读描述。
 */
export function skillCheck(opts: {
  rolled: number;       // 已投出的 1d100 值
  skillValue: number;   // 技能值 (1~100)
  houseRule?: HouseRule;
  skillName?: string;
  playerName?: string;
}): SkillCheckResult {
  const { rolled, skillValue, houseRule = 0, skillName = '技能', playerName } = opts;

  if (skillValue < 1 || skillValue > 100) {
    throw new CocError('COC_INVALID_SKILL_VALUE', `技能值必须在 1~100 之间，得到 ${skillValue}`);
  }

  const hard = Math.floor(skillValue / 2);
  const extreme = Math.floor(skillValue / 5);

  // 先判断标准成功等级
  let standardLevel: SuccessLevel;
  if (rolled <= extreme) standardLevel = 'extreme';
  else if (rolled <= hard) standardLevel = 'hard';
  else if (rolled <= skillValue) standardLevel = 'regular';
  else standardLevel = 'failure';

  const standardSuccess = standardLevel !== 'failure';

  // 再判断大成功/大失败（房规 2 需要 standardSuccess）
  let finalLevel: SuccessLevel;
  if (houseRule === 2) {
    const special = getHouseRule2Special(rolled, skillValue, standardSuccess);
    finalLevel = special ?? standardLevel;
  } else {
    const special = getSpecialLevel(rolled, skillValue, houseRule);
    finalLevel = special ?? standardLevel;
  }

  const isSuccess = finalLevel !== 'failure' && finalLevel !== 'fumble';

  const namePrefix = playerName ? `${playerName}的` : '';
  const detail = `${namePrefix}"${skillName}"检定结果为: D100=${rolled}/${skillValue} ${LEVEL_NAMES[finalLevel]}` +
    ` （困难:≤${hard} 极难:≤${extreme}）`;

  return { rolled, skillValue, level: finalLevel, isSuccess, houseRule, detail };
}

/**
 * 获取标准成功等级（不含大成功/大失败，供 house-rules 组合使用）。
 */
export function getStandardLevel(rolled: number, skillValue: number): SuccessLevel {
  const hard = Math.floor(skillValue / 2);
  const extreme = Math.floor(skillValue / 5);
  if (rolled <= extreme) return 'extreme';
  if (rolled <= hard) return 'hard';
  if (rolled <= skillValue) return 'regular';
  return 'failure';
}

/** 成功等级数值化（用于对抗比较） */
export function levelToNumber(level: SuccessLevel): number {
  switch (level) {
    case 'critical': return 5;
    case 'extreme':  return 4;
    case 'hard':     return 3;
    case 'regular':  return 2;
    case 'failure':  return 1;
    case 'fumble':   return 0;
  }
}
