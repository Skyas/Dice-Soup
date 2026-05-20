/**
 * @module types
 * OneBot v11 协议类型定义。
 * 完全自写，参照 OneBot v11 公开规范文档（https://11.onebot.dev/）。
 * 不依赖任何 AGPL 包，本文件采用 MIT 协议。
 */

// ─── 入站事件（NapCat → 我们） ───────────────────────────────────────────────

export type OneBotEvent =
  | OneBotMessageEvent
  | OneBotMetaEvent
  | OneBotNoticeEvent
  | OneBotRequestEvent;

// ── 消息事件 ──

export interface OneBotMessageEvent {
  post_type: 'message';
  message_type: 'group' | 'private';
  sub_type: string;
  message_id: number;
  user_id: number;
  message: OneBotSegment[];
  raw_message: string;
  font: number;
  sender: OneBotSender;
  time: number;
  self_id: number;
  // 群聊专有
  group_id?: number;
  anonymous?: OneBotAnonymous | null;
}

export interface OneBotSender {
  user_id: number;
  nickname: string;
  sex?: 'male' | 'female' | 'unknown';
  age?: number;
  // 群聊专有
  card?: string;
  area?: string;
  level?: string;
  role?: 'owner' | 'admin' | 'member';
  title?: string;
}

export interface OneBotAnonymous {
  id: number;
  name: string;
  flag: string;
}

// ── 元事件 ──

export interface OneBotMetaEvent {
  post_type: 'meta_event';
  meta_event_type: 'heartbeat' | 'lifecycle';
  time: number;
  self_id: number;
  status?: OneBotStatus;
  interval?: number;
}

export interface OneBotStatus {
  online: boolean;
  good: boolean;
}

// ── 通知事件（第一期不处理，仅记录） ──

export interface OneBotNoticeEvent {
  post_type: 'notice';
  notice_type: string;
  time: number;
  self_id: number;
  [key: string]: unknown;
}

// ── 请求事件（第一期不处理） ──

export interface OneBotRequestEvent {
  post_type: 'request';
  request_type: string;
  time: number;
  self_id: number;
  [key: string]: unknown;
}

// ─── 消息段（Segment） ───────────────────────────────────────────────────────

export type OneBotSegment =
  | OneBotTextSegment
  | OneBotAtSegment
  | OneBotImageSegment
  | OneBotReplySegment
  | OneBotFaceSegment
  | OneBotRecordSegment
  | OneBotVideoSegment
  | OneBotFileSegment
  | OneBotUnknownSegment;

export interface OneBotTextSegment {
  type: 'text';
  data: { text: string };
}

export interface OneBotAtSegment {
  type: 'at';
  data: { qq: string; name?: string };
}

export interface OneBotImageSegment {
  type: 'image';
  data: {
    file: string;
    url?: string;
    type?: string;
    subType?: number;
  };
}

export interface OneBotReplySegment {
  type: 'reply';
  data: { id: string };
}

export interface OneBotFaceSegment {
  type: 'face';
  data: { id: string };
}

export interface OneBotRecordSegment {
  type: 'record';
  data: { file: string; url?: string };
}

export interface OneBotVideoSegment {
  type: 'video';
  data: { file: string; url?: string };
}

export interface OneBotFileSegment {
  type: 'file';
  data: { name: string; url?: string; file_id?: string };
}

export interface OneBotUnknownSegment {
  type: string;
  data: Record<string, unknown>;
}

// ─── 出站动作（我们 → NapCat） ───────────────────────────────────────────────

export interface OneBotAction<T = Record<string, unknown>> {
  action: string;
  params: T;
  echo: string;
}

export interface OneBotActionResponse {
  status: 'ok' | 'failed';
  retcode: number;
  data: unknown;
  echo: string;
  msg?: string;
  wording?: string;
}

// ── 具体动作参数类型 ──

export interface SendGroupMsgParams {
  group_id: number;
  message: OneBotSegment[];
  auto_escape?: boolean;
}

export interface SendPrivateMsgParams {
  user_id: number;
  message: OneBotSegment[];
  auto_escape?: boolean;
}

export interface DeleteMsgParams {
  message_id: number;
}

export interface GetGroupMemberInfoParams {
  group_id: number;
  user_id: number;
  no_cache?: boolean;
}

export interface GetStrangerInfoParams {
  user_id: number;
  no_cache?: boolean;
}

export interface GetGroupMemberInfoData {
  group_id: number;
  user_id: number;
  nickname: string;
  card: string;
  sex: string;
  age: number;
  area: string;
  join_time: number;
  last_sent_time: number;
  level: string;
  role: 'owner' | 'admin' | 'member';
  unfriendly: boolean;
  title: string;
  title_expire_time: number;
  card_changeable: boolean;
}

export interface SendMsgResponseData {
  message_id: number;
}
