/**
 * @module routes/admin/secrets
 * 机密配置 API 路由（category = 'secret'）。
 *
 * Provider API Key 管理：
 *   GET  /api/admin/secrets/provider-keys          — 列出所有 provider 的 key 状态（脱敏）
 *   PUT  /api/admin/secrets/provider-keys/:id      — 设置 provider API Key（加密存储）
 *   DELETE /api/admin/secrets/provider-keys/:id   — 删除 provider API Key
 *
 * OneBot Access Token 管理：
 *   GET  /api/admin/secrets/onebot-token           — 获取 token 状态（脱敏）
 *   PUT  /api/admin/secrets/onebot-token           — 设置 token（加密存储）
 */

import type { FastifyInstance } from 'fastify';
import { createLogger } from '@dice-soup/logger';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import type { ConfigService } from '../../config/config-service';
import type { AuditService } from '../../services/audit-service';
import { maskSecret } from '../../utils/crypto';

const log = createLogger({ module: 'route:admin/secrets' });

interface AdminJwtPayload {
  sub: string;
}

/** 将 provider API key 映射转成脱敏展示对象 */
function buildMaskedKeys(configService: ConfigService): Record<string, string> {
  const providers = configService.getOptional<Array<{ id: string }>>('llm.providers') ?? [];
  const result: Record<string, string> = {};
  for (const p of providers) {
    const key = configService.getProviderApiKey(p.id);
    result[p.id] = key ? maskSecret(key) : '';
  }
  return result;
}

export async function adminSecretsRoutes(
  fastify: FastifyInstance,
  options: { configService: ConfigService; auditService: AuditService },
): Promise<void> {
  const { configService, auditService } = options;

  // ── Provider API Keys ───────────────────────────────────────────

  // GET /api/admin/secrets/provider-keys  → { "deepseek": "sk-••••1234", ... }
  fastify.get('/api/admin/secrets/provider-keys', { preHandler: adminAuthMiddleware }, async (_req, reply) => {
    return reply.send({ keys: buildMaskedKeys(configService) });
  });

  // PUT /api/admin/secrets/provider-keys/:id  → { apiKey: "sk-..." }
  fastify.put<{
    Params: { id: string };
    Body: { apiKey: string };
  }>(
    '/api/admin/secrets/provider-keys/:id',
    {
      preHandler: adminAuthMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['apiKey'],
          properties: { apiKey: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { apiKey } = request.body;
      const user = (request as any).user as AdminJwtPayload;

      log.info({ providerId: id, updatedBy: user.sub }, '[secrets] 更新 Provider API Key');

      const result = await configService.setProviderApiKey(id, apiKey, user.sub);
      if (!result.ok) {
        return reply.status(400).send({ error: result.error.code, message: result.error.message });
      }

      await auditService.log({
        category: 'config_change',
        actor: user.sub,
        actorType: 'admin',
        action: 'secret.provider_key.update',
        target: `llm.provider_keys.${id}`,
        severity: 'warning',
        meta: { providerId: id },
      });

      return reply.send({ message: `Provider ${id} API Key 已更新`, masked: maskSecret(apiKey) });
    },
  );

  // DELETE /api/admin/secrets/provider-keys/:id
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/secrets/provider-keys/:id',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const user = (request as any).user as AdminJwtPayload;

      const result = await configService.deleteProviderApiKey(id, user.sub);
      if (!result.ok) {
        return reply.status(400).send({ error: result.error.code, message: result.error.message });
      }

      await auditService.log({
        category: 'config_change',
        actor: user.sub,
        actorType: 'admin',
        action: 'secret.provider_key.delete',
        target: `llm.provider_keys.${id}`,
        severity: 'warning',
        meta: { providerId: id },
      });

      return reply.send({ message: `Provider ${id} API Key 已删除` });
    },
  );

  // ── OneBot Access Token ─────────────────────────────────────────

  // GET /api/admin/secrets/onebot-token  → { masked: "ds_••••bc45", configured: true }
  fastify.get('/api/admin/secrets/onebot-token', { preHandler: adminAuthMiddleware }, async (_req, reply) => {
    const raw = configService.getDecrypted('onebot.access_token');
    // 如果 DB 中未配置，尝试读取 .env 回退（迁移兼容）
    const effective = raw || process.env.ONEBOT_ACCESS_TOKEN || '';
    return reply.send({
      configured: Boolean(effective),
      masked: effective ? maskSecret(effective) : '',
      source: raw ? 'db' : (process.env.ONEBOT_ACCESS_TOKEN ? 'env' : 'none'),
    });
  });

  // PUT /api/admin/secrets/onebot-token  → { token: "..." }
  fastify.put<{ Body: { token: string } }>(
    '/api/admin/secrets/onebot-token',
    {
      preHandler: adminAuthMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.body;
      const user = (request as any).user as AdminJwtPayload;

      const result = await configService.setEncrypted('onebot.access_token', token, user.sub);
      if (!result.ok) {
        return reply.status(400).send({ error: result.error.code, message: result.error.message });
      }

      await auditService.log({
        category: 'config_change',
        actor: user.sub,
        actorType: 'admin',
        action: 'secret.onebot_token.update',
        target: 'onebot.access_token',
        severity: 'warning',
        meta: {},
      });

      return reply.send({ message: 'OneBot Access Token 已更新', masked: maskSecret(token) });
    },
  );
}
