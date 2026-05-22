/**
 * @module services/session-manager
 * 会话管理器：创建/加入/结束会话，状态机，活动超时，快照持久化。
 * 设计依据：§3.1（无房间模式 K1）
 */

import { eq, and, inArray, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createLogger } from '@dice-soup/logger';
import type { DrizzleDB } from '../db/client';
import { gameSessions, sessionMembers, rooms } from '../db/schema';

const log = createLogger({ module: 'session-manager' });

// ── 领域类型 ───────────────────────────────────────────────────────────────────

export type SessionState = 'setup' | 'running' | 'restoring' | 'ended' | 'aborted';

export interface SessionInfo {
  id: string;
  roomId: string;
  gameType: string;
  state: SessionState;
  createdBy: string;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  endReason: string | null;
  stateSnapshot: Record<string, unknown>;
  lastActivityAt: number;
  members: string[];
}

// ── SessionManager ────────────────────────────────────────────────────────────

export class SessionManager {
  /** per-room 操作串行化锁 */
  private readonly roomLocks = new Map<string, Promise<unknown>>();
  /** 活动计时器：sessionId → timer */
  private readonly activityTimers = new Map<string, NodeJS.Timeout>();
  /** 快照防抖：sessionId → timer */
  private readonly snapshotDebounce = new Map<string, NodeJS.Timeout>();

  constructor(private readonly db: DrizzleDB) {}

  // ── 会话创建 ────────────────────────────────────────────────────────────────

  /**
   * 创建一个海龟汤会话（群级 + 用户级互斥）。
   * 返回新建的 sessionId，或冲突错误信息。
   */
  async createSession(
    groupId: string,
    platform: string,
    initiatorQQ: string,
    initialSnapshot: Record<string, unknown>,
  ): Promise<{ ok: true; sessionId: string } | { ok: false; reason: string }> {
    return this.withRoomLock(groupId, async () => {
      // 确保 room 记录存在
      const roomId = await this.ensureRoom(groupId, platform);

      // 群级互斥检查
      const existingSession = await this.getActiveSessionByRoom(roomId);
      if (existingSession) {
        return { ok: false as const, reason: '该群已有一场海龟汤进行中，请先结束当前游戏' };
      }

      // 用户级互斥检查
      const userSession = await this.getActiveSessionByUser(initiatorQQ);
      if (userSession) {
        return { ok: false as const, reason: '你已在另一场游戏中，请先结束当前游戏' };
      }

      const now = Math.floor(Date.now() / 1000);
      const sessionId = ulid();

      try {
        // 创建会话
        await this.db.insert(gameSessions).values({
          id: sessionId,
          roomId,
          gameType: 'soup',
          state: 'setup',
          createdBy: initiatorQQ,
          createdAt: now,
          stateSnapshotJson: JSON.stringify(initialSnapshot),
          lastActivityAt: now,
        });

        // 加入发起人
        await this.db.insert(sessionMembers).values({
          sessionId,
          userQq: initiatorQQ,
          role: 'initiator',
          joinedAt: now,
          sessionState: 'setup',
        });

        log.info({ sessionId, groupId, initiatorQQ }, '[session-manager] 会话创建成功');
        return { ok: true as const, sessionId };
      } catch (e: any) {
        if (e?.message?.includes('UNIQUE constraint failed')) {
          return { ok: false as const, reason: '会话创建冲突，请稍后重试' };
        }
        throw e;
      }
    });
  }

  // ── 成员加入 ────────────────────────────────────────────────────────────────

  async joinSession(
    sessionId: string,
    userQQ: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const session = await this.getSessionById(sessionId);
    if (!session) return { ok: false, reason: '会话不存在' };

    if (!['setup', 'running'].includes(session.state)) {
      return { ok: false, reason: '当前游戏不可加入' };
    }

    // 用户级互斥
    const existingSession = await this.getActiveSessionByUser(userQQ);
    if (existingSession && existingSession.id !== sessionId) {
      return { ok: false, reason: '你已在另一场游戏中，无法加入' };
    }

    if (session.members.includes(userQQ)) {
      return { ok: false, reason: '你已在本场游戏中' };
    }

    const now = Math.floor(Date.now() / 1000);
    try {
      await this.db.insert(sessionMembers).values({
        sessionId,
        userQq: userQQ,
        role: 'player',
        joinedAt: now,
        sessionState: session.state,
      });
      log.info({ sessionId, userQQ }, '[session-manager] 玩家加入会话');
      return { ok: true };
    } catch (e: any) {
      if (e?.message?.includes('UNIQUE constraint failed')) {
        return { ok: false, reason: '加入冲突，你已在另一场游戏中' };
      }
      throw e;
    }
  }

  // ── 状态转换 ────────────────────────────────────────────────────────────────

