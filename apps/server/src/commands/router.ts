/**
 * @module commands/router
 * 指令路由器。
 *
 * 职责：
 *   1. 检查消息是否以指令前缀开头
 *   2. 解析指令名 + 参数
 *   3. 在 Registry 中查找 handler
 *   4. 校验频道限制（group_only / private_only）
 *   5. RBAC 权限检查（第一阶段简化：admin 指令暂时仅挡住，其余放行）
 *   6. 封禁用户检查
 *   7. 构建 CommandContext 并调用 handler.execute()
 *
 * 注意：限流（RateLimiter）将在第一阶段后期集成，此处预留接口。
 */

import { createLogger } from '@dice-soup/logger';
import type { NormalizedMessage, OutgoingMessage, PlatformAdapter } from '@dice-soup/shared-types';
import { textMessage } from '@dice-soup/shared-types';
import type { ConfigService } from '../config/config-service';
import type { UserService } from '../services/user-service';
import type { AuditService } from '../services/audit-service';
import type { CommandContext } from './types';
import { CommandRegistry } from './registry';

// ── 内置 handlers（第一阶段） ─────────────────────────────────────────────
import { PingHandler } from './handlers/ping';
import { HelpHandler } from './handlers/help';
import { StatsHandler } from './handlers/stats';
import { PlaceholderHandler } from './handlers/placeholder';

const log = createLogger({ module: 'command-router' });

export class CommandRouter {
  private readonly registry = new CommandRegistry();
  private readonly configService: ConfigService;
  private readonly userService: UserService;
  private readonly auditService: AuditService;
  private adapter?: PlatformAdapter;

  constructor(
    configService: ConfigService,
    userService: UserService,
    auditService: AuditService,
  ) {
    this.configService = configService;
    this.userService = userService;
    this.auditService = auditService;
    this.registerBuiltinHandlers();
  }

  /** 注入 PlatformAdapter（避免循环依赖，在 bootstrap 后调用） */
  setAdapter(adapter: PlatformAdapter): void {
    this.adapter = adapter;
  }

  // ── 内置指令注册 ──────────────────────────────────────────────────────────

  private registerBuiltinHandlers(): void {
    this.registry.register(new PingHandler());
    this.registry.register(new HelpHandler(this.registry));
    this.registry.register(new StatsHandler());

    // Phase 1 占位指令
    this.registry.register(PlaceholderHandler.make('r', ['roll'], '骰子功能', 3));
    this.registry.register(PlaceholderHandler.make('soup.start', ['soup'], '海龟汤游戏', 2));
    this.registry.register(PlaceholderHandler.make('avalon.start', ['avalon'], '阿瓦隆桌游', 3));
    this.registry.register(PlaceholderHandler.make('undercover.start', ['undercover', '卧底'], '谁是卧底桌游', 3));
    this.registry.register(PlaceholderHandler.make('coc.start', ['coc'], '跑团（CoC 7th）', 4));
    this.registry.register(PlaceholderHandler.make('card.show', ['card'], '角色卡查询', 4));
    this.registry.register(PlaceholderHandler.make('module.upload', ['module'], '模组上传', 4));
    this.registry.register(PlaceholderHandler.make('soup.submit', [], '海龟汤投稿', 2));
    this.registry.register(PlaceholderHandler.make('stop', [], '结束当前会话', 2));
  }

  // ── 消息分发入口 ──────────────────────────────────────────────────────────

