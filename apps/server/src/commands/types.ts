/**
 * @module commands/types
 * 指令系统核心类型定义。（§5.7）
 *
 * 指令三维标签：
 *   action  : read | write | system
 *   scope   : personal | session | global
 *   channel : group_only | private_only | both
 */

import type { NormalizedMessage, OutgoingMessage } from '@dice-soup/shared-types';
import type { UserService } from '../services/user-service';
import type { AuditService } from '../services/audit-service';
import type { ConfigService } from '../config/config-service';

// ─── 角色 ──────────────────────────────────────────────────────────────────

export type CommandRole = 'admin' | 'kp' | 'player' | 'guest';

// ─── 限流配置 ──────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** 限流单元：per user、per user+room */
  per: 'user' | 'user_room';
  /** 时间窗口内最大调用次数 */
  n: number;
  /** 时间窗口，格式 '1m' | '5m' | '1h' */
  window: string;
}

// ─── 指令元信息 ────────────────────────────────────────────────────────────

export interface CommandMeta {
  /** 指令主名，如 'ping'、'soup.start' */
  name: string;
  /** 别名列表 */
  aliases?: string[];
  /** 操作类型 */
  action: 'read' | 'write' | 'system';
  /** 作用域 */
  scope: 'personal' | 'session' | 'global';
  /** 允许的消息来源频道 */
  channel: 'group_only' | 'private_only' | 'both';
  /** 执行所需最低角色 */
  requiredRole: CommandRole;
  /** 是否允许自然语言路由触发 */
  nlAllowed?: boolean;
  /** 是否需要二次确认 */
  twoStepConfirm?: boolean;
  /** 限流配置，未设置则不限流 */
  rateLimit?: RateLimitConfig;
  /** 简短描述（显示在 .help 中） */
  description: string;
  /** 用法示例 */
  usage?: string;
  /** 是否在 .help 中隐藏（占位指令可见但标注"开放时间"） */
  hidden?: boolean;
  /** 该功能预计在哪个阶段开放（用于占位提示） */
  availableInPhase?: number;
}

// ─── 指令上下文 ────────────────────────────────────────────────────────────

export interface CommandContext {
  /** 原始入站消息 */
  message: NormalizedMessage;
  /** 解析出的指令名（已去除前缀） */
  commandName: string;
  /** 指令参数，原始字符串（去除指令名之后的部分） */
  rawArgs: string;
  /** 分词后的参数数组（以空格分割） */
  args: string[];

  // ── 发信人信息 ────────────────────────────────────────────────────────────
  /** 发信人 QQ 号 */
  senderQQ: string;
  /** 发信人昵称 */
  senderName: string;
  /** 群号（私聊时为 null） */
  groupId: string | null;

  // ── 服务句柄 ──────────────────────────────────────────────────────────────
  userService: UserService;
  auditService: AuditService;
  configService: ConfigService;

  // ── 回复工具方法 ──────────────────────────────────────────────────────────
  /** 回复到消息来源（群或私聊） */
  reply(msg: OutgoingMessage | string): Promise<void>;
  /** 私聊发送给发信人 */
  replyPrivate(msg: OutgoingMessage | string): Promise<void>;
}

// ─── 指令处理器 ────────────────────────────────────────────────────────────

export interface CommandHandler {
  meta: CommandMeta;
  execute(ctx: CommandContext): Promise<void>;
}
