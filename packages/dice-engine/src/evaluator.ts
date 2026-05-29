import { DiceError } from './errors';
import type {
  DiceAST,
  DiceRollNode,
  BonusDieNode,
  PenaltyDieNode,
  FateDieNode,
} from './ast';
import type { RollResult, RollStep, CompareResult, RollContext } from './types';

const DEFAULT_SIDES = 100;
const MAX_DICE_COUNT = 1000;
const MAX_DICE_SIDES = 100_000;

interface EvalContext {
  resolveVariable?: (name: string) => number | undefined;
  defaultSides: number;
  rand: () => number;
  steps: RollStep[];
}

function makeRand(source?: () => number): () => number {
  return source ?? (() => Math.random());
}

function rollInt(rand: () => number, sides: number): number {
  return Math.floor(rand() * sides) + 1;
}

// ── Public evaluator ─────────────────────────────────────────────────────────

export function evaluate(ast: DiceAST, ctx: RollContext = {}): RollResult {
  const evalCtx: EvalContext = {
    resolveVariable: ctx.resolveVariable,
    defaultSides: ctx.defaultSides ?? DEFAULT_SIDES,
    rand: makeRand(ctx.randomSource),
    steps: [],
  };

  // multi_roll
  if (ast.type === 'multi_roll') {
    const multiRoll: RollResult[] = [];
    for (let i = 0; i < ast.count; i++) {
      const subCtx: EvalContext = { ...evalCtx, steps: [] };
      const total = evalNode(ast.expr, subCtx);
      multiRoll.push({
        total,
        expression: '',
        detail: buildDetail(subCtx.steps, total),
        breakdown: subCtx.steps,
      });
    }
    const totals = multiRoll.map((r) => r.total);
    return {
      total: totals.reduce((a, b) => a + b, 0),
      expression: '',
      detail: multiRoll.map((r, i) => `第${i + 1}次: ${r.detail}`).join('\n'),
      breakdown: [],
      multiRoll,
    };
  }

  // compare
  if (ast.type === 'compare') {
    const actual = evalNode(ast.left, evalCtx);
    const target = evalNode(ast.right, evalCtx);
    const success = compare(actual, ast.operator, target);
    const comparison: CompareResult = { target, actual, success, operator: ast.operator };
    const detail = buildDetail(evalCtx.steps, actual) + ` ${ast.operator} ${target} → ${success ? '成功' : '失败'}`;
    return { total: actual, expression: '', detail, breakdown: evalCtx.steps, comparison };
  }

  const total = evalNode(ast, evalCtx);
  const detail = buildDetail(evalCtx.steps, total);
  return { total, expression: '', detail, breakdown: evalCtx.steps };
}

function compare(actual: number, op: CompareResult['operator'], target: number): boolean {
  switch (op) {
    case '<=': return actual <= target;
    case '>=': return actual >= target;
    case '<':  return actual < target;
    case '>':  return actual > target;
    case '=':  return actual === target;
  }
}

// ── Node evaluator ───────────────────────────────────────────────────────────

export function evalNode(ast: DiceAST, ctx: EvalContext): number {
  switch (ast.type) {
    case 'number':
      return ast.value;

    case 'variable': {
      const val = ctx.resolveVariable?.(ast.name);
      if (val === undefined) {
        throw new DiceError('DICE_UNKNOWN_VARIABLE', `未知变量 "${ast.name}"`);
      }
      return val;
    }

    case 'unary':
      return -evalNode(ast.operand, ctx);

    case 'binary': {
      const l = evalNode(ast.left, ctx);
      const r = evalNode(ast.right, ctx);
      switch (ast.operator) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/':
          if (r === 0) throw new DiceError('DICE_DIVIDE_BY_ZERO', '除以零');
          return Math.trunc(l / r);
      }
    }

    case 'dice_roll':
      return evalDiceRoll(ast, ctx);

    case 'bonus_die':
      return evalBonusDie(ast, ctx);

    case 'penalty_die':
      return evalPenaltyDie(ast, ctx);

    case 'fate_die':
      return evalFateDie(ast, ctx);

    case 'compare':
      throw new DiceError('DICE_SYNTAX_ERROR', '比较式不能嵌套在表达式中');

    case 'multi_roll':
      throw new DiceError('DICE_SYNTAX_ERROR', '多轮骰 (#) 不能嵌套在表达式中');

    case 'power_roll':
      throw new DiceError('DICE_SYNTAX_ERROR', '威力骰不能嵌套在普通表达式中');
  }
}

// ── Dice roll ────────────────────────────────────────────────────────────────

function evalDiceRoll(node: DiceRollNode, ctx: EvalContext): number {
  if (node.sides === 'fate') {
    return evalFateDie({ type: 'fate_die', count: node.count?.type === 'number' ? node.count.value : 1 }, ctx);
  }

  let sides: number;
  if (node.sides === null) {
    sides = ctx.defaultSides;
  } else {
    sides = evalNode(node.sides, ctx);
  }
  if (sides <= 0) throw new DiceError('DICE_SIDES_ZERO', `骰面数必须 > 0，得到 ${sides}`);
  if (sides > MAX_DICE_SIDES) throw new DiceError('DICE_SIDES_ZERO', `骰面数过大: ${sides}`);

  const count = node.count !== null ? evalNode(node.count, ctx) : 1;
  if (!Number.isInteger(count) || count <= 0) {
    throw new DiceError('DICE_COUNT_INVALID', `骰子数量必须为正整数，得到 ${count}`);
  }
  if (count > MAX_DICE_COUNT) {
    throw new DiceError('DICE_COUNT_INVALID', `骰子数量过多: ${count}`);
  }

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollInt(ctx.rand, sides));
  }

  const { kept, dropped, total } = applyModifier(rolls, node.modifier);
  const label = `${count}d${sides}`;
  ctx.steps.push({ type: 'dice', label, rolls, kept, dropped, total });
  return total;
}

