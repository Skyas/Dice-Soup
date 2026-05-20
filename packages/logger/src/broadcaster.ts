/**
 * @module broadcaster
 * LogBroadcaster 管理连接到 /admin/logs/stream 的 WebSocket 客户端。
 * 维护一个环形缓冲区（最近 1000 条），新客户端连接时先推送历史，然后实时推送。
 * 规则 13：Log Viewer 必须支持 WebSocket 实时推送。
 */

// 使用 any 以避免对具体 WS 实现的硬依赖（兼容 @fastify/websocket 的 socket）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WsSocket = any;

export interface LogEntry {
  level: number;
  levelLabel: string;
  time: number;
  msg: string;
  module?: string;
  sessionId?: string;
  userId?: string;
  groupId?: string;
  requestId?: string;
  [key: string]: unknown;
}

const LEVEL_LABELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

/** 单例广播器，全局使用同一个实例 */
export class LogBroadcaster {
  private readonly buffer: LogEntry[] = [];
  private readonly maxBuffer = 1000;
  private readonly clients = new Set<WsSocket>();

  /** 写入一条日志（由 Pino 自定义 write 流调用） */
  write(rawLine: string): void {
    try {
      const entry = JSON.parse(rawLine) as LogEntry;
      // 补充 levelLabel 方便前端渲染
      if (!entry.levelLabel) {
        entry.levelLabel = LEVEL_LABELS[entry.level] ?? 'unknown';
      }
      // 环形缓冲区
      this.buffer.push(entry);
      if (this.buffer.length > this.maxBuffer) {
        this.buffer.shift();
      }
      this.broadcast({ type: 'log', entry });
    } catch {
      // 非 JSON 行（如 pino pretty 输出）忽略
    }
  }

  /**
   * 新 WebSocket 客户端连接时注册。
   * @returns unsubscribe 函数，手动取消订阅时调用
   */
  subscribe(socket: WsSocket): () => void {
    this.clients.add(socket);

    // 推送最近 100 条历史
    const history = this.buffer.slice(-100);
    this.safeSend(socket, { type: 'history', entries: history });

    const cleanup = (): void => { this.clients.delete(socket); };
    socket.on('close', cleanup);
    socket.on('error', cleanup);

    return cleanup;
  }

  /**
   * 返回最近 N 条日志（HTTP 端点用）。
   */
  getRecentLogs(limit = 200): LogEntry[] {
    return this.buffer.slice(-Math.min(limit, this.maxBuffer));
  }

  /** 广播给所有连接的客户端 */
  private broadcast(payload: unknown): void {
    if (this.clients.size === 0) return;
    const msg = JSON.stringify(payload);
    for (const socket of this.clients) {
      this.safeSend(socket, msg, true);
    }
  }

  private safeSend(socket: WsSocket, payload: unknown, rawString = false): void {
    try {
      if (socket.readyState !== 1 /* OPEN */) return;
      socket.send(rawString ? payload : JSON.stringify(payload));
    } catch {
      this.clients.delete(socket);
    }
  }

  /** 返回连接的客户端数量（用于监控） */
  get clientCount(): number {
    return this.clients.size;
  }

  /** 返回缓冲区条目数（用于监控） */
  get bufferSize(): number {
    return this.buffer.length;
  }
}

/** 全局单例 */
export const logBroadcaster = new LogBroadcaster();
