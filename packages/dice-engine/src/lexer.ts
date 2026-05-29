import { DiceError } from './errors';

export enum TokenType {
  NUMBER       = 'NUMBER',
  IDENT        = 'IDENT',
  D            = 'D',
  KH           = 'KH',
  KL           = 'KL',
  DH           = 'DH',
  DL           = 'DL',
  BONUS        = 'BONUS',
  PENALTY      = 'PENALTY',
  FATE         = 'FATE',
  POWER_ROLL   = 'POWER_ROLL',
  PLUS         = 'PLUS',
  MINUS        = 'MINUS',
  STAR         = 'STAR',
  SLASH        = 'SLASH',
  STAR_STAR    = 'STAR_STAR',
  HASH         = 'HASH',
  AT           = 'AT',
  LT           = 'LT',
  GT           = 'GT',
  LTE          = 'LTE',
  GTE          = 'GTE',
  EQ           = 'EQ',
  LPAREN       = 'LPAREN',
  RPAREN       = 'RPAREN',
  LBRACKET     = 'LBRACKET',
  RBRACKET     = 'RBRACKET',
  EOF          = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const DIGIT_RE = /[0-9]/;
const LETTER_RE = /[a-zA-Z一-鿿]/;

/** 预处理：替换 SealDice 中文优势/劣势写法 */
function preprocess(input: string): string {
  // d<n>优势 → 2d<n>kh1  (n is optional, default handled by parser)
  input = input.replace(/(\d*)d(\d+)优势/g, '2d$2kh1');
  input = input.replace(/(\d*)d(\d+)劣势/g, '2d$2kl1');
  return input;
}

export class Lexer {
  private readonly src: string;
  private pos = 0;

  constructor(input: string) {
    this.src = preprocess(input.trim());
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      const tok = this.nextToken();
      tokens.push(tok);
      if (tok.type === TokenType.EOF) break;
    }
    return tokens;
  }

  private peek(offset = 0): string {
    return this.src[this.pos + offset] ?? '';
  }

  private consume(): string {
    return this.src[this.pos++] ?? '';
  }

  private isDigit(ch: string): boolean {
    return DIGIT_RE.test(ch);
  }

  private isLetter(ch: string): boolean {
    return LETTER_RE.test(ch);
  }

  private isOperatorOrEnd(ch: string): boolean {
    return ch === '' || ch === '+' || ch === '-' || ch === '*' || ch === '/'
      || ch === '(' || ch === ')' || ch === '[' || ch === ']'
      || ch === '<' || ch === '>' || ch === '=' || ch === '#' || ch === '@'
      || ch === ' ' || ch === '\t';
  }

  private nextToken(): Token {
    // Skip whitespace
    while (this.pos < this.src.length && (this.src[this.pos] === ' ' || this.src[this.pos] === '\t')) {
      this.pos++;
    }

    if (this.pos >= this.src.length) {
      return { type: TokenType.EOF, value: '', pos: this.pos };
    }

    const startPos = this.pos;
    const ch = this.peek();

    // ── Numbers ──────────────────────────────────────────────────────────────
    if (this.isDigit(ch)) {
      let num = '';
      while (this.isDigit(this.peek())) num += this.consume();
      return { type: TokenType.NUMBER, value: num, pos: startPos };
    }

    // ── Operators ────────────────────────────────────────────────────────────
    if (ch === '+') { this.consume(); return { type: TokenType.PLUS, value: '+', pos: startPos }; }
    if (ch === '-') { this.consume(); return { type: TokenType.MINUS, value: '-', pos: startPos }; }
    if (ch === '/') { this.consume(); return { type: TokenType.SLASH, value: '/', pos: startPos }; }
    if (ch === '#') { this.consume(); return { type: TokenType.HASH, value: '#', pos: startPos }; }
    if (ch === '@') { this.consume(); return { type: TokenType.AT, value: '@', pos: startPos }; }
    if (ch === '(') { this.consume(); return { type: TokenType.LPAREN, value: '(', pos: startPos }; }
    if (ch === ')') { this.consume(); return { type: TokenType.RPAREN, value: ')', pos: startPos }; }
    if (ch === '[') { this.consume(); return { type: TokenType.LBRACKET, value: '[', pos: startPos }; }
    if (ch === ']') { this.consume(); return { type: TokenType.RBRACKET, value: ']', pos: startPos }; }
    if (ch === '=') { this.consume(); return { type: TokenType.EQ, value: '=', pos: startPos }; }

    if (ch === '*') {
      this.consume();
      if (this.peek() === '*') { this.consume(); return { type: TokenType.STAR_STAR, value: '**', pos: startPos }; }
      return { type: TokenType.STAR, value: '*', pos: startPos };
    }

    if (ch === '<') {
      this.consume();
      if (this.peek() === '=') { this.consume(); return { type: TokenType.LTE, value: '<=', pos: startPos }; }
      return { type: TokenType.LT, value: '<', pos: startPos };
    }

    if (ch === '>') {
      this.consume();
      if (this.peek() === '=') { this.consume(); return { type: TokenType.GTE, value: '>=', pos: startPos }; }
      return { type: TokenType.GT, value: '>', pos: startPos };
    }

    // ── Letter-based tokens ──────────────────────────────────────────────────
    if (this.isLetter(ch)) {
      return this.scanLetterToken(startPos);
    }

    // Unknown character
    throw new DiceError('DICE_SYNTAX_ERROR', `意外字符 '${ch}' 在位置 ${this.pos}`);
  }

