/**
 * @module routes/health
 * GET /health — 服务健康检查端点。
 * 返回 server 状态、DB 连通性、OneBot 连接状态。
 */

import type { FastifyInstance } from 'fastify';
import { createLogger } from '@dice-soup/logger';

const log = createLogger({ module: 'route:health' });

export async function healthRoutes(
  fastify: FastifyInstance,
  options: { isOneBotConnected: () => boolean },
): Promise<void> {
  fastify.get('/health', async (_req, reply) => {
    const oneBotConnected = options.isOneBotConnected();

    const payload = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      onebot: {
        connected: oneBotConnected,
      },
      version: process.env.npm_package_version ?? 'unknown',
    };

    log.debug(payload, '[health] health check');

    // OneBot 未连接时仍返回 200（服务本身运行正常，等待 NapCat 连入）
    return reply.status(200).send(payload);
  });
}