  async transitionState(
    sessionId: string,
    newState: SessionState,
    snapshot?: Record<string, unknown>,
    opts?: { startedAt?: number; endedAt?: number; endReason?: string },
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const updateData: Record<string, unknown> = {
      state: newState,
      lastActivityAt: now,
    };

    if (snapshot) updateData.stateSnapshotJson = JSON.stringify(snapshot);
    if (opts?.startedAt) updateData.startedAt = opts.startedAt;
    if (opts?.endedAt) updateData.endedAt = opts.endedAt;
    if (opts?.endReason) updateData.endReason = opts.endReason;

    await this.db
      .update(gameSessions)
      .set(updateData as any)
      .where(eq(gameSessions.id, sessionId));

    // 同步 session_members.session_state
    if (!['ended', 'aborted'].includes(newState)) {
      await this.db
        .update(sessionMembers)
        .set({ sessionState: newState })
        .where(and(eq(sessionMembers.sessionId, sessionId)));
    }

    log.info({ sessionId, newState }, '[session-manager] 状态转换');
  }

  // ── 快照持久化 ───────────────────────────────────────────────────────────────

  saveSnapshot(sessionId: string, snapshot: Record<string, unknown>): void {
    // 防抖 100ms
    const existing = this.snapshotDebounce.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.snapshotDebounce.delete(sessionId);
      await this.db
        .update(gameSessions)
        .set({ stateSnapshotJson: JSON.stringify(snapshot), lastActivityAt: Math.floor(Date.now() / 1000) })
        .where(eq(gameSessions.id, sessionId));
    }, 100);

    this.snapshotDebounce.set(sessionId, timer);
  }

  // ── 活动超时 ────────────────────────────────────────────────────────────────

  registerActivityTimeout(
    sessionId: string,
    timeoutMs: number,
    onTimeout: () => Promise<void>,
  ): void {
    this.clearActivityTimeout(sessionId);
    const timer = setTimeout(async () => {
      this.activityTimers.delete(sessionId);
      try {
        await onTimeout();
      } catch (e) {
        log.error({ err: e, sessionId }, '[session-manager] 活动超时回调失败');
      }
    }, timeoutMs);
    this.activityTimers.set(sessionId, timer);
  }

  resetActivityTimer(sessionId: string, timeoutMs: number, onTimeout: () => Promise<void>): void {
    this.registerActivityTimeout(sessionId, timeoutMs, onTimeout);
    // 更新 last_activity_at
    const now = Math.floor(Date.now() / 1000);
    this.db.update(gameSessions).set({ lastActivityAt: now }).where(eq(gameSessions.id, sessionId));
  }

  clearActivityTimeout(sessionId: string): void {
    const timer = this.activityTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.activityTimers.delete(sessionId);
    }
  }

  // ── 查询 ────────────────────────────────────────────────────────────────────

  async getSessionById(sessionId: string): Promise<SessionInfo | null> {
    const rows = await this.db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.id, sessionId))
      .limit(1);

    if (!rows[0]) return null;
    return this.rowToSessionInfo(rows[0]);
  }

  async getActiveSessionByRoom(roomId: string): Promise<SessionInfo | null> {
    const rows = await this.db
      .select()
      .from(gameSessions)
      .where(
        and(
          eq(gameSessions.roomId, roomId),
          inArray(gameSessions.state, ['setup', 'running', 'restoring', 'pending']),
        ),
      )
      .limit(1);

    if (!rows[0]) return null;
    return this.rowToSessionInfo(rows[0]);
  }

  async getActiveSessionByUser(userQQ: string): Promise<SessionInfo | null> {
    const memberRows = await this.db
      .select({ sessionId: sessionMembers.sessionId })
      .from(sessionMembers)
      .where(
        and(
          eq(sessionMembers.userQq, userQQ),
          sql`${sessionMembers.leftAt} IS NULL`,
          inArray(sessionMembers.sessionState, ['setup', 'running', 'restoring', 'pending']),
        ),
      )
      .limit(1);

    if (!memberRows[0]) return null;
    return this.getSessionById(memberRows[0].sessionId);
  }

  async getRoomIdByGroupId(groupId: string, platform: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.platform, platform), eq(rooms.channelId, groupId)))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  // ── 工具方法 ─────────────────────────────────────────────────────────────────

  private async ensureRoom(groupId: string, platform: string): Promise<string> {
    const existing = await this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.platform, platform), eq(rooms.channelId, groupId)))
      .limit(1);

    if (existing[0]) return existing[0].id;

    const id = ulid();
    const now = Math.floor(Date.now() / 1000);
    await this.db.insert(rooms).values({
      id,
      platform,
      channelId: groupId,
      createdAt: now,
      lastSessionAt: now,
    });
    return id;
  }

  private async rowToSessionInfo(row: typeof gameSessions.$inferSelect): Promise<SessionInfo> {
    const memberRows = await this.db
      .select({ userQq: sessionMembers.userQq })
      .from(sessionMembers)
      .where(and(eq(sessionMembers.sessionId, row.id), sql`${sessionMembers.leftAt} IS NULL`));

    return {
      id: row.id,
      roomId: row.roomId,
      gameType: row.gameType,
      state: row.state as SessionState,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      startedAt: row.startedAt ?? null,
      endedAt: row.endedAt ?? null,
      endReason: row.endReason ?? null,
      stateSnapshot: JSON.parse(row.stateSnapshotJson),
      lastActivityAt: row.lastActivityAt,
      members: memberRows.map((m) => m.userQq),
    };
  }

  private withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.roomLocks.get(roomId) ?? Promise.resolve();
    const next = prev.then(fn);
    this.roomLocks.set(roomId, next.catch(() => {}));
    return next;
  }
}
