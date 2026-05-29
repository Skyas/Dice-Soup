// ── Result 类型 ─────────────────────────────────────────────────────────────

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ── 骰子结果类型 ─────────────────────────────────────────────────────────────

export interface RollStep {
  type: 'dice' | 'bonus_penalty' | 'fate' | 'constant' | 'power';
  label: string;
  rolls?: number[];
  kept?: number[];
  dropped?: number[];
  total: number;
}

export interface CompareResult {
  target: number;
  actual: number;
  success: boolean;
  operator: '<=' | '>=' | '<' | '>' | '=';
}

export interface RollResult {
  total: number;
  expression: string;
  detail: string;
  breakdown: RollStep[];
  comparison?: CompareResult;
  multiRoll?: RollResult[];
}

// ── 威力骰结果类型 ───────────────────────────────────────────────────────────

export interface PowerRollChain {
  dice: [number, number];
  sum: number;
  tableDamage: number;
  isCritical: boolean;
}

export interface PowerRollResult {
  totalDamage: number;
  modifier: number;
  finalDamage: number;
  chains: PowerRollChain[];
  critCount: number;
  autoFail: boolean;
  expression: string;
  detail: string;
}

// ── Provider 接口 ────────────────────────────────────────────────────────────

export interface PowerTableProvider {
  lookup(power: number, diceSum: number): number;
  isAutoFail(diceSum: number): boolean;
}

// ── 选项类型 ─────────────────────────────────────────────────────────────────

export interface PowerRollOptions {
  power: number;
  criticalValue: number;
  fixedModifier?: number;
  tableProvider: PowerTableProvider;
  maxChain?: number;
  randomSource?: () => number;
  expression?: string;
}

export interface RollContext {
  resolveVariable?: (name: string) => number | undefined;
  defaultSides?: number;
  randomSource?: () => number;
}