function applyModifier(
  rolls: number[],
  modifier: DiceRollNode['modifier'],
): { kept: number[]; dropped: number[]; total: number } {
  if (!modifier) {
    return { kept: rolls, dropped: [], total: rolls.reduce((a, b) => a + b, 0) };
  }

  const sorted = [...rolls].sort((a, b) => b - a); // descending

  let kept: number[];
  let dropped: number[];

  switch (modifier.op) {
    case 'kh': {
      if (modifier.n > rolls.length) {
        throw new DiceError('DICE_KEEP_TOO_MANY', `要保留 ${modifier.n} 个，但只有 ${rolls.length} 个骰子`);
      }
      kept = sorted.slice(0, modifier.n);
      dropped = sorted.slice(modifier.n);
      break;
    }
    case 'kl': {
      if (modifier.n > rolls.length) {
        throw new DiceError('DICE_KEEP_TOO_MANY', `要保留 ${modifier.n} 个，但只有 ${rolls.length} 个骰子`);
      }
      kept = sorted.slice(rolls.length - modifier.n);
      dropped = sorted.slice(0, rolls.length - modifier.n);
      break;
    }
    case 'dh': {
      kept = sorted.slice(modifier.n);
      dropped = sorted.slice(0, modifier.n);
      break;
    }
    case 'dl': {
      kept = sorted.slice(0, rolls.length - modifier.n);
      dropped = sorted.slice(rolls.length - modifier.n);
      break;
    }
  }

  return { kept, dropped, total: kept.reduce((a, b) => a + b, 0) };
}

// ── Bonus / Penalty dice (CoC) ────────────────────────────────────────────────

function evalBonusDie(node: BonusDieNode, ctx: EvalContext): number {
  // 投 1 + extra 个十位骰，1 个个位骰
  const units = rollInt(ctx.rand, 10) - 1; // 0~9（0 代表 0）
  const tensPool: number[] = [];
  for (let i = 0; i < node.extra + 1; i++) {
    tensPool.push((rollInt(ctx.rand, 10) - 1) * 10); // 0, 10, 20, ... 90
  }

  // 取最小十位（奖励骰）
  const chosenTens = Math.min(...tensPool);
  // computedTens: 0~9，与 units(0~9) 组合。00+0 → 100（骰出最小值的特例）
  const computedTens = chosenTens / 10; // 0~9
  const total = computedTens === 0 && units === 0 ? 100 : computedTens * 10 + units;

  ctx.steps.push({
    type: 'bonus_penalty',
    label: `b${node.extra > 1 ? node.extra : ''}`,
    rolls: tensPool.map((t) => t / 10),
    kept: [computedTens],
    total,
  });
  return total;
}

function evalPenaltyDie(node: PenaltyDieNode, ctx: EvalContext): number {
  const units = rollInt(ctx.rand, 10) - 1; // 0~9
  const tensPool: number[] = [];
  for (let i = 0; i < node.extra + 1; i++) {
    tensPool.push(rollInt(ctx.rand, 10) - 1); // 0~9
  }

  // 取最大十位（惩罚骰）
  const chosenTens = Math.max(...tensPool);
  const total = chosenTens === 0 && units === 0 ? 100 : chosenTens * 10 + units;

  ctx.steps.push({
    type: 'bonus_penalty',
    label: `p${node.extra > 1 ? node.extra : ''}`,
    rolls: tensPool,
    kept: [chosenTens],
    total,
  });
  return total;
}

// ── Fate dice ─────────────────────────────────────────────────────────────────

function evalFateDie(node: FateDieNode, ctx: EvalContext): number {
  const FATE_FACES = [-1, -1, 0, 0, 1, 1];
  const rolls: number[] = [];
  for (let i = 0; i < node.count; i++) {
    const idx = Math.floor(ctx.rand() * 6);
    rolls.push(FATE_FACES[idx]!);
  }
  const total = rolls.reduce((a, b) => a + b, 0);
  ctx.steps.push({ type: 'fate', label: `${node.count}dF`, rolls, total });
  return total;
}

// ── Detail builder ────────────────────────────────────────────────────────────

function buildDetail(steps: RollStep[], total: number): string {
  if (steps.length === 0) return String(total);
  const parts = steps.map((s) => {
    if (s.type === 'dice' || s.type === 'fate') {
      const rollStr = `[${s.rolls!.join(',')}]`;
      if (s.dropped && s.dropped.length > 0) {
        return `${s.label}=${rollStr}(保留${s.kept!.join(',')})`;
      }
      return `${s.label}=${rollStr}`;
    }
    if (s.type === 'bonus_penalty') {
      return `${s.label}=[${s.rolls!.join(',')}]→${s.kept![0]}`;
    }
    return `${s.label}=${s.total}`;
  });
  return `${parts.join('+')} = ${total}`;
}