  private scanLetterToken(startPos: number): Token {
    const ch = this.peek();

    switch (ch) {
      // ── d: dice separator, dh, dl ─────────────────────────────────────────
      case 'd': {
        const next = this.peek(1);
        if (next === 'h' && this.isDigit(this.peek(2))) {
          this.consume(); this.consume();
          return { type: TokenType.DH, value: 'dh', pos: startPos };
        }
        if (next === 'l' && this.isDigit(this.peek(2))) {
          this.consume(); this.consume();
          return { type: TokenType.DL, value: 'dl', pos: startPos };
        }
        // d followed by digit, (, F/f → dice operator
        if (this.isDigit(next) || next === '(' || next === 'F' || next === 'f'
            || this.isOperatorOrEnd(next)) {
          this.consume();
          return { type: TokenType.D, value: 'd', pos: startPos };
        }
        // d followed by other letters → identifier
        return this.readIdent(startPos);
      }

      // ── k: kh, kl, or compatibility k<n> = kh<n> ─────────────────────────
      case 'k': {
        const next = this.peek(1);
        if (next === 'h') { this.consume(); this.consume(); return { type: TokenType.KH, value: 'kh', pos: startPos }; }
        if (next === 'l') { this.consume(); this.consume(); return { type: TokenType.KL, value: 'kl', pos: startPos }; }
        if (this.isDigit(next)) {
          // k<n> = kh<n> (compatibility)
          this.consume();
          return { type: TokenType.KH, value: 'k', pos: startPos };
        }
        return this.readIdent(startPos);
      }

      // ── K: SW2.5 power roll (alias for r) ────────────────────────────────
      case 'K': {
        if (this.isDigit(this.peek(1))) {
          this.consume();
          return { type: TokenType.POWER_ROLL, value: 'K', pos: startPos };
        }
        return this.readIdent(startPos);
      }

      // ── q: kl compatibility (q<n> = kl<n>) ───────────────────────────────
      case 'q': {
        if (this.isDigit(this.peek(1))) {
          this.consume();
          return { type: TokenType.KL, value: 'q', pos: startPos };
        }
        return this.readIdent(startPos);
      }

      // ── r: SW2.5 power roll ───────────────────────────────────────────────
      case 'r': {
        if (this.isDigit(this.peek(1))) {
          this.consume();
          return { type: TokenType.POWER_ROLL, value: 'r', pos: startPos };
        }
        return this.readIdent(startPos);
      }

      // ── b: CoC bonus die ──────────────────────────────────────────────────
      case 'b': {
        const next = this.peek(1);
        if (this.isDigit(next) || this.isOperatorOrEnd(next)) {
          this.consume();
          return { type: TokenType.BONUS, value: 'b', pos: startPos };
        }
        return this.readIdent(startPos);
      }

      // ── p: CoC penalty die ────────────────────────────────────────────────
      case 'p': {
        const next = this.peek(1);
        if (this.isDigit(next) || this.isOperatorOrEnd(next)) {
          this.consume();
          return { type: TokenType.PENALTY, value: 'p', pos: startPos };
        }
        return this.readIdent(startPos);
      }

      // ── f/F: fate die ─────────────────────────────────────────────────────
      case 'f':
      case 'F': {
        this.consume();
        return { type: TokenType.FATE, value: ch, pos: startPos };
      }

      default:
        return this.readIdent(startPos);
    }
  }

  private readIdent(startPos: number): Token {
    let word = '';
    while (this.isLetter(this.peek()) || this.isDigit(this.peek())) {
      word += this.consume();
    }
    return { type: TokenType.IDENT, value: word, pos: startPos };
  }
}
