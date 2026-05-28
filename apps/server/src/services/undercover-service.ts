/**
 * @module services/undercover-service
 * 谁是卧底 DB 访问层：词库管理 + 游玩记录。
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createLogger } from '@dice-soup/logger';
import type { WordPair } from '@dice-soup/game-undercover';
import { getSeedWordPairs } from '@dice-soup/game-undercover';
import type { DrizzleDB } from '../db/client';
import { undercoverWords, undercoverPlayRecords } from '../db/schema';

const log = createLogger({ module: 'undercover-service' });

export interface SavePlayRecordArgs {
  userQq: string;
  sessionId: string;
  wordPairId: string;
  role: 'civilian' | 'undercover' | 'blank';
  result: 'win' | 'lose';
  survivedRounds: number;
}

export class UndercoverService {
  constructor(private readonly db: DrizzleDB) {}

  // ── 词库 ──────────────────────────────────────────────────────────────────

  /**
   * 获取所有 active 状态的词对。
   * 供游戏开始时随机选词。
   */
  async getActiveWordPairs(): Promise<WordPair[]> {
    const rows = await this.db
      .select()
      .from(undercoverWords)
      .where(eq(undercoverWords.state, 'active'));

    return rows.map((r) => ({
      id: r.id,
      normalWord: r.normalWord,
      undercoverWord: r.undercoverWord,
      category: r.category,
      difficulty: r.difficulty as 'easy' | 'medium' | 'hard',
    }));
  }

  /**
   * 获取某用户近期玩过的词对 ID 列表（用于防重复选词）。
   */
  async getPlayedWordPairIds(userQq: string): Promise<string[]> {
    const rows = await this.db
      .select({ wordPairId: undercoverPlayRecords.wordPairId })
      .from(undercoverPlayRecords)
      .where(eq(undercoverPlayRecords.userQq, userQq));

    return [...new Set(rows.map((r) => r.wordPairId))];
  }

  // ── 游玩记录 ──────────────────────────────────────────────────────────────

  async savePlayRecord(args: SavePlayRecordArgs): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db.insert(undercoverPlayRecords).values({
      id: ulid(),
      userQq: args.userQq,
      sessionId: args.sessionId,
      wordPairId: args.wordPairId,
      role: args.role,
      result: args.result,
      survivedRounds: args.survivedRounds,
      playedAt: now,
    });
  }

  // ── 词库管理（管理员后台用） ──────────────────────────────────────────────

  async createWordPair(args: {
    normalWord: string;
    undercoverWord: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    source: string;
    createdBy: string;
  }): Promise<string> {
    const id = ulid();
    const now = Math.floor(Date.now() / 1000);
    await this.db.insert(undercoverWords).values({
      id,
      ...args,
      state: 'active',
      createdAt: now,
    });
    return id;
  }

  // ── 管理员列表 / 查询 ────────────────────────────────────────────────────

  async listWordPairs(args: {
    state?: string;
    category?: string;
    difficulty?: string;
    page: number;
    pageSize: number;
  }) {
    const offset = (args.page - 1) * args.pageSize;
    const where = and(
      args.state ? eq(undercoverWords.state, args.state) : undefined,
      args.category ? eq(undercoverWords.category, args.category) : undefined,
      args.difficulty ? eq(undercoverWords.difficulty, args.difficulty) : undefined,
    );

    const [items, countRows] = await Promise.all([
      this.db.select()
        .from(undercoverWords)
        .where(where)
        .orderBy(desc(undercoverWords.createdAt))
        .limit(args.pageSize)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` })
        .from(undercoverWords)
        .where(where),
    ]);

    return { items, total: countRows[0]?.count ?? 0 };
  }

  async getWordPairById(id: string) {
    const rows = await this.db
      .select()
      .from(undercoverWords)
      .where(eq(undercoverWords.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async updateWordPair(id: string, args: {
    normalWord?: string;
    undercoverWord?: string;
    category?: string;
    difficulty?: string;
    state?: string;
  }): Promise<boolean> {
    const patch: Record<string, unknown> = {};
    if (args.normalWord !== undefined) patch.normalWord = args.normalWord;
    if (args.undercoverWord !== undefined) patch.undercoverWord = args.undercoverWord;
    if (args.category !== undefined) patch.category = args.category;
    if (args.difficulty !== undefined) patch.difficulty = args.difficulty;
    if (args.state !== undefined) patch.state = args.state;
    if (Object.keys(patch).length === 0) return false;

    await this.db.update(undercoverWords).set(patch as any).where(eq(undercoverWords.id, id));
    return true;
  }

  async listPlayRecords(args: {
    page: number;
    pageSize: number;
    role?: string;
    result?: string;
  }) {
    const offset = (args.page - 1) * args.pageSize;
    const where = and(
      args.role ? eq(undercoverPlayRecords.role, args.role) : undefined,
      args.result ? eq(undercoverPlayRecords.result, args.result) : undefined,
    );

    const [items, countRows] = await Promise.all([
      this.db
        .select({
          id: undercoverPlayRecords.id,
          userQq: undercoverPlayRecords.userQq,
          sessionId: undercoverPlayRecords.sessionId,
          wordPairId: undercoverPlayRecords.wordPairId,
          role: undercoverPlayRecords.role,
          result: undercoverPlayRecords.result,
          survivedRounds: undercoverPlayRecords.survivedRounds,
          playedAt: undercoverPlayRecords.playedAt,
          normalWord: undercoverWords.normalWord,
          undercoverWord: undercoverWords.undercoverWord,
        })
        .from(undercoverPlayRecords)
        .leftJoin(undercoverWords, eq(undercoverPlayRecords.wordPairId, undercoverWords.id))
        .where(where)
        .orderBy(desc(undercoverPlayRecords.playedAt))
        .limit(args.pageSize)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` })
        .from(undercoverPlayRecords)
        .where(where),
    ]);

    return { items, total: countRows[0]?.count ?? 0 };
  }

  async getRecordStats() {
    const [totalRecords, civWins, ucWins, blankWins] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` }).from(undercoverPlayRecords),
      this.db.select({ count: sql<number>`count(*)` }).from(undercoverPlayRecords)
        .where(and(eq(undercoverPlayRecords.role, 'civilian'), eq(undercoverPlayRecords.result, 'win'))),
      this.db.select({ count: sql<number>`count(*)` }).from(undercoverPlayRecords)
        .where(and(eq(undercoverPlayRecords.role, 'undercover'), eq(undercoverPlayRecords.result, 'win'))),
      this.db.select({ count: sql<number>`count(*)` }).from(undercoverPlayRecords)
        .where(and(eq(undercoverPlayRecords.role, 'blank'), eq(undercoverPlayRecords.result, 'win'))),
    ]);
    return {
      totalRecords: totalRecords[0]?.count ?? 0,
      civWins: civWins[0]?.count ?? 0,
      ucWins: ucWins[0]?.count ?? 0,
      blankWins: blankWins[0]?.count ?? 0,
    };
  }

  async getStats() {
    const [totalWords, activeWords, totalRecords, categoryRows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)` }).from(undercoverWords),
      this.db.select({ count: sql<number>`count(*)` }).from(undercoverWords).where(eq(undercoverWords.state, 'active')),
      this.db.select({ count: sql<number>`count(*)` }).from(undercoverPlayRecords),
      this.db.selectDistinct({ category: undercoverWords.category }).from(undercoverWords),
    ]);

    return {
      totalWords: totalWords[0]?.count ?? 0,
      activeWords: activeWords[0]?.count ?? 0,
      totalRecords: totalRecords[0]?.count ?? 0,
      categories: categoryRows.map((r) => r.category),
    };
  }

  // ── 种子数据 ──────────────────────────────────────────────────────────────

  /**
   * 初始化种子词库（幂等：已有记录则跳过）。
   */
  async seedWordPairs(): Promise<void> {
    const existing = await this.db
      .select({ id: undercoverWords.id })
      .from(undercoverWords)
      .where(eq(undercoverWords.source, 'seed'))
      .limit(1);

    if (existing.length > 0) {
      log.debug('[undercover] 种子词库已存在，跳过 seed');
      return;
    }

    const seeds = getSeedWordPairs();
    const now = Math.floor(Date.now() / 1000);

    for (const pair of seeds) {
      await this.db.insert(undercoverWords).values({
        id: pair.id,
        normalWord: pair.normalWord,
        undercoverWord: pair.undercoverWord,
        category: pair.category,
        difficulty: pair.difficulty,
        source: 'seed',
        state: 'active',
        createdBy: 'system',
        createdAt: now,
      });
    }

    log.info({ count: seeds.length }, '[undercover] 种子词库已写入');
  }
}