  /**
   * 处理一条入站消息。
   * 若不是指令（不以前缀开头），直接返回 false（由上层决定是否走 NL 路由）。
   * @returns true 表示已处理（无论成功失败），false 表示非指令消息
   */
  async handle(message: NormalizedMessage): Promise<boolean> {
    const prefix = this.configService.getCommandPrefix();
    const text = message.segments
      .filter((s): s is { type: 'text'; text: string } => s.type === 'text')
      .map((s) => s.text)
      .join('')
      .trim();

    if (!text.startsWith(prefix)) {
      return false;
    }

    const withoutPrefix = text.slice(prefix.length).trim();
    if (!withoutPrefix) {
      return false;
    }

    // 解析指令名和参数
    const spaceIdx = withoutPrefix.indexOf(' ');
    const commandName = spaceIdx === -1
      ? withoutPrefix.toLowerCase()
      : withoutPrefix.slice(0, spaceIdx).toLowerCase();
    const rawArgs = spaceIdx === -1 ? '' : withoutPrefix.slice(spaceIdx + 1).trim();
    const args = rawArgs ? rawArgs.split(/\s+/) : [];

    log.info(
      {
        commandName,
        args,
        sender: message.channel.type === 'group' ? message.channel.userId : message.channel.userId,
        channel: message.channel.type,
      },
      `[router] 收到指令 ${prefix}${commandName}`,
    );

    const handler = this.registry.find(commandName);
    if (!handler) {
      await this.sendReply(message, `❓ 未知指令 "${prefix}${commandName}"，输入 ${prefix}help 查看帮助`);
      return true;
    }

    // ── 频道限制检查 ─────────────────────────────────────────────────────
    const isGroup = message.channel.type === 'group';
    const channelRule = handler.meta.channel;
    if (channelRule === 'group_only' && !isGroup) {
      await this.sendReply(message, `⚠️ 指令 ${prefix}${commandName} 仅限在群内使用`);
      return true;
    }
    if (channelRule === 'private_only' && isGroup) {
      await this.sendReply(message, `⚠️ 指令 ${prefix}${commandName} 仅限私聊使用`);
      return true;
    }

    // ── 封禁检查 ─────────────────────────────────────────────────────────
    const senderQQ = message.channel.type === 'group'
      ? message.channel.userId
      : message.channel.userId;

    if (await this.userService.isBanned(senderQQ)) {
      log.warn({ senderQQ, commandName }, '[router] 封禁用户尝试使用指令');
      await this.sendReply(message, '⛔ 你的账号已被封禁，无法使用任何功能');
      return true;
    }

    // ── RBAC 简化检查（第一阶段：system 级指令拒绝普通用户） ─────────────
    if (handler.meta.action === 'system') {
      await this.sendReply(message, '⛔ 该指令仅限管理员通过 Web 后台操作');
      await this.auditService.logPermissionDeny(senderQQ, commandName, handler.meta.requiredRole);
      return true;
    }

    // ── 构建 Context 并执行 ──────────────────────────────────────────────
    const ctx = this.buildContext(message, commandName, rawArgs, args, senderQQ);

    try {
      await handler.execute(ctx);
    } catch (err) {
      log.error({ err, commandName, senderQQ }, '[router] 指令执行异常');
      await this.sendReply(message, '💥 执行指令时发生内部错误，请稍后重试');
    }

    return true;
  }

  // ── 工具方法 ─────────────────────────────────────────────────────────────

  private buildContext(
    message: NormalizedMessage,
    commandName: string,
    rawArgs: string,
    args: string[],
    senderQQ: string,
  ): CommandContext {
    const adapter = this.adapter!;
    const groupId = message.channel.type === 'group' ? message.channel.groupId : null;

    const reply = async (msg: OutgoingMessage | string) => {
      const outgoing = typeof msg === 'string' ? textMessage(msg) : msg;
      if (groupId) {
        await adapter.sendGroupMessage(groupId, outgoing);
      } else {
        await adapter.sendPrivateMessage(senderQQ, outgoing);
      }
    };

    const replyPrivate = async (msg: OutgoingMessage | string) => {
      const outgoing = typeof msg === 'string' ? textMessage(msg) : msg;
      await adapter.sendPrivateMessage(senderQQ, outgoing);
    };

    return {
      message,
      commandName,
      rawArgs,
      args,
      senderQQ,
      senderName: message.senderName,
      groupId,
      userService: this.userService,
      auditService: this.auditService,
      configService: this.configService,
      reply,
      replyPrivate,
    };
  }

  private async sendReply(message: NormalizedMessage, text: string): Promise<void> {
    if (!this.adapter) {
      log.warn('[router] adapter 未注入，无法回复');
      return;
    }
    const outgoing = textMessage(text);
    if (message.channel.type === 'group') {
      await this.adapter.sendGroupMessage(message.channel.groupId, outgoing);
    } else {
      await this.adapter.sendPrivateMessage(message.channel.userId, outgoing);
    }
  }
}
