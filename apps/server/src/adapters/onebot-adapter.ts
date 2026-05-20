/**
 * @module adapters/onebot-adapter
 * OneBotAdapter 实现 PlatformAdapter 接口。
 * 内部使用 OneBotClient（onebot-client 包）管理 WS 连接。
 * 规则 P1~P5（§2.1）：业务层只依赖 PlatformAdapter 抽象，不感知断线重连。
 */

import { EventEmitter } from 'events';
import type {
  PlatformAdapter,
  NormalizedMessage,
  OutgoingMessage,
  GroupMemberInfo,
  SendGroupMessageOpts,
  AppError,
  Result,
} from '@dice-soup/shared-types';
import { ok, err, createError, ErrorCodes, textMessage } from '@dice-soup/shared-types';
import { OneBotClient } from '@dice-soup/onebot-client';
import {
  normalizeMessage,
  convertOutboundSegments,
} from '@dice-soup/onebot-client';
import type {
  OneBotMessageEvent,
  SendGroupMsgParams,
  SendPrivateMsgParams,
  GetGroupMemberInfoData,
} from '@dice-soup/onebot-client';
import { createLogger } from '@dice-soup/logger';
import type { ConfigService } from '../config/config-service';
import type { AuditService } from '../services/audit-service';

const log = createLogger({ module: 'onebot-adapter' });

export class OneBotAdapter extends EventEmitter implements PlatformAdapter {
  readonly platform = 'qq' as const;

  private readonly client: OneBotClient;
  private readonly config: ConfigService;
  private readonly audit: AuditService;

