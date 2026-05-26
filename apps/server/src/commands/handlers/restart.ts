/**
 * @module commands/handlers/restart
 * .restart 指令 — 通过 QQ 重启服务器进程。
 *
 * 权限：仅 bot.admin_qq_list 中的 QQ 号可执行。
 * 用法：.restart [原因]
 */

import { createLogger } from '@dice-soup/logger';
import type { CommandContext, CommandHandler, CommandMeta } from '../types';

const log = createLogger({ module: 'cmd:restart' });

const RESTART_DELAY_MS = 2000;

export class RestartHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'restart',
    aliases: ['reboot'],
    action: 'write',
    scope: 'global',
    channel: 'both',
    requiredRole: 'admin',
    description: '重启 Bot 服务器（仅 Bot 管理员可用）',
    usage: '.restart [原因]',
  };

  async execute(ctx: CommandContext): Promise<void> {
    // 从配置读取 Bot 管理员列表
    const adminList = ctx.configService.getOptional<string[]>('bot.admin_qq_list') ?? [];
    if (!adminList.includes(ctx.senderQQ)) {
      log.warn({ senderQQ: ctx.senderQQ }, '[restart] 非管理员尝试执行重启');
      await ctx.reply('⛔ 该指令仅限 Bot 管理员使用');
      return;
    }

    const reason = ctx.rawArgs.trim() || '管理员 QQ 指令';

    log.warn({ senderQQ: ctx.senderQQ, reason }, '[restart] 收到 QQ 重启指令');

    await ctx.auditService.log({
      category: 'admin_op',
      actor: ctx.senderQQ,
      actorType: 'admin',
      action: 'server.restart',
      target: 'process',
      severity: 'warning',
      meta: { reason, channel: 'qq_command' },
    });

    await ctx.reply(`🔄 服务器正在重启，约 10 秒后恢复。\n原因：${reason}`);

    setTimeout(() => {
      log.info('[restart] 进程退出，等待重启...');
      process.exit(0);
    }, RESTART_DELAY_MS);
  }
}
