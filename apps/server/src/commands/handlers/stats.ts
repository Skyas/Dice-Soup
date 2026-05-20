/**
 * @module commands/handlers/stats
 * .stats 指令 — 查看个人统计名片。
 *
 * Phase 1 行为：
 * - 未建档用户 → 返回"你还未参加过游戏"，不触发建档（§1.3 M9）
 * - 已建档用户 → 返回最小画像（QQ + 加入日期 + "更多数据待解锁"提示）
 *
 * Phase 2+ 行为：接入 card-renderer，返回名片图片。
 */

import { createLogger } from '@dice-soup/logger';
import type { CommandContext, CommandHandler } from '../types';

const log = createLogger({ module: 'cmd:stats' });

/** 格式化 Unix ms 为可读日期 */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export class StatsHandler implements CommandHandler {
  readonly meta = {
    name: 'stats',
    aliases: ['我的', 'profile'],
    action: 'read' as const,
    scope: 'personal' as const,
    channel: 'both' as const,
    requiredRole: 'guest' as const,
    nlAllowed: true,
    description: '查看个人游戏统计名片',
    usage: '.stats',
    rateLimit: { per: 'user_room' as const, n: 1, window: '1m' },
  };

  async execute(ctx: CommandContext): Promise<void> {
    log.info({ senderQQ: ctx.senderQQ }, '[stats] 查询个人统计');

    const user = await ctx.userService.findUser(ctx.senderQQ);

    if (!user) {
      // 未建档：不创建用户，直接返回提示（§1.3 M9）
      await ctx.reply('📊 你还未参加过游戏，快去开一局试试吧！');
      return;
    }

    // Phase 1：最小画像（无游戏数据）
    const lines = [
      `📊 ${user.displayName} 的游戏档案`,
      `──────────────────────`,
      `🆔 QQ：${user.qqId}`,
      `📅 加入日期：${formatDate(user.createdAt)}`,
      `🕐 最近在线：${formatDate(user.lastSeenAt)}`,
      ``,
      `🎮 游戏数据：更多数据将在各游戏模块开放后解锁`,
      `🏆 称号：暂无（等待游戏数据积累）`,
      ``,
      `💡 提示：参与游戏后此处将显示详细战绩`,
    ];

    await ctx.reply(lines.join('\n'));
  }
}
