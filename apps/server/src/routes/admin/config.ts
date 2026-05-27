/**
 * @module routes/admin/config
 * 配置中心 API 路由。（§5.2、规则 14）
 *
 * GET  /api/admin/config           — 列出所有配置项
 * GET  /api/admin/config/:key      — 获取单个配置项
 * PUT  /api/admin/config/:key      — 更新配置项（热更新）
 */

import type { FastifyInstance } from 'fastify';
import { createLogger } from '@dice-soup/logger';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import type { ConfigService } from '../../config/config-service';
import type { AuditService } from '../../services/audit-service';
import {
  DEFAULT_JUDGE_INSTRUCTIONS,
  DEFAULT_RESTORE_INSTRUCTIONS,
  DEFAULT_EXTRACT_METADATA_INSTRUCTIONS,
  DEFAULT_SUMMARY_INSTRUCTIONS,
} from '../../modules/soup/soup-llm';

const log = createLogger({ module: 'route:admin/config' });

interface AdminJwtPayload {
  sub: string;
}

export async function adminConfigRoutes(
  fastify: FastifyInstance,
  options: { configService: ConfigService; auditService: AuditService },
): Promise<void> {
  const { configService, auditService } = options;

  // GET /api/admin/config
  fastify.get('/api/admin/config', { preHandler: adminAuthMiddleware }, async (_req, reply) => {
    const items = configService.getAllItems();
    return reply.send({ items });
  });

  // GET /api/admin/config/prompt-defaults
  // 返回代码内置的 Prompt 默认值（不受 DB 影响），供 WebUI「恢复默认」使用。
  fastify.get('/api/admin/config/prompt-defaults', { preHandler: adminAuthMiddleware }, async (_req, reply) => {
    return reply.send({
      'soup.prompt.judge': DEFAULT_JUDGE_INSTRUCTIONS,
      'soup.prompt.restore': DEFAULT_RESTORE_INSTRUCTIONS,
      'soup.prompt.extract_metadata': DEFAULT_EXTRACT_METADATA_INSTRUCTIONS,
      'soup.prompt.summary': DEFAULT_SUMMARY_INSTRUCTIONS,
    });
  });

  // GET /api/admin/config/:key
  fastify.get<{ Params: { key: string } }>(
    '/api/admin/config/:key',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { key } = request.params;
      const item = configService.getItem(key);
      if (!item) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: `配置项 ${key} 不存在` });
      }
      return reply.send(item);
    },
  );

  // PUT /api/admin/config/:key
  fastify.put<{
    Params: { key: string };
    Body: { value: unknown };
  }>(
    '/api/admin/config/:key',
    {
      preHandler: adminAuthMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['value'],
          properties: {
            value: {},
          },
        },
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      const { value } = request.body;
      const user = (request as any).user as AdminJwtPayload;

      log.info({ key, updatedBy: user.sub }, '[config] 更新配置项');

      const result = await configService.set(key, value, user.sub);
      if (!result.ok) {
        return reply.status(400).send({ error: result.error.code, message: result.error.message });
      }

      await auditService.log({
        category: 'config_change',
        actor: user.sub,
        actorType: 'admin',
        action: 'config.update',
        target: key,
        severity: 'info',
        meta: { new_value: value },
      });

      return reply.send({ message: `配置项 ${key} 已更新`, key, value });
    },
  );
}
