/**
 * @module routes/admin/auth
 * 管理员认证路由。
 *
 * POST /api/admin/auth/login         — 登录，返回 JWT
 * POST /api/admin/auth/logout        — 登出（前端清除 token）
 * POST /api/admin/auth/change-password — 修改密码
 */

import type { FastifyInstance } from 'fastify';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createLogger } from '@dice-soup/logger';
import { getDatabase } from '../../db/client';
import { admins } from '../../db/schema';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import type { AuditService } from '../../services/audit-service';

const log = createLogger({ module: 'route:admin/auth' });

// JWT payload 类型
interface AdminJwtPayload {
  sub: string;          // username
  displayName: string;
  mustChangePw: boolean;
  iat?: number;
  exp?: number;
}

export async function adminAuthRoutes(
  fastify: FastifyInstance,
  options: { auditService: AuditService },
): Promise<void> {
  const { auditService } = options;
  const db = getDatabase();

  // ── POST /api/admin/auth/login ───────────────────────────────────────────

  fastify.post<{
    Body: { username: string; password: string };
  }>('/api/admin/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 32 },
          password: { type: 'string', minLength: 1, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;

    log.info({ username }, '[auth] 登录尝试');

    const admin = await db.select().from(admins).where(eq(admins.username, username)).get();

    if (!admin) {
      log.warn({ username }, '[auth] 用户不存在');
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: '用户名或密码错误' });
    }

    if (admin.disabled) {
      log.warn({ username }, '[auth] 账号已禁用');
      return reply.status(403).send({ error: 'ACCOUNT_DISABLED', message: '账号已被禁用' });
    }

    const passwordMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatch) {
      log.warn({ username }, '[auth] 密码错误');
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: '用户名或密码错误' });
    }

    // 更新最后登录时间
    await db.update(admins).set({ lastLoginAt: Date.now() }).where(eq(admins.username, username));

    // 签发 JWT（24h 有效期）
    const payload: AdminJwtPayload = {
      sub: admin.username,
      displayName: admin.displayName,
      mustChangePw: admin.mustChangePw === 1,
    };
    const token = (fastify as any).jwt.sign(payload, { expiresIn: '24h' });

    await auditService.log({
      category: 'admin_op',
      actor: username,
      actorType: 'admin',
      action: 'admin.login',
      severity: 'info',
    });

    log.info({ username }, '[auth] 登录成功');

    return reply.send({
      token,
      username: admin.username,
      displayName: admin.displayName,
      mustChangePw: admin.mustChangePw === 1,
    });
  });

  // ── POST /api/admin/auth/logout ──────────────────────────────────────────
  // JWT 无状态，登出由前端清除 token；此端点仅用于审计记录

  fastify.post('/api/admin/auth/logout', {
    preHandler: adminAuthMiddleware,
  }, async (request, reply) => {
    const user = (request as any).user as AdminJwtPayload;
    log.info({ username: user.sub }, '[auth] 登出');

    await auditService.log({
      category: 'admin_op',
      actor: user.sub,
      actorType: 'admin',
      action: 'admin.logout',
      severity: 'info',
    });

    return reply.send({ message: '已登出' });
  });

  // ── POST /api/admin/auth/change-password ─────────────────────────────────

  fastify.post<{
    Body: { currentPassword: string; newPassword: string };
  }>('/api/admin/auth/change-password', {
    preHandler: adminAuthMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
  }, async (request, reply) => {
    const user = (request as any).user as AdminJwtPayload;
    const { currentPassword, newPassword } = request.body;

    const admin = await db.select().from(admins).where(eq(admins.username, user.sub)).get();
    if (!admin) {
      return reply.status(404).send({ error: 'NOT_FOUND' });
    }

    const match = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!match) {
      return reply.status(401).send({ error: 'INVALID_CURRENT_PASSWORD', message: '当前密码错误' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await db
      .update(admins)
      .set({ passwordHash: newHash, mustChangePw: 0 })
      .where(eq(admins.username, user.sub));

    await auditService.log({
      category: 'admin_op',
      actor: user.sub,
      actorType: 'admin',
      action: 'admin.change_password',
      severity: 'info',
    });

    log.info({ username: user.sub }, '[auth] 密码修改成功');
    return reply.send({ message: '密码修改成功' });
  });
}
