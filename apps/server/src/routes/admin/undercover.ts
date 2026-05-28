/**
 * @module routes/admin/undercover
 * 谁是卧底管理 API 路由。
 *
 * GET    /api/admin/undercover/stats           — 统计信息
 * GET    /api/admin/undercover/words           — 词库列表（分页 + 过滤）
 * POST   /api/admin/undercover/words           — 新建词对
 * PUT    /api/admin/undercover/words/:id       — 编辑词对
 * POST   /api/admin/undercover/words/:id/state — 切换状态
 * GET    /api/admin/undercover/records         — 游玩记录（分页）
 */

import type { FastifyInstance } from 'fastify';
import { createLogger } from '@dice-soup/logger';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import type { UndercoverService } from '../../services/undercover-service';

const log = createLogger({ module: 'route:admin/undercover' });

interface AdminJwtPayload { sub: string }

export async function adminUndercoverRoutes(
  fastify: FastifyInstance,
  options: { undercoverService: UndercoverService },
): Promise<void> {
  const { undercoverService } = options;

  // GET /api/admin/undercover/stats
  fastify.get(
    '/api/admin/undercover/stats',
    { preHandler: adminAuthMiddleware },
    async (_req, reply) => {
      const stats = await undercoverService.getStats();
      return reply.send(stats);
    },
  );

  // GET /api/admin/undercover/words
  fastify.get<{
    Querystring: { state?: string; category?: string; difficulty?: string; page?: string; pageSize?: string };
  }>(
    '/api/admin/undercover/words',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { state, category, difficulty, page = '1', pageSize = '20' } = request.query;
      const result = await undercoverService.listWordPairs({
        state,
        category,
        difficulty,
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
      });
      return reply.send(result);
    },
  );

  // POST /api/admin/undercover/words
  fastify.post<{
    Body: {
      normalWord: string;
      undercoverWord: string;
      category: string;
      difficulty: 'easy' | 'medium' | 'hard';
    };
  }>(
    '/api/admin/undercover/words',
    {
      preHandler: adminAuthMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['normalWord', 'undercoverWord', 'category', 'difficulty'],
          properties: {
            normalWord:     { type: 'string' },
            undercoverWord: { type: 'string' },
            category:       { type: 'string' },
            difficulty:     { type: 'string', enum: ['easy', 'medium', 'hard'] },
          },
        },
      },
    },
    async (request, reply) => {
      const user = (request as any).user as AdminJwtPayload;
      const { normalWord, undercoverWord, category, difficulty } = request.body;

      const id = await undercoverService.createWordPair({
        normalWord,
        undercoverWord,
        category,
        difficulty,
        source: 'admin_input',
        createdBy: user.sub,
      });

      const created = await undercoverService.getWordPairById(id);
      log.info({ id, createdBy: user.sub }, '[undercover] 词对创建');
      return reply.status(201).send(created);
    },
  );

  // PUT /api/admin/undercover/words/:id
  fastify.put<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>(
    '/api/admin/undercover/words/:id',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const existing = await undercoverService.getWordPairById(id);
      if (!existing) return reply.status(404).send({ error: 'NOT_FOUND' });

      await undercoverService.updateWordPair(id, {
        normalWord:     body.normalWord as string | undefined,
        undercoverWord: body.undercoverWord as string | undefined,
        category:       body.category as string | undefined,
        difficulty:     body.difficulty as string | undefined,
      });

      const updated = await undercoverService.getWordPairById(id);
      return reply.send(updated);
    },
  );

  // POST /api/admin/undercover/words/:id/state
  fastify.post<{
    Params: { id: string };
    Body: { state: string };
  }>(
    '/api/admin/undercover/words/:id/state',
    {
      preHandler: adminAuthMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['state'],
          properties: { state: { type: 'string', enum: ['active', 'inactive'] } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { state } = request.body;

      const existing = await undercoverService.getWordPairById(id);
      if (!existing) return reply.status(404).send({ error: 'NOT_FOUND' });

      await undercoverService.updateWordPair(id, { state });
      const updated = await undercoverService.getWordPairById(id);
      log.info({ id, state }, '[undercover] 词对状态切换');
      return reply.send(updated);
    },
  );

  // GET /api/admin/undercover/records
  fastify.get<{
    Querystring: { page?: string; pageSize?: string; role?: string; result?: string };
  }>(
    '/api/admin/undercover/records',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { page = '1', pageSize = '30', role, result } = request.query;
      const [data, stats] = await Promise.all([
        undercoverService.listPlayRecords({
          page: parseInt(page, 10),
          pageSize: parseInt(pageSize, 10),
          role,
          result,
        }),
        undercoverService.getRecordStats(),
      ]);
      // map playedAt → createdAt for frontend consistency
      const items = data.items.map((r) => ({
        ...r,
        playerQQ: r.userQq,
        createdAt: r.playedAt,
      }));
      return reply.send({ items, total: data.total, stats });
    },
  );
}
