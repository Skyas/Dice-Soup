/** SW2.5 行为判定结果 */
export interface BehaviorCheckResult {
  dice: [number, number];
  diceSum: number;
  modifier: number;
  total: number;
  targetValue?: number;
  success?: boolean;
  isAutoSuccess: boolean;
  isAutoFail: boolean;
  detail: string;
}

/** SW2.5 威力骰完整结果（高层封装） */
export interface Sw25PowerRollResult {
  power: number;
  criticalValue: number;
  modifier: number;
  chains: Sw25PowerChain[];
  totalDamage: number;
  finalDamage: number;
  critCount: number;
  autoFail: boolean;
  detail: string;
}

export interface Sw25PowerChain {
  dice: [number, number];
  sum: number;
  tableDamage: number;
  isCritical: boolean;
}
