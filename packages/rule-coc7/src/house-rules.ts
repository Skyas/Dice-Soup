import { CocError } from './errors';
import type { SuccessLevel } from './types';

export const VALID_HOUSE_RULES = [0, 1, 2, 3, 4, 5] as const;
export type HouseRule = (typeof VALID_HOUSE_RULES)[number];

/**
 * 根据房规和投骰结果判断大成功/大失败。
 * 返回 'critical' | 'fumble' | null（null = 由标准等级判定）。
 */
export function getSpecialLevel(
  rolled: number,
  skillValue: number,
  houseRule: HouseRule,
): 'critical' | 'fumble' | null {
  switch (houseRule) {
    case 0:
      return getHouseRule0(rolled, skillValue);
    case 1:
      return getHouseRule1(rolled, skillValue);
    case 2:
      return getHouseRule2(rolled, skillValue);
    case 3:
      return getHouseRule3(rolled, skillValue);
    case 4:
      return getHouseRule4(rolled, skillValue);
    case 5:
      return getHouseRule5(rolled, skillValue);
  }
}

/** 房规 0（规则书默认）：出1=大成功；技能<50时96-100=大失败，技能≥50时100=大失败 */
function getHouseRule0(rolled: number, skill: number): 'critical' | 'fumble' | null {
  if (rolled === 1) return 'critical';
  if (skill < 50 && rolled >= 96) return 'fumble';
  if (skill >= 50 && rolled === 100) return 'fumble';
  return null;
}

/** 房规 1：技能<50时出1=大成功；大失败同0 */
function getHouseRule1(rolled: number, skill: number): 'critical' | 'fumble' | null {
  if (skill < 50 && rolled === 1) return 'critical';
  if (skill >= 50 && rolled === 1) return null; // 技能≥50时出1不特殊
  if (skill < 50 && rolled >= 96) return 'fumble';
  if (skill >= 50 && rolled === 100) return 'fumble';
  return null;
}

/** 房规 2（常用房规）：出1-5且检定成功=大成功；出96-100且检定失败=大失败 */
export function getHouseRule2Special(
  rolled: number,
  _skill: number,
  standardSuccess: boolean,
): 'critical' | 'fumble' | null {
  if (rolled <= 5 && standardSuccess) return 'critical';
  if (rolled >= 96 && !standardSuccess) return 'fumble';
  return null;
}

function getHouseRule2(_rolled: number, _skill: number): 'critical' | 'fumble' | null {
  // 此函数仅用于预判断，返回 null 表示交由 check.ts 处理
  return null;
}

/** 房规 3：出1-5（无视判定）=大成功；出96-100=大失败 */
function getHouseRule3(rolled: number, _skill: number): 'critical' | 'fumble' | null {
  if (rolled <= 5) return 'critical';
  if (rolled >= 96) return 'fumble';
  return null;
}

/** 房规 4：出1-5且≤技能值/10=大成功；技能<50时≥96+技能值/10=大失败 */
function getHouseRule4(rolled: number, skill: number): 'critical' | 'fumble' | null {
  if (rolled <= 5 && rolled <= Math.floor(skill / 10)) return 'critical';
  if (skill < 50 && rolled >= 96 + Math.floor(skill / 10)) return 'fumble';
  if (skill >= 50 && rolled === 100) return 'fumble';
  return null;
}

/** 房规 5：出1-2且≤技能值/5=大成功；技能<50时96-100=大失败；技能≥50时99-100=大失败 */
function getHouseRule5(rolled: number, skill: number): 'critical' | 'fumble' | null {
  if (rolled <= 2 && rolled <= Math.floor(skill / 5)) return 'critical';
  if (skill < 50 && rolled >= 96) return 'fumble';
  if (skill >= 50 && rolled >= 99) return 'fumble';
  return null;
}

export function validateHouseRule(n: number): HouseRule {
  if (!VALID_HOUSE_RULES.includes(n as HouseRule)) {
    throw new CocError('COC_INVALID_HOUSE_RULE', `房规编号必须为 0~5，得到 ${n}`);
  }
  return n as HouseRule;
}

export const LEVEL_NAMES: Record<SuccessLevel, string> = {
  critical: '大成功',
  extreme:  '极难成功',
  hard:     '困难成功',
  regular:  '成功',
  failure:  '失败',
  fumble:   '大失败',
};
