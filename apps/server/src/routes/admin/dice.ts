/**
 * @module routes/admin/dice
 * 骰子调试 API 路由。
 *
 * POST /api/admin/dice/roll  — 执行骰子表达式，返回结果（供 WebUI 测试）
 */

import type { FastifyInstance } from 'fastify';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import { DiceEngine, formatRollResult } from '@dice-soup/dice-engine';
import { createLogger } from '@dice-soup/logger';

const log = createLogger({ module: 'route:admin/dice' });
const engine = new DiceEngine();

export async function adminDiceRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/admin/dice/roll
  fastify.post<{ Body: { expr: string } }>(
    '/api/admin/dice/roll',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { expr } = request.body ?? {};
      if (!expr || typeof expr !== 'string' || !expr.trim()) {
        return reply.status(400).send({ error: 'BAD_REQUEST', message: '骰子表达式不能为空' });
      }

      log.info({ expr }, '[dice-api] roll');
      const result = engine.roll(expr.trim());

      if (!result.ok) {
        return reply.status(422).send({
          error: 'INVALID_EXPR',
          message: result.error.message,
          code: result.error.code,
        });
      }

      const formatted = formatRollResult(result.value, expr.trim());
      return reply.send({
        expr: expr.trim(),
        total: result.value.total,
        formatted,
      });
    },
  );
}
