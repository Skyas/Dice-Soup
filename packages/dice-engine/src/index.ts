import { Parser } from './parser';
import { evaluate } from './evaluator';
import { executePowerRoll } from './power-roll';
import { formatRollResult, formatPowerRollResult } from './formatter';
import { ok, err } from './types';
import { DiceError } from './errors';
import type {
  Result,
  RollResult,
  PowerRollResult,
  PowerRollOptions,
  RollContext,
  PowerTableProvider,
} from './types';
import type { DiceAST } from './ast';

export type { Result, RollResult, PowerRollResult, PowerRollOptions, RollContext, PowerTableProvider };
export type { DiceAST };
export { DiceError };
export { executePowerRoll } from './power-roll';
export type { DiceErrorCode } from './errors';
export { formatRollResult, formatPowerRollResult };

// ── DiceEngine 公共 API ───────────────────────────────────────────────────────

export class DiceEngine {
  /**
   * 解析并执行骰子表达式。
   */
  roll(expr: string, ctx?: RollContext): Result<RollResult, DiceError> {
    try {
      const ast = new Parser(expr).parse();
      const result = evaluate(ast, ctx);
      result.expression = expr;
      return ok(result);
    } catch (e) {
      if (e instanceof DiceError) return err(e);
      return err(new DiceError('DICE_SYNTAX_ERROR', String(e)));
    }
  }

  /**
   * 仅解析为 AST，不执行（供规则层组合调用）。
   */
  parse(expr: string): Result<DiceAST, DiceError> {
    try {
      const ast = new Parser(expr).parse();
      return ok(ast);
    } catch (e) {
      if (e instanceof DiceError) return err(e);
      return err(new DiceError('DICE_SYNTAX_ERROR', String(e)));
    }
  }

  /**
   * 执行威力骰（需注入 PowerTableProvider）。
   */
  powerRoll(opts: PowerRollOptions): Result<PowerRollResult, DiceError> {
    try {
      const result = executePowerRoll(opts);
      return ok(result);
    } catch (e) {
      if (e instanceof DiceError) return err(e);
      return err(new DiceError('DICE_SYNTAX_ERROR', String(e)));
    }
  }
}

/** 默认单例 */
export const diceEngine = new DiceEngine();
