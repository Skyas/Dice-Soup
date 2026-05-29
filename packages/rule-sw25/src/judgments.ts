/**
 * SW2.5 行为判定类型定义。
 * 完整提取自规则书，供角色管理和判定辅助功能使用（第四大阶段战斗系统深度集成）。
 */

export type AbilityModifier =
  | 'dexterity'   // 灵巧度加值
  | 'agility'     // 敏捷度加值
  | 'strength'    // 力量加值
  | 'vitality'    // 生命力加值
  | 'intelligence' // 智力加值
  | 'spirit'      // 精神力加值
  | 'none';       // 不加能力值加值

export interface JudgmentType {
  name: string;
  ability: AbilityModifier;
  skills: string[];
  baseValue?: string;
  notes?: string;
}

/** 所有行为判定类型 */
export const JUDGMENT_TYPES: readonly JudgmentType[] = [
  // ── 使用灵巧度加值 ──────────────────────────────────────────────────────
  { name: '命中力判定', ability: 'dexterity', skills: ['战士系技能'], baseValue: '命中力' },
  { name: '偷窃判定',   ability: 'dexterity', skills: ['斥侯技能'] },
  { name: '变装判定',   ability: 'dexterity', skills: ['斥侯技能'] },
  { name: '急救处理判定', ability: 'dexterity', skills: ['游侠技能', '骑手技能'] },
  { name: '隐蔽判定',   ability: 'dexterity', skills: ['斥侯技能', '游侠技能'] },
  { name: '解除判定',   ability: 'dexterity', skills: ['斥侯技能', '游侠技能'], notes: '游侠有特殊限制' },
  { name: '陷阱设置判定', ability: 'dexterity', skills: ['斥侯技能', '游侠技能'], notes: '游侠有特殊限制' },

  // ── 使用敏捷度加值 ──────────────────────────────────────────────────────
  { name: '回避力判定', ability: 'agility', skills: ['战士技能', '轻战士技能', '拳斗士技能'], baseValue: '回避力' },
  { name: '先制判定',   ability: 'agility', skills: ['斥侯技能', '军师技能'], baseValue: '先制力' },
  { name: '骑乘判定',   ability: 'agility', skills: ['骑手技能'] },
  { name: '受身判定',   ability: 'agility', skills: ['斥侯技能', '游侠技能', '骑手技能'] },
  { name: '隐密判定',   ability: 'agility', skills: ['斥侯技能', '游侠技能'] },
  { name: '杂技判定',   ability: 'agility', skills: ['斥侯技能', '游侠技能'] },
  { name: '攀登判定',   ability: 'agility', skills: ['斥侯技能', '游侠技能'] },
  { name: '跟踪判定',   ability: 'agility', skills: ['斥侯技能', '游侠技能'] },

  // ── 使用力量加值 ──────────────────────────────────────────────────────
  { name: '攀登判定（力量）', ability: 'strength', skills: ['冒险者等级'], notes: '无对应技能时用力量' },
  { name: '腕力判定',   ability: 'strength', skills: ['冒险者等级'] },

  // ── 使用生命力加值 ──────────────────────────────────────────────────────
  { name: '生死判定',       ability: 'vitality', skills: ['冒险者等级'] },
  { name: '生命抵抗力判定', ability: 'vitality', skills: ['冒险者等级'], baseValue: '生命抵抗力' },

  // ── 使用智力加值 ──────────────────────────────────────────────────────
  { name: '魔法行使判定',   ability: 'intelligence', skills: ['魔法使系技能'], baseValue: '魔力' },
  { name: '赋术判定',       ability: 'intelligence', skills: ['炼金术师技能'] },
  { name: '文献判定',       ability: 'intelligence', skills: ['贤者技能', '炼金术师技能'] },
  { name: '见识判定',       ability: 'intelligence', skills: ['贤者技能', '吟游诗人技能', '炼金术师技能'] },
  { name: '药品学判定',     ability: 'intelligence', skills: ['游侠技能', '贤者技能', '炼金术师技能'] },
  { name: '地图制作判定',   ability: 'intelligence', skills: ['斥侯技能', '游侠技能', '贤者技能', '骑手技能'], notes: '游侠有特殊限制' },
  { name: '疾病知识判定',   ability: 'intelligence', skills: ['游侠技能', '贤者技能'] },
  { name: '宝物鉴定判定',   ability: 'intelligence', skills: ['斥侯技能', '贤者技能'] },
  { name: '魔物知识判定',   ability: 'intelligence', skills: ['贤者技能'], baseValue: '魔物知识' },
  { name: '文明鉴定判定',   ability: 'intelligence', skills: ['贤者技能'] },
  { name: '足迹追踪判定',   ability: 'intelligence', skills: ['斥侯技能', '游侠技能', '骑手技能'], notes: '骑手有条件限制' },
  { name: '异常感知判定',   ability: 'intelligence', skills: ['斥侯技能', '游侠技能', '骑手技能'], notes: '游侠/骑手有特殊限制' },
  { name: '聆听判定',       ability: 'intelligence', skills: ['斥侯技能', '游侠技能'] },
  { name: '危险感知判定',   ability: 'intelligence', skills: ['斥侯技能', '游侠技能', '骑手技能'], notes: '骑手有条件限制' },
  { name: '探索判定',       ability: 'intelligence', skills: ['斥侯技能', '游侠技能', '骑手技能', '天地使技能'], notes: '游侠/骑手有特殊限制' },
  { name: '天候预测判定',   ability: 'intelligence', skills: ['斥侯技能', '游侠技能', '天地使技能'] },
  { name: '陷阱回避判定',   ability: 'intelligence', skills: ['斥侯技能', '游侠技能', '骑手技能'], notes: '游侠/骑手有特殊限制' },
  { name: '弱点隐蔽判定',   ability: 'intelligence', skills: ['骑手技能'] },

  // ── 使用精神力加值 ──────────────────────────────────────────────────────
  { name: '精神抵抗力判定', ability: 'spirit', skills: ['冒险者等级'], baseValue: '精神抵抗力' },

  // ── 其他 ──────────────────────────────────────────────────────────────
  { name: '跳跃判定', ability: 'agility',  skills: ['冒险者等级'] },
  { name: '游泳判定', ability: 'agility',  skills: ['冒险者等级'] },
  { name: '真伪判定', ability: 'none',     skills: ['冒险者等级'] },
  { name: '探听判定', ability: 'none',     skills: ['任意技能'] },
  { name: '送还判定', ability: 'none',     skills: ['召异术师技能等级'] },
];

/** 判定组合（パッケージ） */
export const JUDGMENT_PACKAGES = {
  技巧判定组合: ['偷窃判定', '变装判定', '急救处理判定', '隐蔽判定', '解除判定', '陷阱设置判定'],
  观察判定组合: ['地图制作判定', '宝物鉴定判定', '疾病知识判定', '药品学判定', '足迹追踪判定', '异常感知判定', '聆听判定', '危险感知判定', '探索判定', '天候预测判定', '陷阱回避判定'],
  知识判定组合: ['地图制作判定', '宝物鉴定判定', '疾病知识判定', '药品学判定', '魔物知识判定', '文献判定', '文明鉴定判定', '见识判定'],
  运动判定组合: ['先制判定', '受身判定', '隐密判定', '杂技判定', '攀登判定', '跟踪判定'],
} as const;
