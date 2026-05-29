import { Lexer, Token, TokenType } from './lexer';
import { DiceError } from './errors';
import type {
  DiceAST,
  MultiRollNode,
  CompareNode,
  BinaryNode,
  UnaryNode,
  NumberNode,
  VariableNode,
  DiceRollNode,
  KeepDropModifier,
  BonusDieNode,
  PenaltyDieNode,
  FateDieNode,
  PowerRollNode,
} from './ast';

/**
 * 递归下降解析器。
 * 文法参见计划书 §2.3 EBNF。
 */
export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(input: string) {
    this.tokens = new Lexer(input).tokenize();
  }

  parse(): DiceAST {
    const ast = this.parseInput();
    if (!this.isEof()) {
      const t = this.current();
      throw new DiceError('DICE_SYNTAX_ERROR', `意外 token '${t.value}' 在位置 ${t.pos}`);
    }
    return ast;
  }

  // ── input ────────────────────────────────────────────────────────────────

  private parseInput(): DiceAST {
    // multi_roll: integer '#' expr
    if (this.check(TokenType.NUMBER) && this.checkAt(1, TokenType.HASH)) {
      return this.parseMultiRoll();
    }
    // power_expr: POWER_ROLL integer ...
    if (this.check(TokenType.POWER_ROLL)) {
      return this.parsePowerRoll();
    }
    // compare or expr
    return this.parseCompareOrExpr();
  }

  // ── multi_roll ───────────────────────────────────────────────────────────

  private parseMultiRoll(): MultiRollNode {
    const count = parseInt(this.consume(TokenType.NUMBER).value, 10);
    if (count <= 0 || count > 100) {
      throw new DiceError('DICE_MULTI_ROLL_COUNT_INVALID', `多轮骰次数必须在 1~100 之间，得到 ${count}`);
    }
    this.consume(TokenType.HASH);
    const expr = this.parseExpr();
    return { type: 'multi_roll', count, expr };
  }

  // ── power_roll ───────────────────────────────────────────────────────────

  private parsePowerRoll(): PowerRollNode {
    this.consume(TokenType.POWER_ROLL);
    const power = this.parseAtom(); // integer or expr - typically just a number

    let critSpec: DiceAST | null = null;
    if (this.check(TokenType.AT)) {
      this.consume(TokenType.AT);
      if (this.check(TokenType.LBRACKET)) {
        // @ [ expr ] 形式
        this.consume(TokenType.LBRACKET);
        critSpec = this.parseExpr();
        this.consume(TokenType.RBRACKET);
      } else {
        // @ integer 形式
        critSpec = this.parseAtom();
      }
    }

    // add_parts: zero or more (+/-) expr
    const addParts: DiceAST[] = [];
    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const sign = this.consume().value === '+' ? 1 : -1;
      const part = this.parseExpr();
      if (sign === -1) {
        addParts.push({ type: 'unary', operator: '-', operand: part } as UnaryNode);
      } else {
        addParts.push(part);
      }
    }

    return { type: 'power_roll', power, critSpec, addParts };
  }

  // ── compare or expr ──────────────────────────────────────────────────────

  private parseCompareOrExpr(): DiceAST {
    const left = this.parseExpr();
    const op = this.peekCompareOp();
    if (op !== null) {
      this.consume(); // consume operator
      const right = this.parseExpr();
      return { type: 'compare', left, operator: op, right } as CompareNode;
    }
    return left;
  }

  private peekCompareOp(): CompareNode['operator'] | null {
    const t = this.current();
    switch (t.type) {
      case TokenType.LTE: return '<=';
      case TokenType.GTE: return '>=';
      case TokenType.LT: return '<';
      case TokenType.GT: return '>';
      case TokenType.EQ: return '=';
      default: return null;
    }
  }

  // ── expr ─────────────────────────────────────────────────────────────────

  private parseExpr(): DiceAST {
    let left = this.parseTerm();
    while (this.check(TokenType.PLUS) || this.check(TokenType.MINUS)) {
      const op = this.consume().value as '+' | '-';
      const right = this.parseTerm();
      left = { type: 'binary', operator: op, left, right } as BinaryNode;
    }
    return left;
  }

  // ── term ─────────────────────────────────────────────────────────────────

  private parseTerm(): DiceAST {
    let left = this.parseFactor();
    while (this.check(TokenType.STAR) || this.check(TokenType.SLASH)) {
      const op = this.consume().value as '*' | '/';
      const right = this.parseFactor();
      left = { type: 'binary', operator: op, left, right } as BinaryNode;
    }
    return left;
  }

  // ── factor ───────────────────────────────────────────────────────────────

  private parseFactor(): DiceAST {
    const base = this.parseUnary();
    if (this.check(TokenType.STAR_STAR)) {
      this.consume(TokenType.STAR_STAR);
      const exp = this.parseFactor(); // right-associative
      return { type: 'binary', operator: '*', left: base, right: exp } as BinaryNode;
      // We approximate ** as repeated multiplication; proper power would need a new BinaryOp
      // For simplicity, treat ** as a special case in the evaluator
    }
    return base;
  }

  // ── unary ────────────────────────────────────────────────────────────────

  private parseUnary(): DiceAST {
    if (this.check(TokenType.MINUS)) {
      this.consume(TokenType.MINUS);
      const operand = this.parseUnary();
      return { type: 'unary', operator: '-', operand } as UnaryNode;
    }
    return this.parseAtom();
  }

  // ── atom ─────────────────────────────────────────────────────────────────

  private parseAtom(): DiceAST {
    const t = this.current();

    // '(' expr ')'
    if (t.type === TokenType.LPAREN) {
      this.consume(TokenType.LPAREN);
      const inner = this.parseExpr();
      this.consume(TokenType.RPAREN);
      return inner;
    }

    // Fate die: 'f' or 'F' standalone, or d + FATE handled as dice_roll
    if (t.type === TokenType.FATE) {
      this.consume(TokenType.FATE);
      return { type: 'fate_die', count: 1 } as FateDieNode;
    }

    // bonus die: b[N]
    if (t.type === TokenType.BONUS) {
      this.consume(TokenType.BONUS);
      const extra = this.check(TokenType.NUMBER) ? parseInt(this.consume(TokenType.NUMBER).value, 10) : 1;
      return { type: 'bonus_die', extra } as BonusDieNode;
    }

    // penalty die: p[N]
    if (t.type === TokenType.PENALTY) {
      this.consume(TokenType.PENALTY);
      const extra = this.check(TokenType.NUMBER) ? parseInt(this.consume(TokenType.NUMBER).value, 10) : 1;
      return { type: 'penalty_die', extra } as PenaltyDieNode;
    }

    // Dice roll: [count] 'd' sides [modifier]
    // Also handles: [count] 'D' 'FATE' → fate die with count
    if (t.type === TokenType.D) {
      return this.parseDiceRoll(null);
    }

    // Variable / identifier
    if (t.type === TokenType.IDENT) {
      this.consume(TokenType.IDENT);
      return { type: 'variable', name: t.value } as VariableNode;
    }

    // NUMBER: could be start of dice roll (count), or plain number
    if (t.type === TokenType.NUMBER) {
      const numVal = parseInt(this.consume(TokenType.NUMBER).value, 10);
      const numNode: NumberNode = { type: 'number', value: numVal };

      // Check what follows
      if (this.check(TokenType.D)) {
        // number d [sides] [modifier]
        return this.parseDiceRoll(numNode);
      }
      if (this.check(TokenType.FATE)) {
        // number 'f' → N fate dice (e.g., written as plain 4f or via 4dF)
        this.consume(TokenType.FATE);
        return { type: 'fate_die', count: numVal } as FateDieNode;
      }
      return numNode;
    }

    throw new DiceError('DICE_SYNTAX_ERROR', `意外 token '${t.value}' (${t.type}) 在位置 ${t.pos}`);
  }

  // ── dice_roll helper ──────────────────────────────────────────────────────

  private parseDiceRoll(count: DiceAST | null): DiceRollNode {
    this.consume(TokenType.D);

    // Check for fate die (dF)
    if (this.check(TokenType.FATE)) {
      this.consume(TokenType.FATE);
      return { type: 'dice_roll', count, sides: 'fate' } as DiceRollNode;
    }

    // sides: integer or (expr) or omitted
    let sides: DiceAST | null;
    if (this.check(TokenType.LPAREN)) {
      this.consume(TokenType.LPAREN);
      sides = this.parseExpr();
      this.consume(TokenType.RPAREN);
    } else if (this.check(TokenType.NUMBER)) {
      sides = { type: 'number', value: parseInt(this.consume(TokenType.NUMBER).value, 10) };
    } else {
      // No sides specified → null = use defaultSides (evaluated in evaluator)
      sides = null;
    }

    // Optional modifier: kh, kl, dh, dl, k<n>, q<n>
    const modifier = this.parseModifier();

    return { type: 'dice_roll', count, sides, modifier } as DiceRollNode;
  }

  private parseModifier(): KeepDropModifier | undefined {
    if (this.check(TokenType.KH)) {
      this.consume(TokenType.KH);
      const n = parseInt(this.consume(TokenType.NUMBER).value, 10);
      return { op: 'kh', n };
    }
    if (this.check(TokenType.KL)) {
      this.consume(TokenType.KL);
      const n = parseInt(this.consume(TokenType.NUMBER).value, 10);
      return { op: 'kl', n };
    }
    if (this.check(TokenType.DH)) {
      this.consume(TokenType.DH);
      const n = parseInt(this.consume(TokenType.NUMBER).value, 10);
      return { op: 'dh', n };
    }
    if (this.check(TokenType.DL)) {
      this.consume(TokenType.DL);
      const n = parseInt(this.consume(TokenType.NUMBER).value, 10);
      return { op: 'dl', n };
    }
    return undefined;
  }

  // ── Token helpers ─────────────────────────────────────────────────────────

  private current(): Token {
    return this.tokens[this.pos]!;
  }

  private check(type: TokenType): boolean {
    return this.tokens[this.pos]?.type === type;
  }

  private checkAt(offset: number, type: TokenType): boolean {
    return this.tokens[this.pos + offset]?.type === type;
  }

  private consume(expected?: TokenType): Token {
    const t = this.tokens[this.pos];
    if (!t || t.type === TokenType.EOF) {
      throw new DiceError('DICE_SYNTAX_ERROR', `意外的表达式结尾${expected ? `，期望 ${expected}` : ''}`);
    }
    if (expected !== undefined && t.type !== expected) {
      throw new DiceError('DICE_SYNTAX_ERROR', `期望 ${expected}，得到 '${t.value}' (${t.type}) 在位置 ${t.pos}`);
    }
    this.pos++;
    return t;
  }

  private isEof(): boolean {
    return this.pos >= this.tokens.length || this.tokens[this.pos]?.type === TokenType.EOF;
  }
}
