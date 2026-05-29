import { describe, it, expect } from 'vitest';
import { Parser } from '../parser';
import { DiceError } from '../errors';

function parse(expr: string) {
  return new Parser(expr).parse();
}

describe('Parser', () => {
  describe('基础表达式', () => {
    it('数字', () => {
      expect(parse('42')).toEqual({ type: 'number', value: 42 });
    });

    it('加法', () => {
      const ast = parse('1+2');
      expect(ast.type).toBe('binary');
      if (ast.type === 'binary') {
        expect(ast.operator).toBe('+');
        expect(ast.left).toEqual({ type: 'number', value: 1 });
        expect(ast.right).toEqual({ type: 'number', value: 2 });
      }
    });

    it('一元负号', () => {
      const ast = parse('-5');
      expect(ast.type).toBe('unary');
      if (ast.type === 'unary') {
        expect(ast.operator).toBe('-');
        expect(ast.operand).toEqual({ type: 'number', value: 5 });
      }
    });

    it('括号', () => {
      const ast = parse('(2+3)*4');
      expect(ast.type).toBe('binary');
    });
  });

  describe('骰子表达式', () => {
    it('d6', () => {
      const ast = parse('d6');
      expect(ast.type).toBe('dice_roll');
      if (ast.type === 'dice_roll') {
        expect(ast.count).toBeNull();
        expect(ast.sides).toEqual({ type: 'number', value: 6 });
      }
    });

    it('3d6', () => {
      const ast = parse('3d6');
      expect(ast.type).toBe('dice_roll');
      if (ast.type === 'dice_roll') {
        expect(ast.count).toEqual({ type: 'number', value: 3 });
        expect(ast.sides).toEqual({ type: 'number', value: 6 });
      }
    });

    it('4d6kh3', () => {
      const ast = parse('4d6kh3');
      expect(ast.type).toBe('dice_roll');
      if (ast.type === 'dice_roll') {
        expect(ast.modifier).toEqual({ op: 'kh', n: 3 });
      }
    });

    it('4d6k3 兼容 kh3', () => {
      const ast = parse('4d6k3');
      expect(ast.type).toBe('dice_roll');
      if (ast.type === 'dice_roll') {
        expect(ast.modifier).toEqual({ op: 'kh', n: 3 });
      }
    });

    it('4d6kl1', () => {
      const ast = parse('4d6kl1');
      if (ast.type === 'dice_roll') {
        expect(ast.modifier).toEqual({ op: 'kl', n: 1 });
      }
    });

    it('4d6q1 兼容 kl1', () => {
      const ast = parse('4d6q1');
      if (ast.type === 'dice_roll') {
        expect(ast.modifier).toEqual({ op: 'kl', n: 1 });
      }
    });

    it('4d6dh1', () => {
      const ast = parse('4d6dh1');
      if (ast.type === 'dice_roll') {
        expect(ast.modifier).toEqual({ op: 'dh', n: 1 });
      }
    });

    it('4d6dl1', () => {
      const ast = parse('4d6dl1');
      if (ast.type === 'dice_roll') {
        expect(ast.modifier).toEqual({ op: 'dl', n: 1 });
      }
    });

    it('3d6+2 加法', () => {
      const ast = parse('3d6+2');
      expect(ast.type).toBe('binary');
    });

    it('4dF fate骰', () => {
      const ast = parse('4dF');
      expect(ast.type).toBe('dice_roll');
      if (ast.type === 'dice_roll') {
        expect(ast.sides).toBe('fate');
      }
    });
  });

  describe('比较式', () => {
    it('1d100<=70', () => {
      const ast = parse('1d100<=70');
      expect(ast.type).toBe('compare');
      if (ast.type === 'compare') {
        expect(ast.operator).toBe('<=');
        expect(ast.left.type).toBe('dice_roll');
        expect(ast.right).toEqual({ type: 'number', value: 70 });
      }
    });

    it('>= 比较', () => {
      const ast = parse('d20>=15');
      if (ast.type === 'compare') {
        expect(ast.operator).toBe('>=');
      }
    });
  });

  describe('多轮骰', () => {
    it('3#d6', () => {
      const ast = parse('3#d6');
      expect(ast.type).toBe('multi_roll');
      if (ast.type === 'multi_roll') {
        expect(ast.count).toBe(3);
        expect(ast.expr.type).toBe('dice_roll');
      }
    });

    it('次数超限报错', () => {
      expect(() => parse('200#d6')).toThrow(DiceError);
    });
  });

  describe('奖励骰/惩罚骰', () => {
    it('b 奖励骰', () => {
      const ast = parse('b');
      expect(ast.type).toBe('bonus_die');
      if (ast.type === 'bonus_die') expect(ast.extra).toBe(1);
    });

    it('b2 两个额外十位骰', () => {
      const ast = parse('b2');
      if (ast.type === 'bonus_die') expect(ast.extra).toBe(2);
    });

    it('p 惩罚骰', () => {
      const ast = parse('p');
      expect(ast.type).toBe('penalty_die');
    });
  });

  describe('威力骰 (SW2.5)', () => {
    it('r30', () => {
      const ast = parse('r30');
      expect(ast.type).toBe('power_roll');
      if (ast.type === 'power_roll') {
        expect(ast.power).toEqual({ type: 'number', value: 30 });
        expect(ast.critSpec).toBeNull();
        expect(ast.addParts).toHaveLength(0);
      }
    });

    it('r30@10', () => {
      const ast = parse('r30@10');
      if (ast.type === 'power_roll') {
        expect(ast.critSpec).toEqual({ type: 'number', value: 10 });
      }
    });

    it('r30@10+4', () => {
      const ast = parse('r30@10+4');
      if (ast.type === 'power_roll') {
        expect(ast.critSpec).toEqual({ type: 'number', value: 10 });
        expect(ast.addParts).toHaveLength(1);
      }
    });

    it('r30@[10-1]+4 方括号 C 值', () => {
      const ast = parse('r30@[10-1]+4');
      if (ast.type === 'power_roll') {
        expect(ast.critSpec?.type).toBe('binary');
        expect(ast.addParts).toHaveLength(1);
      }
    });

    it('r30+13 无C值 有追加', () => {
      const ast = parse('r30+13');
      if (ast.type === 'power_roll') {
        expect(ast.critSpec).toBeNull();
        expect(ast.addParts).toHaveLength(1);
      }
    });
  });

  describe('变量', () => {
    it('变量标识符', () => {
      const ast = parse('STR');
      expect(ast.type).toBe('variable');
      if (ast.type === 'variable') expect(ast.name).toBe('STR');
    });
  });

  describe('语法错误', () => {
    it('空表达式', () => {
      expect(() => parse('')).toThrow(DiceError);
    });

    it('不完整表达式', () => {
      expect(() => parse('3d')).not.toThrow(); // 省略面数 → defaultSides
    });

    it('连续运算符', () => {
      expect(() => parse('3++6')).toThrow(DiceError);
    });
  });
});
