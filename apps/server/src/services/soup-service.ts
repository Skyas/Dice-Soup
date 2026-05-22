/**
 * @module services/soup-service
 * 海龟汤题库服务：题目 CRUD、选题算法、metadata 提取触发。
 */

import { eq, and, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createLogger } from '@dice-soup/logger';
import { ok, err, type Result, type AppError, createError, ErrorCodes } from '@dice-soup/shared-types';
import type { DrizzleDB } from '../db/client';
import { soupPuzzles, soupPlayRecords, type SoupPuzzle, type NewSoupPuzzle } from '../db/schema';

const log = createLogger({ module: 'soup-service' });

// ── 领域类型 ───────────────────────────────────────────────────────────────────

export interface KeyPoint {
  id: string;
  description: string;
  keywords: string[];
  critical: boolean;
  weight: number;
}

export interface SoupPuzzleData {
  id: string;
  title: string;
  surface: string;
  truth: string;
  hints: string[];
  difficulty: number;
  tags: string[];
  expectedMinutes: number | null;
  keyPoints: KeyPoint[];
  sensitiveWords: string[];
  metadataExtractedAt: number | null;
  metadataVersion: number;
  source: string;
  sourceUrl: string | null;
  state: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  playCount: number;
  winRate: number | null;
  giveupRate: number | null;
}

export interface CreatePuzzleInput {
  title: string;
  surface: string;
  truth: string;
  hints?: string[];
  difficulty: number;
  tags?: string[];
  expectedMinutes?: number;
  source?: string;
  sourceUrl?: string;
  createdBy?: string;
}

export interface UpdatePuzzleInput {
  title?: string;
  surface?: string;
  truth?: string;
  hints?: string[];
  difficulty?: number;
  tags?: string[];
  expectedMinutes?: number;
  keyPoints?: KeyPoint[];
  sensitiveWords?: string[];
  state?: string;
}

export interface SelectPuzzleOptions {
  difficulty?: number;
  tags?: string[];
  excludePuzzleIds?: string[];
}

// ── SoupService ───────────────────────────────────────────────────────────────

export class SoupService {
  constructor(private readonly db: DrizzleDB) {}

  // ── 题目创建 ────────────────────────────────────────────────────────────────

  async createPuzzle(
    input: CreatePuzzleInput,
    createdBy?: string,
  ): Promise<Result<SoupPuzzleData, AppError>> {
    const now = Math.floor(Date.now() / 1000);
    const id = ulid();

    try {
      await this.db.insert(soupPuzzles).values({
        id,
        title: input.title,
        surface: input.surface,
        truth: input.truth,
        hintsJson: JSON.stringify(input.hints ?? []),
        difficulty: input.difficulty,
        tagsJson: JSON.stringify(input.tags ?? []),
        expectedMinutes: input.expectedMinutes ?? null,
        source: input.source ?? 'admin_input',
        sourceUrl: input.sourceUrl ?? null,
        createdBy: createdBy ?? null,
        createdAt: now,
        updatedAt: now,
        state: 'draft',
      });

      log.info({ id, title: input.title }, '[soup-service] 题目创建成功');
      const puzzle = await this.getPuzzleById(id);
      return puzzle;
    } catch (e) {
      log.error({ err: e }, '[soup-service] 题目创建失败');
      return err(createError(ErrorCodes.INTERNAL_ERROR, '题目创建失败', {}, e));
    }
  }

  // ── 题目查询 ────────────────────────────────────────────────────────────────

  async getPuzzleById(id: string): Promise<Result<SoupPuzzleData, AppError>> {
    const row = await this.db.select().from(soupPuzzles).where(eq(soupPuzzles.id, id)).limit(1);
    if (!row[0]) {
      return err(createError(ErrorCodes.DB_NOT_FOUND, `题目 ${id} 不存在`));
    }
    return ok(this.rowToData(row[0]));
  }

