/**
 * @module commands/handlers/ping
 * .ping 指令 — 连通性检测。第一里程碑核心验收指令。
 * 任何用户均可使用，不触发建档，不写审计。
 */

import { createLogger } from '@dice-soup/logger';
import type { CommandContext, CommandHandler } from '../types';

const log = createLogger({ module: 'cmd:ping' });

export class PingHandler implements CommandHandler {
  readonly meta = {
    name: 'ping',
    aliases: [],
    action: 'read' as const,
    scope: 'global' as const,
    channel: 'both' as const,
    requiredRole: 'guest' as const,
    nlAllowed: false,
    description: '连通性检测',
    usage: '.ping',
  };

  async execute(ctx: CommandContext): Promise<void> {
    const latency = Date.now() - ctx.message.receivedAt;
    log.info({ senderQQ: ctx.senderQQ, latencyMs: latency }, '[ping] pong');
    await ctx.reply(`🏓 Pong！延迟 ${latency}ms`);
  }
}
