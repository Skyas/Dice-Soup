/**
 * @module middleware/admin-auth
 * 管理员身份验证中间件（JWT）。
 * 保护 /api/admin/* 路由。
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '@dice-soup/logger';

const log = createLogger({ module: 'middleware:admin-auth' });

export async function adminAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // @fastify/jwt 在 fastify 实例上挂载 jwtVerify
    await request.jwtVerify();
  } catch (err) {
    log.warn({ err, url: request.url }, '[admin-auth] JWT 验证失败');
    return reply.status(401).send({ error: 'Unauthorized', message: 'JWT 验证失败或已过期' });
  }
}