  async listPuzzles(options?: {
    state?: string;
    difficulty?: number;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: SoupPuzzleData[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    let query = this.db.select().from(soupPuzzles);
    const conditions = [];

    if (options?.state) {
      conditions.push(eq(soupPuzzles.state, options.state));
    }
    if (options?.difficulty) {
      conditions.push(eq(soupPuzzles.difficulty, options.difficulty));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const rows = await query.limit(pageSize).offset(offset);
    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(soupPuzzles)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      items: rows.map((r) => this.rowToData(r)),
      total: countResult[0]?.count ?? 0,
    };
  }

  // ── 题目更新 ────────────────────────────────────────────────────────────────

  async updatePuzzle(
    id: string,
    input: UpdatePuzzleInput,
  ): Promise<Result<SoupPuzzleData, AppError>> {
    const now = Math.floor(Date.now() / 1000);
    const updateData: Partial<NewSoupPuzzle> = { updatedAt: now };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.surface !== undefined) updateData.surface = input.surface;
    if (input.truth !== undefined) updateData.truth = input.truth;
    if (input.hints !== undefined) updateData.hintsJson = JSON.stringify(input.hints);
    if (input.difficulty !== undefined) updateData.difficulty = input.difficulty;
    if (input.tags !== undefined) updateData.tagsJson = JSON.stringify(input.tags);
    if (input.expectedMinutes !== undefined) updateData.expectedMinutes = input.expectedMinutes;
    if (input.keyPoints !== undefined) {
      updateData.keyPointsJson = JSON.stringify(input.keyPoints);
      updateData.metadataVersion = sql`${soupPuzzles.metadataVersion} + 1` as any;
      updateData.metadataExtractedAt = now;
    }
    if (input.sensitiveWords !== undefined) {
      updateData.sensitiveWordsJson = JSON.stringify(input.sensitiveWords);
    }
    if (input.state !== undefined) updateData.state = input.state;

    try {
      await this.db.update(soupPuzzles).set(updateData).where(eq(soupPuzzles.id, id));
      log.info({ id }, '[soup-service] 题目更新成功');
      return await this.getPuzzleById(id);
    } catch (e) {
      log.error({ err: e, id }, '[soup-service] 题目更新失败');
      return err(createError(ErrorCodes.INTERNAL_ERROR, '题目更新失败', {}, e));
    }
  }

  // ── 状态切换 ────────────────────────────────────────────────────────────────

  async setActive(id: string): Promise<Result<SoupPuzzleData, AppError>> {
    return this.updatePuzzle(id, { state: 'active' });
  }

  async setArchived(id: string): Promise<Result<SoupPuzzleData, AppError>> {
    return this.updatePuzzle(id, { state: 'archived' });
  }

  // ── 选题算法（K20） ─────────────────────────────────────────────────────────

  /**
   * 按过滤条件选一道题，排除已玩过的。
   * 降级链：tags过滤 → 放宽tags → 放宽difficulty → 空
   */
  async selectPuzzle(options: SelectPuzzleOptions): Promise<Result<SoupPuzzleData, AppError>> {
    const { difficulty, tags = [], excludePuzzleIds = [] } = options;

    // 尝试带所有 filter 选题
    let puzzle = await this.trySelect({ difficulty, tags, excludePuzzleIds });
    if (puzzle) return ok(puzzle);

    // 放宽 tags
    if (tags.length > 0) {
      puzzle = await this.trySelect({ difficulty, tags: [], excludePuzzleIds });
      if (puzzle) return ok(puzzle);
    }

    // 放宽 difficulty
    if (difficulty) {
      puzzle = await this.trySelect({ difficulty: undefined, tags: [], excludePuzzleIds });
      if (puzzle) return ok(puzzle);
    }

    return err(createError(ErrorCodes.DB_NOT_FOUND, '题库已无新题，建议投稿补充'));
  }

  private async trySelect(options: {
    difficulty?: number;
    tags: string[];
    excludePuzzleIds: string[];
  }): Promise<SoupPuzzleData | null> {
    const conditions: ReturnType<typeof eq>[] = [eq(soupPuzzles.state, 'active')];

    if (options.difficulty) {
      conditions.push(eq(soupPuzzles.difficulty, options.difficulty));
    }

    let query = this.db
      .select()
      .from(soupPuzzles)
      .where(and(...conditions))
      .orderBy(sql`RANDOM()`);

    const rows = await query.limit(50);

    // 排除已玩
    const candidates = options.excludePuzzleIds.length > 0
      ? rows.filter((r) => !options.excludePuzzleIds.includes(r.id))
      : rows;

    // 简单标签过滤（在内存中）
    const filtered = options.tags.length > 0
      ? candidates.filter((r) => {
          const puzzleTags: string[] = JSON.parse(r.tagsJson);
          return options.tags.every((t) => puzzleTags.includes(t));
        })
      : candidates;

    if (filtered.length === 0) return null;
    // 随机选一道
    const picked = filtered[Math.floor(Math.random() * filtered.length)];
    return this.rowToData(picked);
  }

  // ── 玩家已玩题目查询 ────────────────────────────────────────────────────────

  async getPlayedPuzzleIds(userQq: string): Promise<string[]> {
    const records = await this.db
      .select({ puzzleId: soupPlayRecords.puzzleId })
      .from(soupPlayRecords)
      .where(eq(soupPlayRecords.userQq, userQq));
    return records.map((r) => r.puzzleId);
  }

  // ── 统计更新 ────────────────────────────────────────────────────────────────

  async incrementPlayCount(puzzleId: string): Promise<void> {
    await this.db
      .update(soupPuzzles)
      .set({ playCount: sql`${soupPuzzles.playCount} + 1` })
      .where(eq(soupPuzzles.id, puzzleId));
  }

  async savePlayRecord(record: {
    userQq: string;
    puzzleId: string;
    sessionId: string;
    result: string;
    contributionScore: number;
    breakthroughCount: number;
    questionsAsked: number;
    joinedAt: number;
  }): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.insert(soupPlayRecords).values({
      id: ulid(),
      userQq: record.userQq,
      puzzleId: record.puzzleId,
      sessionId: record.sessionId,
      playedAt: now,
      endedAt: now,
      result: record.result,
      contributionScore: Math.round(record.contributionScore * 100),
      breakthroughCount: record.breakthroughCount,
      questionsAsked: record.questionsAsked,
      joinedAt: record.joinedAt,
    });
  }

  // ── 内部工具 ────────────────────────────────────────────────────────────────

  private rowToData(row: SoupPuzzle): SoupPuzzleData {
    return {
      id: row.id,
      title: row.title,
      surface: row.surface,
      truth: row.truth,
      hints: JSON.parse(row.hintsJson),
      difficulty: row.difficulty,
      tags: JSON.parse(row.tagsJson),
      expectedMinutes: row.expectedMinutes ?? null,
      keyPoints: JSON.parse(row.keyPointsJson),
      sensitiveWords: JSON.parse(row.sensitiveWordsJson),
      metadataExtractedAt: row.metadataExtractedAt ?? null,
      metadataVersion: row.metadataVersion,
      source: row.source,
      sourceUrl: row.sourceUrl ?? null,
      state: row.state,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      playCount: row.playCount,
      winRate: row.winRate ?? null,
      giveupRate: row.giveupRate ?? null,
    };
  }
}
