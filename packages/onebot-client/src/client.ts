/**
 * @module client
 * OneBotClient — 反向 WebSocket 服务端实现。
 * NapCat 主动连接此服务（我们是 WS 服务端），监听 /onebot 路径，默认端口 6700。
 * 参考设计文档 §2.2 §2.5。
 */

import http from 'http';
import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { Logger } from '@dice-soup/logger';
import type {
  OneBotEvent,
  OneBotAction,
  OneBotActionResponse,
  OneBotMessageEvent,
} from './types';

// ─── 配置 ────────────────────────────────────────────────────────────────────

export interface OneBotClientConfig {
  wsPort: number;
  accessToken?: string;
  heartbeatTimeoutMs: number;
  apiTimeoutMs: number;
  path?: string;
}

// ─── 内部状态 ────────────────────────────────────────────────────────────────

interface PendingCall {
  resolve: (resp: OneBotActionResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ─── OneBotClient ────────────────────────────────────────────────────────────

export class OneBotClient extends EventEmitter {
  private readonly config: OneBotClientConfig;
  private readonly log: Logger;

  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;

  /** 当前唯一连接的 NapCat socket（第一期单连接） */
  private napcat: WebSocket | null = null;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatAt = 0;

  /** 等待 echo 匹配的 API 调用 map */
  private readonly pendingCalls = new Map<string, PendingCall>();

  private echoCounter = 0;

  constructor(config: OneBotClientConfig, log: Logger) {
    super();
    this.config = config;
    this.log = log;
  }

  // ── 生命周期 ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const { wsPort, accessToken, path: wsPath = '/onebot' } = this.config;

    this.httpServer = http.createServer();
    this.wss = new WebSocketServer({ server: this.httpServer, path: wsPath });

    this.wss.on('connection', (socket, req) => {
      this.log.info(
        { remoteAddress: req.socket.remoteAddress },
        '[onebot] NapCat 连接请求到来',
      );

      // 鉴权
      if (accessToken) {
        const authHeader = req.headers['authorization'] ?? '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
        if (token !== accessToken) {
          this.log.warn({ remoteAddress: req.socket.remoteAddress }, '[onebot] access_token 验证失败，拒绝连接');
          socket.close(1008, 'Unauthorized');
          // 写审计日志由上层通过事件处理
          this.emit('auth_failed', { remoteAddress: req.socket.remoteAddress });
          return;
        }
      }

      // 如果已有连接，断开旧的（第一期单连接模式）
      if (this.napcat && this.napcat.readyState === WebSocket.OPEN) {
        this.log.warn('[onebot] 已有 NapCat 连接，断开旧连接');
        this.napcat.close(1001, 'New connection');
      }

      this.napcat = socket;
      this.lastHeartbeatAt = Date.now();
      this.startHeartbeatMonitor();

      this.log.info('[onebot] NapCat 连接已接受，开始监听消息');
      this.emit('connect');

      socket.on('message', (data) => this.handleMessage(data));

      socket.on('close', (code, reason) => {
        this.log.warn({ code, reason: reason.toString() }, '[onebot] NapCat 连接断开');
        this.napcat = null;
        this.stopHeartbeatMonitor();
        this.rejectAllPending(new Error('Connection closed'));
        this.emit('disconnect');
      });

      socket.on('error', (err) => {
        this.log.error({ err }, '[onebot] NapCat WebSocket 错误');
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(wsPort, () => {
        this.log.info({ port: wsPort, path: wsPath }, '[onebot] 反向 WS 服务端已启动，等待 NapCat 连接');
        resolve();
      });
      this.httpServer!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    this.log.info('[onebot] 正在停止 WS 服务端...');
    this.stopHeartbeatMonitor();
    this.rejectAllPending(new Error('Client stopped'));

    if (this.napcat) {
      this.napcat.close(1001, 'Server shutdown');
      this.napcat = null;
    }

    await new Promise<void>((resolve) => {
      this.wss?.close(() => {
        this.httpServer?.close(() => resolve());
      });
    });

    this.log.info('[onebot] WS 服务端已停止');
  }

  isConnected(): boolean {
    return this.napcat !== null && this.napcat.readyState === WebSocket.OPEN;
  }

  // ── 接收消息处理 ──────────────────────────────────────────────────────────

  private handleMessage(data: RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch (err) {
      this.log.warn({ err }, '[onebot] 收到无效 JSON 数据，忽略');
      return;
    }

    const obj = parsed as Record<string, unknown>;

    // 是否是 API 响应（有 echo 字段 + status 字段）
    if ('echo' in obj && 'status' in obj) {
      this.handleActionResponse(obj as unknown as OneBotActionResponse);
      return;
    }

    // 是事件
    const event = obj as OneBotEvent;
    this.log.debug({ post_type: event.post_type }, '[onebot] 收到事件');

    switch (event.post_type) {
      case 'message':
        this.emit('message', event as OneBotMessageEvent);
        break;

      case 'meta_event':
        this.lastHeartbeatAt = Date.now();
        this.log.debug({ meta_event_type: event.meta_event_type }, '[onebot] 心跳/元事件');
        break;

      case 'notice':
        this.log.debug({ notice_type: event.notice_type }, '[onebot] 通知事件（暂不处理）');
        break;

      case 'request':
        this.log.debug({ request_type: event.request_type }, '[onebot] 请求事件（暂不处理）');
        break;

      default:
        this.log.debug({ post_type: (event as Record<string, unknown>).post_type }, '[onebot] 未知事件类型，忽略');
    }
  }

  private handleActionResponse(resp: OneBotActionResponse): void {
    const pending = this.pendingCalls.get(resp.echo);
    if (!pending) {
      this.log.debug({ echo: resp.echo }, '[onebot] 收到未知 echo 的响应，忽略');
      return;
    }
    this.pendingCalls.delete(resp.echo);
    clearTimeout(pending.timer);
    pending.resolve(resp);
  }

  // ── 发送 API 调用 ─────────────────────────────────────────────────────────

  /**
   * 发送 OneBot API 调用，等待响应。
   * 超时（默认 10s）后 reject。
   */
  async sendAction<T = Record<string, unknown>>(
    action: string,
    params: T,
  ): Promise<OneBotActionResponse> {
    if (!this.isConnected()) {
      throw new Error('PLATFORM_DISCONNECTED: NapCat 未连接');
    }

    const echo = `${action}-${++this.echoCounter}-${Date.now()}`;
    const payload: OneBotAction<T> = { action, params, echo };

    return new Promise<OneBotActionResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(echo);
        reject(new Error(`PLATFORM_API_TIMEOUT: action=${action} 超时 ${this.config.apiTimeoutMs}ms`));
      }, this.config.apiTimeoutMs);

      this.pendingCalls.set(echo, { resolve, reject, timer });

      try {
        this.napcat!.send(JSON.stringify(payload));
        this.log.debug({ action, echo }, '[onebot] 已发送 API 调用');
      } catch (err) {
        this.pendingCalls.delete(echo);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  // ── 心跳监控 ─────────────────────────────────────────────────────────────

  private startHeartbeatMonitor(): void {
    this.stopHeartbeatMonitor();
    const { heartbeatTimeoutMs } = this.config;

    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeatAt;
      if (elapsed > heartbeatTimeoutMs) {
        this.log.warn(
          { elapsed, heartbeatTimeoutMs },
          '[onebot] 心跳超时，主动断开连接',
        );
        this.napcat?.close(1001, 'Heartbeat timeout');
      }
    }, Math.min(heartbeatTimeoutMs / 2, 30_000));
  }

  private stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [echo, pending] of this.pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pendingCalls.delete(echo);
    }
  }
}
