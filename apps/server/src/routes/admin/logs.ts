/**
 * @module routes/admin/logs
 * Log Viewer WebSocket 端点。（§5.3、规则 13）
 *
 * GET /api/admin/logs/stream  — WS 升级，实时推送结构化 Pino 日志
 *
 * 协议：
 *   - 连接建立后，服务端先推送最近 200 条历史日志（环形缓冲）
 *   - 此后实时广播新日志（JSON 字符串）
 *   - 客户端可发送 JSON filter：{ level?, module?, keyword? } 进行服务端过滤
 *   - 超出 500 条/秒自动聚合（由 LogBroadcaster 控制）
 */

import type { FastifyInstance } from 'fastify';
import { logBroadcaster } from '@dice-soup/logger';
import { createLogger } from '@dice-soup/logger';
import { adminAuthMiddleware } from '../../middleware/admin-auth';

const log = createLogger({ module: 'route:admin/logs' });

export async function adminLogsRoutes(fastify: FastifyInstance): Promise<void> {
  // WS 端点：需要 JWT 验证（通过 query param token 传递，WS 无法设置 header）
  fastify.get('/api/admin/logs/stream', { websocket: true }, async (socket, request) => {
    // WS 场景下通过 query token 验证
    const query = request.query as { token?: string };
    if (query.token) {
      try {
        (request as any).jwtVerify = () => {};
        (fastify as any).jwt.verify(query.token);
      } catch {
        log.warn('[logs/ws] WS JWT 验证失败，断开连接');
        socket.close(1008, 'Unauthorized');
        return;
      }
    } else {
      socket.close(1008, 'Unauthorized');
      return;
    }

    log.info('[logs/ws] Log Viewer 客户端已连接');

    // 向 LogBroadcaster 注册此 WS 连接
    const unsubscribe = logBroadcaster.subscribe(socket);

    socket.on('message', (raw: Buffer) => {
      // 客户端可发送过滤条件（未来扩展，Phase 1 暂时忽略客户端消息）
      try {
        const msg = JSON.parse(raw.toString());
        log.debug({ msg }, '[logs/ws] 客户端消息（暂未处理）');
      } catch {
        // 忽略非 JSON 消息
      }
    });

    socket.on('close', () => {
      log.info('[logs/ws] Log Viewer 客户端已断开');
      unsubscribe();
    });

    socket.on('error', (err: Error) => {
      log.warn({ err }, '[logs/ws] WS 连接错误');
      unsubscribe();
    });
  });

  // HTTP 端点：获取最近 N 条日志（用于页面初始加载）
  fastify.get<{ Querystring: { limit?: string } }>(
    '/api/admin/logs/recent',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const limit = Math.min(parseInt(request.query.limit ?? '200', 10), 1000);
      const recent = logBroadcaster.getRecentLogs(limit);
      return reply.send({ logs: recent, total: recent.length });
    },
  );
}
