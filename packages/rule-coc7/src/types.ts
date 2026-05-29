/** CoC 7th 技能检定成功等级 */
export type SuccessLevel =
  | 'critical'   // 大成功
  | 'extreme'    // 极难成功
  | 'hard'       // 困难成功
  | 'regular'    // 成功
  | 'failure'    // 失败
  | 'fumble';    // 大失败

/** 技能检定结果 */
export interface SkillCheckResult {
  rolled: number;            // 投出的 d100 值
  skillValue: number;        // 技能值
  level: SuccessLevel;       // 成功等级
  isSuccess: boolean;        // 是否通过
  houseRule: number;         // 使用的房规编号
  detail: string;            // 人类可读输出
}

/** 对抗检定结果 */
export interface OpposedCheckResult {
  attacker: SkillCheckResult;
  defender: SkillCheckResult;
  winner: 'attacker' | 'defender' | 'draw';
  detail: string;
}

/** 理智检定结果 */
export interface SanCheckResult {
  rolled: number;
  sanBefore: number;
  loss: number;
  sanAfter: number;
  success: boolean;
  detail: string;
}

/** 技能成长检定结果 */
export interface GrowthResult {
  skillName: string;
  currentValue: number;
  rolled: number;
  grew: boolean;
  newValue: number;
  gain: number;
  detail: string;
}

/** CoC 制卡属性 */
export interface CocCharAttributes {
  STR: number; CON: number; SIZ: number; DEX: number;
  APP: number; INT: number; POW: number; EDU: number;
  LUK: number; HP: number;
  detail: string;
}
