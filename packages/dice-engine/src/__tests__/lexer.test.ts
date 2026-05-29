import { describe, it, expect } from 'vitest';
import { Lexer, TokenType } from '../lexer';

function types(input: string): TokenType[] {
  return new Lexer(input).tokenize().map((t) => t.type);
}

function vals(input: string): string[] {
  return new Lexer(input).tokenize().map((t) => t.value);
}

describe('Lexer', () => {
  describe('基础数字与运算符', () => {
    it('纯数字', () => {
      expect(types('42')).toEqual([TokenType.NUMBER, TokenType.EOF]);
    });

    it('加减乘除', () => {
      expect(types('1+2-3*4/5')).toEqual([
        TokenType.NUMBER, TokenType.PLUS, TokenType.NUMBER, TokenType.MINUS,
        TokenType.NUMBER, TokenType.STAR, TokenType.NUMBER, TokenType.SLASH,
        TokenType.NUMBER, TokenType.EOF,
      ]);
    });

    it('幂运算 **', () => {
      expect(types('2**3')).toEqual([TokenType.NUMBER, TokenType.STAR_STAR, TokenType.NUMBER, TokenType.EOF]);
    });

    it('比较运算符', () => {
      expect(types('<=')). toEqual([TokenType.LTE, TokenType.EOF]);
      expect(types('>=')).toEqual([TokenType.GTE, TokenType.EOF]);
      expect(types('<')).toEqual([TokenType.LT, TokenType.EOF]);
      expect(types('>')).toEqual([TokenType.GT, TokenType.EOF]);
      expect(types('=')).toEqual([TokenType.EQ, TokenType.EOF]);
    });
  });

  describe('骰子表达式', () => {
    it('3d6', () => {
      expect(types('3d6')).toEqual([TokenType.NUMBER, TokenType.D, TokenType.NUMBER, TokenType.EOF]);
    });

    it('d100（无count）', () => {
      expect(types('d100')).toEqual([TokenType.D, TokenType.NUMBER, TokenType.EOF]);
    });

    it('4d6kh3 保留最高', () => {
      expect(types('4d6kh3')).toEqual([
        TokenType.NUMBER, TokenType.D, TokenType.NUMBER,
        TokenType.KH, TokenType.NUMBER, TokenType.EOF,
      ]);
    });

    it('4d6k3 兼容写法 → KH', () => {
      expect(types('4d6k3')).toEqual([
        TokenType.NUMBER, TokenType.D, TokenType.NUMBER,
        TokenType.KH, TokenType.NUMBER, TokenType.EOF,
      ]);
    });

    it('4d6kl1 保留最低', () => {
      expect(types('4d6kl1')).toEqual([
        TokenType.NUMBER, TokenType.D, TokenType.NUMBER,
        TokenType.KL, TokenType.NUMBER, TokenType.EOF,
      ]);
    });

    it('4d6q1 兼容写法 → KL', () => {
      expect(types('4d6q1')).toEqual([
        TokenType.NUMBER, TokenType.D, TokenType.NUMBER,
        TokenType.KL, TokenType.NUMBER, TokenType.EOF,
      ]);
    });

    it('4d6dh1 弃高', () => {
      expect(types('4d6dh1')).toEqual([
        TokenType.NUMBER, TokenType.D, TokenType.NUMBER,
        TokenType.DH, TokenType.NUMBER, TokenType.EOF,
      ]);
    });

    it('4d6dl1 弃低', () => {
      expect(types('4d6dl1')).toEqual([
        TokenType.NUMBER, TokenType.D, TokenType.NUMBER,
        TokenType.DL, TokenType.NUMBER, TokenType.EOF,
      ]);
    });
  });

  describe('奖励骰/惩罚骰/Fate骰', () => {
    it('b 奖励骰', () => {
      expect(types('b')).toEqual([TokenType.BONUS, TokenType.EOF]);
    });

    it('b2 两个奖励骰', () => {
      expect(types('b2')).toEqual([TokenType.BONUS, TokenType.NUMBER, TokenType.EOF]);
    });

    it('p 惩罚骰', () => {
      expect(types('p')).toEqual([TokenType.PENALTY, TokenType.EOF]);
    });

    it('4dF fate骰', () => {
      expect(types('4dF')).toEqual([
        TokenType.NUMBER, TokenType.D, TokenType.FATE, TokenType.EOF,
      ]);
    });

    it('f standalone fate', () => {
      expect(types('f')).toEqual([TokenType.FATE, TokenType.EOF]);
    });
  });

  describe('威力骰 (SW2.5)', () => {
    it('r30 power roll', () => {
      expect(types('r30')).toEqual([TokenType.POWER_ROLL, TokenType.NUMBER, TokenType.EOF]);
    });

    it('K30 大写K power roll', () => {
      const toks = new Lexer('K30').tokenize();
      expect(toks[0]!.type).toBe(TokenType.POWER_ROLL);
    });

    it('r30@10+4', () => {
      expect(types('r30@10+4')).toEqual([
        TokenType.POWER_ROLL, TokenType.NUMBER,
        TokenType.AT, TokenType.NUMBER,
        TokenType.PLUS, TokenType.NUMBER,
        TokenType.EOF,
      ]);
    });

    it('r30@[10-1]+4', () => {
      expect(types('r30@[10-1]+4')).toEqual([
        TokenType.POWER_ROLL, TokenType.NUMBER,
        TokenType.AT, TokenType.LBRACKET,
        TokenType.NUMBER, TokenType.MINUS, TokenType.NUMBER,
        TokenType.RBRACKET, TokenType.PLUS, TokenType.NUMBER,
        TokenType.EOF,
      ]);
    });
  });

  describe('多轮骰', () => {
    it('3#d6+2', () => {
      expect(types('3#d6+2')).toEqual([
        TokenType.NUMBER, TokenType.HASH,
        TokenType.D, TokenType.NUMBER, TokenType.PLUS, TokenType.NUMBER,
        TokenType.EOF,
      ]);
    });
  });

  describe('兼容性预处理', () => {
    it('d20优势 → 2d20kh1', () => {
      const toks = new Lexer('d20优势').tokenize();
      const tv = toks.map((t) => t.value);
      expect(tv).toContain('2');
      expect(tv).toContain('20');
    });
  });

  describe('标识符变量', () => {
    it('balance 是 IDENT', () => {
      expect(types('balance')).toEqual([TokenType.IDENT, TokenType.EOF]);
      expect(vals('balance')[0]).toBe('balance');
    });

    it('damage 是 IDENT', () => {
      expect(types('damage')).toEqual([TokenType.IDENT, TokenType.EOF]);
    });
  });
});
