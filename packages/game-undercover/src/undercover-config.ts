/**
 * @module game-undercover/undercover-config
 * 人数配置表（§4.1）。
 */

export interface PlayerCountConfig {
  totalPlayers: number;
  civilians: number;
  undercovers: number;
  /** 白板数量（0 或 1，可选功能，enableBlank 控制） */
  blanks: number;
  /** 卧底胜利：剩余玩家数量 ≤ 此值时卧底存活即胜 */
  undercoverWinAtRemaining: number;
}

/** 标准人数配置（不含白板），若 enableBlank=true 则替换一个平民为白板 */
const BASE_CONFIGS: Record<number, Omit<PlayerCountConfig, 'blanks'>> = {
  4:  { totalPlayers: 4,  civilians: 3, undercovers: 1, undercoverWinAtRemaining: 2 },
  5:  { totalPlayers: 5,  civilians: 4, undercovers: 1, undercoverWinAtRemaining: 2 },
  6:  { totalPlayers: 6,  civilians: 5, undercovers: 1, undercoverWinAtRemaining: 2 },
  7:  { totalPlayers: 7,  civilians: 5, undercovers: 2, undercoverWinAtRemaining: 3 },
  8:  { totalPlayers: 8,  civilians: 6, undercovers: 2, undercoverWinAtRemaining: 3 },
  9:  { totalPlayers: 9,  civilians: 7, undercovers: 2, undercoverWinAtRemaining: 3 },
  10: { totalPlayers: 10, civilians: 8, undercovers: 2, undercoverWinAtRemaining: 3 },
  11: { totalPlayers: 11, civilians: 8, undercovers: 3, undercoverWinAtRemaining: 3 },
  12: { totalPlayers: 12, civilians: 9, undercovers: 3, undercoverWinAtRemaining: 3 },
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 12;

/**
 * 获取玩家人数配置。
 * enableBlank 为 true 时，减一个平民名额换成白板（≥5 人时才启用）。
 */
export function getPlayerConfig(totalPlayers: number, enableBlank: boolean): PlayerCountConfig | null {
  const base = BASE_CONFIGS[totalPlayers];
  if (!base) return null;

  const canEnableBlank = enableBlank && totalPlayers >= 5;
  return {
    ...base,
    civilians: canEnableBlank ? base.civilians - 1 : base.civilians,
    blanks: canEnableBlank ? 1 : 0,
  };
}

export function isValidPlayerCount(n: number): boolean {
  return n >= MIN_PLAYERS && n <= MAX_PLAYERS;
}
