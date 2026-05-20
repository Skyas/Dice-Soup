/**
 * @module commands/handlers/help
 * .help 指令 — 列出所有指令。
 * 不触发建档，guest 可用。
 */

import { createLogger } from '@dice-soup/logger';
import type { CommandContext, CommandHandler } from '../types';
import type { CommandRegistry } from '../registry';

const log = createLogger({ module: 'cmd:help' });

export class HelpHandler implements CommandHandler {
  private readonly registry: CommandRegistry;

  readonly meta = {
    name: 'help',
    aliases: ['帮助'],
    action: 'read' as const,
    scope: 'global' as const,
    channel: 'both' as const,
    requiredRole: 'guest' as const,
    nlAllowed: true,
    description: '查看帮助与指令列表',
    usage: '.help',
  };

  constructor(registry: CommandRegistry) {
    this.registry = registry;
  }

  async execute(ctx: CommandContext): Promise<void> {
    log.info({ senderQQ: ctx.senderQQ }, '[help] 查看帮助');

    const prefix = ctx.configService.getCommandPrefix();
    const all = this.registry.all();

    // 按 action 分组
    const readCmds   = all.filter((h) => h.meta.action === 'read'   && !h.meta.hidden);
    const writeCmds  = all.filter((h) => h.meta.action === 'write'  && !h.meta.hidden);

    const lines: string[] = [
      '🎲 Dice&Soup 指令帮助',
      '─────────────────────',
    ];

    const formatCmd = (h: CommandHandler) => {
      const phase = h.meta.availableInPhase
        ? ` [第${h.meta.availableInPhase}阶段开放]`
        : '';
      const aliases = h.meta.aliases?.length
        ? ` (${h.meta.aliases.map((a) => `${prefix}${a}`).join('/')})`
        : '';
      return `  ${prefix}${h.meta.name}${aliases}${phase}`;
    };

    if (readCmds.length) {
      lines.push('📖 查询指令：');
      readCmds.forEach((h) => lines.push(formatCmd(h)));
    }

    if (writeCmds.length) {
      lines.push('');
      lines.push('🎮 游戏指令：');
      writeCmds.forEach((h) => lines.push(formatCmd(h)));
    }

    lines.push('');
    lines.push('💡 更多详情请访问管理后台');

    await ctx.reply(lines.join('\n'));
  }
}
