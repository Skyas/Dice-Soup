/**
 * @module routes/admin/game-logs
 * 游戏对局记录 API 路由。
 *
 * GET /api/admin/game-logs         — 分页列表 + 汇总统计
 * GET /api/admin/game-logs/:id     — 单场详情（含完整提问日志）
 */

import type { FastifyInstance } from 'fastify';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import { createLogger } from '@dice-soup/logger';
import { adminAuthMiddleware } from '../../middleware/admin-auth';
import type { DrizzleDB } from '../../db/client';
import { gameSessions, sessionMembers, soupPuzzles, soupPlayRecords } from '../../db/schema';

const log = createLogger({ module: 'route:admin/game-logs' });

interface QuestionLogEntry {
  qq: string;
  questionIndex: number;
  question?: string;
  verdict: string;
  matchedKeyPoints: string[];
  at: number;
}

interface RestoreLogEntry {
  qq: string;
  text: string;
  passed: boolean;
  coverage: number;
  missingCriticalIds: string[];
  at: number;
}

interface SoupSnapshot {
  phase?: string;
  currentPuzzleId?: string | null;
  playerNames?: Record<string, string>;
  startedAt?: number | null;
  contribution?: {
    questionLog?: QuestionLogEntry[];
    restoreLog?: RestoreLogEntry[];
  };
}

