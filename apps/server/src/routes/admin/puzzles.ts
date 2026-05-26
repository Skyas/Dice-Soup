/**
 * @module routes/admin/puzzles
 * 题库管理 API 路由。
 *
 * GET    /api/admin/puzzles           — 列表（分页 + 过滤）
 * GET    /api/admin/puzzles/:id       — 详情
 * POST   /api/admin/puzzles           — 新建
 * PUT    /api/admin/puzzles/:id       — 更新
 * POST   /api/admin/puzzles/:id/state — 切换状态
 * POST   /api/admin/puzzles/:id/extract — 触发 LLM metadata 提取
 */

import type { FastifyInstance } from 'fastify';
import { createLogger } from '@dice-soup/logger';
import { ErrorCodes } from '@dice-soup/shared-types';
import type { LLMRouter } from '@dice-soup/llm-router';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import type { SoupService } from '../../services/soup-service';
import { callExtractMetadata } from '../../modules/soup/soup-llm';

const log = createLogger({ module: 'route:admin/puzzles' });

interface AdminJwtPayload {
  sub: string;
}

export async function adminPuzzlesRoutes(
  fastify: FastifyInstance,
  options: { soupService: SoupService; llmRouter: LLMRouter },
): Promise<void> {
  const { soupService, llmRouter } = options;

  // GET /api/admin/puzzles
  fastify.get<{
    Querystring: { state?: string; difficulty?: string; page?: string; pageSize?: string };
  }>(
    '/api/admin/puzzles',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { state, difficulty, page = '1', pageSize = '20' } = request.query;
      const result = await soupService.listPuzzles({
        state,
        difficulty: difficulty ? parseInt(difficulty, 10) : undefined,
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
      });
      return reply.send(result);
    },
  );

  // GET /api/admin/puzzles/:id
  fastify.get<{ Params: { id: string } }>(
    '/api/admin/puzzles/:id',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const result = await soupService.getPuzzleById(request.params.id);
      if (!result.ok) return reply.status(404).send({ error: 'NOT_FOUND' });
      return reply.send(result.value);
    },
  );

  // POST /api/admin/puzzles
  fastify.post<{
    Body: {
      title: string;
      surface: string;
      truth: string;
      hints?: string[];
      difficulty: number;
      tags?: string[];
      expectedMinutes?: number;
      source?: string;
      sourceUrl?: string;
      keyPoints?: unknown[];
      sensitiveWords?: string[];
    };
  }>(
    '/api/admin/puzzles',
    {
      preHandler: adminAuthMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['title', 'surface', 'truth', 'difficulty'],
          properties: {
            title: { type: 'string' },
            surface: { type: 'string' },
            truth: { type: 'string' },
            hints: { type: 'array', items: { type: 'string' } },
            difficulty: { type: 'number', minimum: 1, maximum: 5 },
            tags: { type: 'array', items: { type: 'string' } },
            expectedMinutes: { type: 'number' },
            source: { type: 'string' },
            sourceUrl: { type: 'string' },
            keyPoints: { type: 'array' },
            sensitiveWords: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const user = (request as any).user as AdminJwtPayload;
      const body = request.body;

      const result = await soupService.createPuzzle(
        {
          title: body.title,
          surface: body.surface,
          truth: body.truth,
          hints: body.hints,
          difficulty: body.difficulty,
          tags: body.tags,
          expectedMinutes: body.expectedMinutes,
          source: body.source ?? 'admin_input',
          sourceUrl: body.sourceUrl,
        },
        user.sub,
      );

      if (!result.ok) {
        return reply.status(500).send({ error: result.error.code, message: result.error.message });
      }

      // 如果提供了 keyPoints/sensitiveWords，一并更新
      if (body.keyPoints || body.sensitiveWords) {
        await soupService.updatePuzzle(result.value.id, {
          keyPoints: body.keyPoints as any,
          sensitiveWords: body.sensitiveWords,
        });
      }

      log.info({ id: result.value.id, createdBy: user.sub }, '[puzzles] 题目创建');
      return reply.status(201).send(result.value);
    },
  );

  // PUT /api/admin/puzzles/:id
  fastify.put<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>(
    '/api/admin/puzzles/:id',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const result = await soupService.updatePuzzle(id, {
        title: body.title as string | undefined,
        surface: body.surface as string | undefined,
        truth: body.truth as string | undefined,
        hints: body.hints as string[] | undefined,
        difficulty: body.difficulty as number | undefined,
        tags: body.tags as string[] | undefined,
        expectedMinutes: body.expectedMinutes as number | undefined,
        keyPoints: body.keyPoints as any,
        sensitiveWords: body.sensitiveWords as string[] | undefined,
      });

      if (!result.ok) {
        const status = result.error.code === ErrorCodes.DB_NOT_FOUND ? 404 : 500;
        return reply.status(status).send({ error: result.error.code });
      }

      return reply.send(result.value);
    },
  );

  // POST /api/admin/puzzles/:id/state
  fastify.post<{
    Params: { id: string };
    Body: { state: string };
  }>(
    '/api/admin/puzzles/:id/state',
    {
      preHandler: adminAuthMiddleware,
      schema: {
        body: {
          type: 'object',
          required: ['state'],
          properties: { state: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { state } = request.body;

      const allowed = ['draft', 'active', 'archived', 'rejected'];
      if (!allowed.includes(state)) {
        return reply.status(400).send({ error: 'INVALID_STATE', message: `状态必须为 ${allowed.join('/')}` });
      }

      const result = await soupService.updatePuzzle(id, { state });
      if (!result.ok) {
        return reply.status(404).send({ error: 'NOT_FOUND' });
      }

      log.info({ id, state }, '[puzzles] 状态切换');
      return reply.send(result.value);
    },
  );

  // POST /api/admin/puzzles/:id/extract
  fastify.post<{ Params: { id: string } }>(
    '/api/admin/puzzles/:id/extract',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      const puzzleResult = await soupService.getPuzzleById(id);
      if (!puzzleResult.ok) {
        return reply.status(404).send({ error: 'NOT_FOUND' });
      }

      const puzzle = puzzleResult.value;
      log.info({ id }, '[puzzles] 触发 LLM metadata 提取');

      const extractResult = await callExtractMetadata(llmRouter, {
        title: puzzle.title,
        surface: puzzle.surface,
        truth: puzzle.truth,
        tags: puzzle.tags,
      });

      if (!extractResult.ok) {
        // 重试一次（K17.3）
        const retry = await callExtractMetadata(llmRouter, {
          title: puzzle.title,
          surface: puzzle.surface,
          truth: puzzle.truth,
          tags: puzzle.tags,
        });

        if (!retry.ok) {
          await soupService.updatePuzzle(id, { state: 'extraction_failed' });
          return reply.status(500).send({
            error: 'EXTRACTION_FAILED',
            message: 'LLM 提取失败，题目已标记为 extraction_failed',
          });
        }

        const updated = await soupService.updatePuzzle(id, {
          keyPoints: retry.value.key_points as any,
          sensitiveWords: retry.value.sensitive_words,
        });
        return reply.send(updated.ok ? updated.value : { error: 'UPDATE_FAILED' });
      }

      const updated = await soupService.updatePuzzle(id, {
        keyPoints: extractResult.value.key_points as any,
        sensitiveWords: extractResult.value.sensitive_words,
      });

      log.info({ id, kpCount: extractResult.value.key_points.length }, '[puzzles] metadata 提取成功');
      return reply.send(updated.ok ? updated.value : { error: 'UPDATE_FAILED' });
    },
  );
}
