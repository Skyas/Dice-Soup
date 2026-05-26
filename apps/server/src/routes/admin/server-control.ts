/**
 * @module routes/admin/server-control
 * 服务器控制 API 路由。
 *
 * POST /api/admin/server/restart  — 优雅重启服务器进程
 *   需要管理员 JWT，响应后延迟 1.5 秒退出（由进程管理器 / tsx watch 自动重启）。
 */

import type { FastifyInstance } from 'fastify';
import { createLogger } from '@dice-soup/logger';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import type { AuditService } from '../../services/audit-service';

const log = createLogger({ module: 'route:admin/server-control' });

const RESTART_DELAY_MS = 1500;

interface AdminJwtPayload {
  sub: string;
}

export async function adminServerControlRoutes(
  fastify: FastifyInstance,
  options: { auditService: AuditService },
): Promise<void> {
  const { auditService } = options;

  // POST /api/admin/server/restart
  fastify.post<{ Body: { reason?: string } }>(
    '/api/admin/server/restart',
    {
      preHandler: adminAuthMiddleware,
      schema: {
        body: {
          type: 'object',
          properties: { reason: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const user = (request as any).user as AdminJwtPayload;
      const reason = request.body?.reason ?? '管理员手动重启';

      log.warn({ triggeredBy: user.sub, reason }, '[server-control] 收到重启指令');

      await auditService.log({
        category: 'admin_op',
        actor: user.sub,
        actorType: 'admin',
        action: 'server.restart',
        target: 'process',
        severity: 'warning',
        meta: { reason },
      });

      // 立即响应，避免客户端超时
      reply.send({
        message: '服务器正在重启，请稍候...',
        delayMs: RESTART_DELAY_MS,
      });

      // 延迟退出，进程管理器（tsx watch / pm2 / systemd）会自动重启
      setTimeout(() => {
        log.info('[server-control] 进程退出，等待重启...');
        process.exit(0);
      }, RESTART_DELAY_MS);
    },
  );
}
