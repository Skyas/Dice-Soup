// AST 节点类型定义

export type DiceAST =
  | MultiRollNode
  | CompareNode
  | BinaryNode
  | UnaryNode
  | NumberNode
  | VariableNode
  | DiceRollNode
  | BonusDieNode
  | PenaltyDieNode
  | FateDieNode
  | PowerRollNode;

export interface MultiRollNode {
  type: 'multi_roll';
  count: number;
  expr: DiceAST;
}

export interface CompareNode {
  type: 'compare';
  left: DiceAST;
  operator: '<=' | '>=' | '<' | '>' | '=';
  right: DiceAST;
}

export interface BinaryNode {
  type: 'binary';
  operator: '+' | '-' | '*' | '/';
  left: DiceAST;
  right: DiceAST;
}

export interface UnaryNode {
  type: 'unary';
  operator: '-';
  operand: DiceAST;
}

export interface NumberNode {
  type: 'number';
  value: number;
}

export interface VariableNode {
  type: 'variable';
  name: string;
}

export interface DiceRollNode {
  type: 'dice_roll';
  count: DiceAST | null;
  /** null = 省略面数，求值时使用 defaultSides */
  sides: DiceAST | 'fate' | null;
  modifier?: KeepDropModifier;
}

export type KeepDropModifier =
  | { op: 'kh'; n: number }
  | { op: 'kl'; n: number }
  | { op: 'dh'; n: number }
  | { op: 'dl'; n: number };

/** CoC 奖励骰：额外 extra 个十位骰，取最小十位与个位组合 */
export interface BonusDieNode {
  type: 'bonus_die';
  extra: number;
}

/** CoC 惩罚骰：额外 extra 个十位骰，取最大十位与个位组合 */
export interface PenaltyDieNode {
  type: 'penalty_die';
  extra: number;
}

/** Fate 骰：count 个 [-1, 0, +1] */
export interface FateDieNode {
  type: 'fate_die';
  count: number;
}

/**
 * SW2.5 威力骰。
 * critSpec 为 null 时 C 值默认 10。
 * addParts 求和后作为固定追加值。
 */
export interface PowerRollNode {
  type: 'power_roll';
  power: DiceAST;
  critSpec: DiceAST | null;
  addParts: DiceAST[];
}
