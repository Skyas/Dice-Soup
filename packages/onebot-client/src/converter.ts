/**
 * @module converter
 * OneBot v11 segment ↔ NormalizedMessage / OutgoingMessage 双向转换。
 * 入站只解析 6 种 segment，出站只发 4 种 segment。（§2.3）
 */

import type { NormalizedMessage, MessageSegment, OutgoingSegment, GroupChannel, PrivateChannel } from '@dice-soup/shared-types';
import type {
  OneBotMessageEvent,
  OneBotSegment,
  OneBotTextSegment,
  OneBotAtSegment,
  OneBotImageSegment,
  OneBotReplySegment,
  OneBotFileSegment,
} from './types';

// ─── 入站：OneBot → NormalizedMessage ────────────────────────────────────────

export function normalizeMessage(event: OneBotMessageEvent): NormalizedMessage {
  const channel: GroupChannel | PrivateChannel =
    event.message_type === 'group'
      ? { type: 'group', groupId: String(event.group_id), userId: String(event.user_id) }
      : { type: 'private', userId: String(event.user_id) };

  // 群昵称（card）优先，fallback QQ 昵称
  const senderName =
    event.sender.card?.trim() || event.sender.nickname || String(event.user_id);

  const segments = convertInboundSegments(event.message);

  return {
    id: String(event.message_id),
    platform: 'qq',
    channel,
    senderName,
    segments,
    raw: event,
    receivedAt: Date.now(),
  };
}

/**
 * 将 OneBot segment 数组转为标准化 MessageSegment 数组。
 * 只解析 6 种已知类型，其他静默丢弃（raw 保留完整 event）。
 */
function convertInboundSegments(segments: OneBotSegment[]): MessageSegment[] {
  const result: MessageSegment[] = [];

  for (const seg of segments) {
    switch (seg.type) {
      case 'text': {
        const text = (seg as OneBotTextSegment).data.text;
        if (text) result.push({ type: 'text', text });
        break;
      }

      case 'at': {
        const atSeg = seg as OneBotAtSegment;
        if (atSeg.data.qq === 'all') {
          result.push({ type: 'at_all' });
        } else {
          result.push({ type: 'at', userId: atSeg.data.qq });
        }
        break;
      }

      case 'image': {
        const imgSeg = seg as OneBotImageSegment;
        const url = imgSeg.data.url ?? '';
        result.push({ type: 'image', url, cacheFile: imgSeg.data.file });
        break;
      }

      case 'reply': {
        const replySeg = seg as OneBotReplySegment;
        result.push({ type: 'reply', messageId: replySeg.data.id });
        break;
      }

      case 'file': {
        const fileSeg = seg as OneBotFileSegment;
        result.push({
          type: 'file',
          name: fileSeg.data.name,
          url: fileSeg.data.url,
          fileId: fileSeg.data.file_id,
        });
        break;
      }

      // record / face / video / 其他 → 丢弃（raw 保留）
      default:
        break;
    }
  }

  return result;
}

// ─── 出站：OutgoingSegment[] → OneBot segment[] ───────────────────────────────

export function convertOutboundSegments(segments: OutgoingSegment[]): OneBotSegment[] {
  return segments.map((seg): OneBotSegment => {
    switch (seg.type) {
      case 'text':
        return { type: 'text', data: { text: seg.text } };

      case 'at':
        return { type: 'at', data: { qq: seg.userId } };

      case 'image': {
        const { source } = seg;
        switch (source.kind) {
          case 'url':
            return { type: 'image', data: { file: source.url, url: source.url } };
          case 'base64':
            return { type: 'image', data: { file: `base64://${source.data}` } };
          case 'file':
            return { type: 'image', data: { file: `file:///${source.path}` } };
        }
        break;
      }

      case 'reply':
        return { type: 'reply', data: { id: seg.messageId } };
    }
  });
}

// ─── 辅助：从 NormalizedMessage 中提取纯文本 ─────────────────────────────────

export function extractPlainText(msg: NormalizedMessage): string {
  return msg.segments
    .filter((s): s is { type: 'text'; text: string } => s.type === 'text')
    .map((s) => s.text)
    .join('')
    .trim();
}