export async function adminGameLogsRoutes(
  fastify: FastifyInstance,
  options: { db: DrizzleDB },
): Promise<void> {
  const { db } = options;

  // GET /api/admin/game-logs
  fastify.get<{
    Querystring: { page?: string; pageSize?: string; state?: string };
  }>(
    '/api/admin/game-logs',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const pageSize = Math.min(50, parseInt(request.query.pageSize ?? '20', 10));
      const filterState = request.query.state; // 'ended' | 'aborted' | undefined

      try {
        // 只查海龟汤会话的已完成记录
        const stateFilter = filterState
          ? [filterState]
          : ['ended', 'aborted'];

        const rows = await db
          .select()
          .from(gameSessions)
          .where(
            and(
              eq(gameSessions.gameType, 'soup'),
              inArray(gameSessions.state, stateFilter),
            ),
          )
          .orderBy(desc(gameSessions.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize);

        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(gameSessions)
          .where(
            and(
              eq(gameSessions.gameType, 'soup'),
              inArray(gameSessions.state, stateFilter),
            ),
          );
        const total = countResult[0]?.count ?? 0;

        // 批量查询成员数
        const sessionIds = rows.map((r) => r.id);
        const memberCounts: Record<string, number> = {};
        if (sessionIds.length > 0) {
          const memberRows = await db
            .select({
              sessionId: sessionMembers.sessionId,
              cnt: sql<number>`count(*)`,
            })
            .from(sessionMembers)
            .where(inArray(sessionMembers.sessionId, sessionIds))
            .groupBy(sessionMembers.sessionId);
          for (const m of memberRows) {
            memberCounts[m.sessionId] = m.cnt;
          }
        }

        // 解析快照，获取 puzzleId 集合
        const puzzleIds = new Set<string>();
        const snapshotMap: Record<string, SoupSnapshot> = {};
        for (const row of rows) {
          try {
            const snap = JSON.parse(row.stateSnapshotJson) as SoupSnapshot;
            snapshotMap[row.id] = snap;
            if (snap.currentPuzzleId) puzzleIds.add(snap.currentPuzzleId);
          } catch {
            snapshotMap[row.id] = {};
          }
        }

        // 批量查题目标题
        const puzzleTitleMap: Record<string, string> = {};
        if (puzzleIds.size > 0) {
          const puzzleRows = await db
            .select({ id: soupPuzzles.id, title: soupPuzzles.title })
            .from(soupPuzzles)
            .where(inArray(soupPuzzles.id, [...puzzleIds]));
          for (const p of puzzleRows) {
            puzzleTitleMap[p.id] = p.title;
          }
        }

        // 汇总统计（全量，不受分页影响）
        const statsRows = await db
          .select({
            count: sql<number>`count(*)`,
            totalDurationSec: sql<number>`sum(coalesce(${gameSessions.endedAt}, ${gameSessions.lastActivityAt}) - coalesce(${gameSessions.startedAt}, ${gameSessions.createdAt}))`,
          })
          .from(gameSessions)
          .where(
            and(
              eq(gameSessions.gameType, 'soup'),
              inArray(gameSessions.state, ['ended', 'aborted']),
            ),
          );

        const monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
        const monthRows = await db
          .select({ count: sql<number>`count(*)` })
          .from(gameSessions)
          .where(
            and(
              eq(gameSessions.gameType, 'soup'),
              inArray(gameSessions.state, ['ended', 'aborted']),
              sql`${gameSessions.createdAt} >= ${monthStart}`,
            ),
          );

        const totalSessions = statsRows[0]?.count ?? 0;
        const totalDuration = statsRows[0]?.totalDurationSec ?? 0;
        const avgDurationMinutes = totalSessions > 0
          ? Math.round(totalDuration / totalSessions / 60)
          : 0;

        // 组装返回列表
        const items = rows.map((row) => {
          const snap = snapshotMap[row.id] ?? {};
          const questionLog = snap.contribution?.questionLog ?? [];
          const questionCount = questionLog.length;
          const playerNames = snap.playerNames ?? {};
          const puzzleId = snap.currentPuzzleId ?? null;
          const durationSec = row.endedAt && row.startedAt
            ? row.endedAt - row.startedAt
            : null;

          return {
            id: row.id,
            puzzleId,
            puzzleTitle: puzzleId ? (puzzleTitleMap[puzzleId] ?? '未知题目') : '（无题）',
            gameType: row.gameType,
            state: row.state,
            endReason: row.endReason,
            createdAt: row.createdAt,
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            durationSeconds: durationSec,
            playerCount: memberCounts[row.id] ?? 0,
            playerNames: Object.values(playerNames).slice(0, 5),
            questionCount,
          };
        });

        return reply.send({
          items,
          total,
          stats: {
            totalSessions,
            thisMonth: monthRows[0]?.count ?? 0,
            avgDurationMinutes,
          },
        });
      } catch (e) {
        log.error({ err: e }, '[game-logs] 列表查询失败');
        return reply.status(500).send({ error: 'INTERNAL_ERROR', message: '查询失败' });
      }
    },
  );

  // GET /api/admin/game-logs/:id
  fastify.get<{ Params: { id: string } }>(
    '/api/admin/game-logs/:id',
    { preHandler: adminAuthMiddleware },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const rows = await db
          .select()
          .from(gameSessions)
          .where(eq(gameSessions.id, id))
          .limit(1);

        if (!rows[0]) {
          return reply.status(404).send({ error: 'NOT_FOUND', message: '会话不存在' });
        }

        const session = rows[0];
        let snap: SoupSnapshot = {};
        try {
          snap = JSON.parse(session.stateSnapshotJson) as SoupSnapshot;
        } catch {
          // ignore parse error
        }

        // 查询题目信息
        let puzzle: { title: string; surface: string; truth: string; difficulty: number; tags: string } | null = null;
        if (snap.currentPuzzleId) {
          const pRows = await db
            .select({
              title: soupPuzzles.title,
              surface: soupPuzzles.surface,
              truth: soupPuzzles.truth,
              difficulty: soupPuzzles.difficulty,
              tagsJson: soupPuzzles.tagsJson,
            })
            .from(soupPuzzles)
            .where(eq(soupPuzzles.id, snap.currentPuzzleId))
            .limit(1);
          if (pRows[0]) {
            puzzle = {
              title: pRows[0].title,
              surface: pRows[0].surface,
              truth: pRows[0].truth,
              difficulty: pRows[0].difficulty,
              tags: pRows[0].tagsJson,
            };
          }
        }

        // 查询玩家战绩
        const playRecords = await db
          .select()
          .from(soupPlayRecords)
          .where(eq(soupPlayRecords.sessionId, id));

        // 查询成员列表
        const members = await db
          .select()
          .from(sessionMembers)
          .where(eq(sessionMembers.sessionId, id));

        const playerNames = snap.playerNames ?? {};

        const playerScores = playRecords.map((r) => ({
          qq: r.userQq,
          displayName: playerNames[r.userQq] ?? r.userQq,
          result: r.result,
          contributionScore: r.contributionScore != null ? r.contributionScore / 100 : null,
          breakthroughCount: r.breakthroughCount,
          questionsAsked: r.questionsAsked,
        }));

        return reply.send({
          id: session.id,
          gameType: session.gameType,
          state: session.state,
          endReason: session.endReason,
          createdAt: session.createdAt,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          durationSeconds: session.endedAt && session.startedAt
            ? session.endedAt - session.startedAt
            : null,
          puzzleId: snap.currentPuzzleId ?? null,
          puzzle,
          questionLog: snap.contribution?.questionLog ?? [],
          restoreLog: snap.contribution?.restoreLog ?? [],
          playerNames,
          playerScores,
          memberCount: members.length,
        });
      } catch (e) {
        log.error({ err: e, sessionId: id }, '[game-logs] 详情查询失败');
        return reply.status(500).send({ error: 'INTERNAL_ERROR', message: '查询失败' });
      }
    },
  );
}
