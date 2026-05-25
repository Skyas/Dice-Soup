/**
 * @module commands/handlers/stats
 * .stats 指令 — 查看个人统计名片。
 *
 * 查询 soup_play_records 展示真实战绩；
 * 未参与游戏的用户给出"未建档"提示。
 */

import { createLogger } from '@dice-soup/logger';
import type { CommandContext, CommandHandler } from '../types';
import type { SoupService } from '../../services/soup-service';

const log = createLogger({ module: 'cmd:stats' });

/** 格式化 Unix 秒/毫秒 时间戳为可读日期 */
function formatDate(ts: number): string {
  // createdAt / lastSeenAt 可能是秒或毫秒，统一转毫秒
  const ms = ts < 1e12 ? ts * 1000 : ts;
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

  constructor(private readonly soupService: SoupService) {}

  async execute(ctx: CommandContext): Promise<void> {
    log.info({ senderQQ: ctx.senderQQ }, '[stats] 查询个人统计');

    const user = await ctx.userService.findUser(ctx.senderQQ);

    if (!user) {
      await ctx.reply('📊 你还未参加过游戏，快去开一局试试吧！');
      return;
    }

    // 查询真实海龟汤战绩
    const stats = await this.soupService.getUserSoupStats(ctx.senderQQ);

    const lines = [
      `📊 ${user.displayName} 的游戏档案`,
      `──────────────────────`,
      `🆔 QQ：${user.qqId}`,
      `📅 加入日期：${formatDate(user.createdAt)}`,
      `🕐 最近在线：${formatDate(user.lastSeenAt)}`,
      ``,
    ];

    if (stats.totalGames === 0) {
      lines.push(`🎮 海龟汤：尚未完成任何对局`);
    } else {
      const winRate = stats.totalGames > 0 ? Math.round((stats.wins / stats.totalGames) * 100) : 0;
      lines.push(`🎮 海龟汤战绩：`);
      lines.push(`  总对局：${stats.totalGames}局（通关 ${stats.wins} / 放弃 ${stats.giveups}）`);
      lines.push(`  通关率：${winRate}%`);
      lines.push(`  平均贡献度：${stats.avgScore.toFixed(1)}分`);
      lines.push(`  累计突破：${stats.totalBreakthroughs}次 / 累计提问：${stats.totalQuestions}次`);
    }

    lines.push(``);
    lines.push(`🏆 称号：${stats.wins >= 10 ? '🔍 资深侦探' : stats.wins >= 3 ? '🐢 汤道入门' : '暂无（等待游戏数据积累）'}`);

    await ctx.reply(lines.join('\n'));
  }
}
