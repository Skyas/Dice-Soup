/**
 * @module profile
 * 用户画像相关 TS 类型定义。
 * 第一阶段建好完整类型，各阶段只填对应字段。（§1.5）
 */

// ─── 游戏统计 ────────────────────────────────────────────────────────────────

export interface SoupStats {
  played: number;
  won: number;
  contributionAvg: number;
  totalQuestions: number;
}

export interface AvalonStats {
  played: number;
  winByTeam: { good: number; evil: number };
  assassinSuccess: number;
}

export interface UndercoverStats {
  played: number;
  winByRole: { civilian: number; undercover: number; blank: number };
}

export interface Coc7Stats {
  sessions: number;
  survivingChars: number;
  sanityLowCount: number;
}

export interface UserStats {
  soup?: SoupStats;
  avalon?: AvalonStats;
  undercover?: UndercoverStats;
  trpg?: {
    coc7?: Coc7Stats;
  };
}

// ─── 用户偏好 ────────────────────────────────────────────────────────────────

export type TaskType =
  | 'dice_nl_parse'
  | 'soup_judge'
  | 'soup_restore'
  | 'trpg_narrate'
  | 'trpg_npc'
  | 'game_arbitrate'
  | 'summary'
  | 'intent_parse';

export interface UserPreferences {
  preferredModels?: Partial<Record<TaskType, string>>;
  cardTemplateStyle?: 'classic' | 'dark' | 'minimal';
}

// ─── 称号/徽章 ───────────────────────────────────────────────────────────────

export interface UnlockedBadge {
  id: string;
  unlockedAt: number;
}

// ─── 已玩内容（防重复推送） ──────────────────────────────────────────────────

export interface GamesPlayed {
  soupPuzzleIds?: string[];
  moduleIds?: string[];
}

// ─── 汇总（对应 user_profiles 表 JSON 字段） ─────────────────────────────────

export interface UserProfileJson {
  stats: UserStats;
  preferences: UserPreferences;
  badges: UnlockedBadge[];
  gamesPlayed: GamesPlayed;
}