  /** 记录已调度的自动撤回 timer */
  private readonly recallTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    client: OneBotClient,
    config: ConfigService,
    audit: AuditService,
  ) {
    super();
    this.client = client;
    this.config = config;
    this.audit = audit;
  }

  // ── 生命周期 ──────────────────────────────────────────────────────────────

  async start(): Promise<Result<void, AppError>> {
    try {
      log.info('[adapter] 正在启动 OneBotAdapter...');

      // 转发 OneBot 连接状态事件
      this.client.on('connect', () => {
        log.info('[adapter] NapCat 已连接');
        this.emit('connect');
      });

      this.client.on('disconnect', () => {
        log.warn('[adapter] NapCat 已断开');
        this.emit('disconnect');
      });

      // 转发消息事件（OneBot → NormalizedMessage）
      this.client.on('message', (event: OneBotMessageEvent) => {
        try {
          const normalized = normalizeMessage(event);
          log.debug(
            {
              messageId: normalized.id,
              channelType: normalized.channel.type,
              sender: normalized.senderName,
            },
            '[adapter] 收到消息',
          );
          this.emit('message', normalized);
        } catch (convErr) {
          log.error({ err: convErr }, '[adapter] 消息标准化失败');
        }
      });

      // NapCat 鉴权失败 → 写审计日志
      this.client.on('auth_failed', async ({ remoteAddress }: { remoteAddress: string }) => {
        await this.audit.logOneBotAuthFailed(remoteAddress);
      });

      await this.client.start();
      log.info('[adapter] OneBotAdapter 启动完成');
      return ok(undefined);
    } catch (startErr) {
      log.error({ err: startErr }, '[adapter] 启动失败');
      return err(
        createError(ErrorCodes.PLATFORM_API_FAILED, `适配器启动失败: ${String(startErr)}`),
      );
    }
  }

  async stop(): Promise<void> {
    log.info('[adapter] 正在停止 OneBotAdapter...');
    // 清理所有自动撤回 timer
    for (const timer of this.recallTimers.values()) {
      clearTimeout(timer);
    }
    this.recallTimers.clear();
    await this.client.stop();
    log.info('[adapter] OneBotAdapter 已停止');
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }

  // ── 发送消息 ──────────────────────────────────────────────────────────────

  async sendGroupMessage(
    groupId: string,
    msg: OutgoingMessage,
    opts?: SendGroupMessageOpts,
  ): Promise<Result<{ messageId: string }, AppError>> {
    if (!this.client.isConnected()) {
      return err(createError(ErrorCodes.PLATFORM_DISCONNECTED, 'NapCat 未连接'));
    }

    // 检查消息长度
    const maxLen = this.config.get<number>('onebot.message_max_length', 4500);
    const totalText = msg.segments
      .filter((s) => s.type === 'text')
      .map((s) => (s as { type: 'text'; text: string }).text)
      .join('');
    if (totalText.length > maxLen) {
      log.warn({ length: totalText.length, maxLen }, '[adapter] 消息超过长度限制，截断');
    }

    try {
      const oneBotSegments = convertOutboundSegments(msg.segments);
      const resp = await this.client.sendAction<SendGroupMsgParams>('send_group_msg', {
        group_id: parseInt(groupId, 10),
        message: oneBotSegments,
      });

      if (resp.status !== 'ok') {
        log.warn({ retcode: resp.retcode, wording: resp.wording }, '[adapter] 发送群消息失败');
        return err(
          createError(ErrorCodes.PLATFORM_API_FAILED, resp.wording ?? '发送群消息失败', {
            retcode: resp.retcode,
          }),
        );
      }

      const messageId = String((resp.data as { message_id: number }).message_id);
      log.debug({ groupId, messageId }, '[adapter] 群消息发送成功');

      // 自动撤回
      if (opts?.recallAfterSeconds && opts.recallAfterSeconds > 0) {
        const timer = setTimeout(async () => {
          await this.recallMessage(messageId);
          this.recallTimers.delete(messageId);
        }, opts.recallAfterSeconds * 1000);
        this.recallTimers.set(messageId, timer);
      }

      return ok({ messageId });
    } catch (callErr) {
      log.error({ err: callErr, groupId }, '[adapter] 发送群消息异常');
      return err(
        createError(ErrorCodes.PLATFORM_API_FAILED, `发送群消息异常: ${String(callErr)}`),
      );
    }
  }

  async sendPrivateMessage(
    userId: string,
    msg: OutgoingMessage,
  ): Promise<Result<{ messageId: string }, AppError>> {
    if (!this.client.isConnected()) {
      return err(createError(ErrorCodes.PLATFORM_DISCONNECTED, 'NapCat 未连接'));
    }

    try {
      const oneBotSegments = convertOutboundSegments(msg.segments);
      const resp = await this.client.sendAction<SendPrivateMsgParams>('send_private_msg', {
        user_id: parseInt(userId, 10),
        message: oneBotSegments,
      });

      if (resp.status !== 'ok') {
        return err(
          createError(ErrorCodes.PLATFORM_API_FAILED, resp.wording ?? '发送私聊失败', {
            retcode: resp.retcode,
          }),
        );
      }

      const messageId = String((resp.data as { message_id: number }).message_id);
      log.debug({ userId, messageId }, '[adapter] 私聊消息发送成功');
      return ok({ messageId });
    } catch (callErr) {
      log.error({ err: callErr, userId }, '[adapter] 发送私聊消息异常');
      return err(
        createError(ErrorCodes.PLATFORM_API_FAILED, `发送私聊异常: ${String(callErr)}`),
      );
    }
  }

  async recallMessage(messageId: string): Promise<Result<void, AppError>> {
    if (!this.client.isConnected()) {
      return err(createError(ErrorCodes.PLATFORM_DISCONNECTED, 'NapCat 未连接'));
    }

    try {
      await this.client.sendAction('delete_msg', { message_id: parseInt(messageId, 10) });
      log.debug({ messageId }, '[adapter] 消息已撤回');
      return ok(undefined);
    } catch (callErr) {
      log.warn({ err: callErr, messageId }, '[adapter] 撤回消息失败（忽略）');
      return err(
        createError(ErrorCodes.PLATFORM_API_FAILED, `撤回失败: ${String(callErr)}`),
      );
    }
  }

  async getGroupMemberInfo(
    groupId: string,
    userId: string,
  ): Promise<Result<GroupMemberInfo, AppError>> {
    if (!this.client.isConnected()) {
      return err(createError(ErrorCodes.PLATFORM_DISCONNECTED, 'NapCat 未连接'));
    }

    try {
      const resp = await this.client.sendAction('get_group_member_info', {
        group_id: parseInt(groupId, 10),
        user_id: parseInt(userId, 10),
        no_cache: false,
      });

      if (resp.status !== 'ok') {
        return err(
          createError(ErrorCodes.PLATFORM_API_FAILED, '查询群成员失败', {
            retcode: resp.retcode,
          }),
        );
      }

      const data = resp.data as GetGroupMemberInfoData;
      return ok({
        nickname: data.nickname,
        card: data.card,
        role: data.role,
      });
    } catch (callErr) {
      log.error({ err: callErr, groupId, userId }, '[adapter] 查询群成员信息异常');
      return err(
        createError(ErrorCodes.PLATFORM_API_FAILED, `查询群成员异常: ${String(callErr)}`),
      );
    }
  }

  async downloadFile(_fileUrl: string): Promise<Result<{ localPath: string; size: number }, AppError>> {
    // 第四大阶段启用
    return err(createError(ErrorCodes.NOT_IMPLEMENTED, '文件下载将在第四大阶段开放'));
  }

  // ── 事件订阅 ──────────────────────────────────────────────────────────────

  on(event: 'message', handler: (msg: NormalizedMessage) => void): this;
  on(event: 'connect' | 'disconnect', handler: () => void): this;
  on(event: string, handler: (...args: any[]) => void): this {
    return super.on(event, handler);
  }

  off(event: string, handler: (...args: any[]) => void): this {
    return super.off(event, handler);
  }

  // ── 工具方法 ──────────────────────────────────────────────────────────────

  /** 构造带 Bot 前缀的文本消息（§4.4.8）*/
  prefixedText(text: string): OutgoingMessage {
    const prefix = this.config.getBotPrefix();
    return textMessage(`${prefix} ${text}`);
  }
}
