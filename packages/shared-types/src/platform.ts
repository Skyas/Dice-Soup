/**
 * @module platform
 * PlatformAdapter 接口及跨平台消息抽象。
 * 业务层只依赖此文件中的抽象，不依赖任何具体平台实现。
 */

import type { Result } from './errors';
import type { AppError } from './errors';

// ─── 平台标识 ────────────────────────────────────────────────────────────────

export type Platform = 'qq';

// ─── 入站消息（NormalizedMessage） ──────────────────────────────────────────

export interface NormalizedMessage {
  /** 平台原始消息 ID */
  id: string;
  platform: Platform;
  channel: GroupChannel | PrivateChannel;
  /** 发送者昵称（群昵称优先，fallback QQ 昵称） */
  senderName: string;
  /** 标准化后的内容片段 */
  segments: MessageSegment[];
  /** 原始平台事件，便于 debug */
  raw: unknown;
  /** 接收时间 unix ms */
  receivedAt: number;
}

export interface GroupChannel {
  type: 'group';
  groupId: string;
  userId: string;
}

export interface PrivateChannel {
  type: 'private';
  userId: string;
}

/** 入站只解析这 6 种 segment，其余丢弃（raw 保留） */
export type MessageSegment =
  | { type: 'text'; text: string }
  | { type: 'at'; userId: string }
  | { type: 'at_all' }
  | { type: 'image'; url: string; cacheFile?: string }
  | { type: 'reply'; messageId: string }
  | { type: 'file'; name: string; url?: string; fileId?: string };

// ─── 出站消息（OutgoingMessage） ────────────────────────────────────────────

export interface OutgoingMessage {
  segments: OutgoingSegment[];
}

/** 出站只发这 4 种 segment，第一期不支持合并转发 */
export type OutgoingSegment =
  | { type: 'text'; text: string }
  | { type: 'at'; userId: string }
  | { type: 'image'; source: ImageSource }
  | { type: 'reply'; messageId: string };

export type ImageSource =
  | { kind: 'url'; url: string }
  | { kind: 'base64'; data: string }
  | { kind: 'file'; path: string };

/** 快捷构造纯文本消息 */
export function textMessage(text: string): OutgoingMessage {
  return { segments: [{ type: 'text', text }] };
}

/** 快捷构造 at + 文本消息 */
export function atMessage(userId: string, text: string): OutgoingMessage {
  return { segments: [{ type: 'at', userId }, { type: 'text', text: ' ' + text }] };
}

// ─── 群成员信息 ──────────────────────────────────────────────────────────────

export interface GroupMemberInfo {
  nickname: string;
  card: string;
  role: 'owner' | 'admin' | 'member';
}

// ─── PlatformAdapter 接口 ────────────────────────────────────────────────────

export interface PlatformAdapter {
  readonly platform: Platform;

  // 生命周期
  start(): Promise<Result<void, AppError>>;
  stop(): Promise<void>;
  isConnected(): boolean;

  // 发消息
  sendGroupMessage(
    groupId: string,
    msg: OutgoingMessage,
    opts?: SendGroupMessageOpts,
  ): Promise<Result<{ messageId: string }, AppError>>;

  sendPrivateMessage(
    userId: string,
    msg: OutgoingMessage,
  ): Promise<Result<{ messageId: string }, AppError>>;

  // 撤回
  recallMessage(messageId: string): Promise<Result<void, AppError>>;

  // 群信息查询
  getGroupMemberInfo(
    groupId: string,
    userId: string,
  ): Promise<Result<GroupMemberInfo, AppError>>;

  // 文件下载（第四大阶段启用）
  downloadFile(fileUrl: string): Promise<Result<{ localPath: string; size: number }, AppError>>;

  // 事件订阅
  on(event: 'message', handler: (msg: NormalizedMessage) => void): void;
  on(event: 'connect' | 'disconnect', handler: () => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

export interface SendGroupMessageOpts {
  /** 发送后自动撤回的秒数 */
  recallAfterSeconds?: number;
}
