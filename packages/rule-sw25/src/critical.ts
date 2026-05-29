import { DiceEngine } from '@dice-soup/dice-engine';

const engine = new DiceEngine();

/**
 * 解析临界值规格。
 * 支持两种格式：
 *   - 纯整数（如 "10"、"9"）→ 直接作为 C 值
 *   - 含表达式（如 "10-1"、"10+2"）→ 用 DiceEngine 求值
 *
 * 调用者无需关心括号格式（已在 parser 层处理为 PowerRollNode.critSpec）。
 */
export function parseCriticalValue(critExpr: string): number {
  const r = engine.roll(critExpr);
  if (!r.ok) {
    throw new Error(`C值表达式无效: ${critExpr}`);
  }
  return r.value.total;
}

/** C 值默认值（省略 @ 时使用） */
export const DEFAULT_CRIT_VALUE = 10;

/** C 值 ≥ 13 时不会爆击（2d6 最大 12） */
export function isNeverCrit(critValue: number): boolean {
  return critValue >= 13;
}
