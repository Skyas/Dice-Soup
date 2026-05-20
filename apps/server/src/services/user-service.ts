/**
 * @module services/user-service
 * 用户服务。
 *
 * 核心规则（§1.3 M1~M10）：
 * - users / user_profiles 仅在玩家首次参与游戏（createSession/joinSession）时懒创建。
 * - .help / .ping / .stats 等无害指令绝不触发建档。
 * - 未建档玩家执行 .stats → 返回"你还未参加过游戏"，不建档。
 * - 每次游戏内交互检测昵称变化，变化则更新 display_name 并写审计日志。
 */

import { eq } from 'drizzle-orm';
import type { DrizzleDB } from '../db/client';
import { users, userProfiles, type User, type UserProfile } from '../db/schema';
import { AuditService } from './audit-service';
import { createLogger } from '@dice-soup/logger';
import type { Result } from '@dice-soup/shared-types';
import { ok } from '@dice-soup/shared-types';

const log = createLogger({ module: 'user-service' });

export class UserService {
  private readonly db: DrizzleDB;
  private auditService?: AuditService;

  constructor(db: DrizzleDB, auditService?: AuditService) {
    this.db = db;
    this.auditService = auditService;
  }

  /** 延迟注入 AuditService（避免循环依赖） */
  setAuditService(auditService: AuditService): void {
    this.auditService = auditService;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 查询
  // ──────────────────────────────────────────────────────────────────────────

  /** 查询用户，不存在返回 null。不触发建档。 */
  async findUser(qqId: string): Promise<User | null> {
    return (await this.db.select().from(users).where(eq(users.qqId, qqId)).get()) ?? null;
  }

  /** 查询用户画像，不存在返回 null。 */
  async findProfile(qqId: string): Promise<UserProfile | null> {
    return (
      (await this.db.select().from(userProfiles).where(eq(userProfiles.qqId, qqId)).get()) ?? null
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 懒创建
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * 懒创建：仅在玩家首次参与游戏时调用。
   * - 若用户已存在且昵称无变化，直接返回。
   * - 若用户已存在但昵称变化，更新昵称 + 写审计。
   * - 若用户不存在，同时创建 users + user_profiles。
   *
   * @param qqId     QQ 号
   * @param nickname QQ 昵称快照（由 getGroupMemberInfo 获取）
   */
  async ensureUserExists(qqId: string, nickname: string): Promise<Result<User, never>> {
    const now = Date.now();
    const existing = await this.findUser(qqId);

    if (existing) {
      // 检测昵称变化
      if (existing.displayName !== nickname) {
        log.info(
          { qqId, old: existing.displayName, new: nickname },
          '[user] 昵称变更，更新 display_name',
        );
        await this.db
          .update(users)
          .set({ displayName: nickname, lastSeenAt: now })
          .where(eq(users.qqId, qqId));

        await this.auditService?.log({
          category: 'admin_op',
          actor: qqId,
          actorType: 'player',
          action: 'user.nickname_changed',
          target: qqId,
          severity: 'info',
          meta: { old_name: existing.displayName, new_name: nickname },
        });

        return ok({ ...existing, displayName: nickname, lastSeenAt: now });
      }

      // 昵称未变，只更新 last_seen_at
      await this.db.update(users).set({ lastSeenAt: now }).where(eq(users.qqId, qqId));

      return ok({ ...existing, lastSeenAt: now });
    }

    // ── 新用户：创建 users + user_profiles ──────────────────────────────────
    log.info({ qqId, nickname }, '[user] 首次参与游戏，建档');

    await this.db.insert(users).values({
      qqId,
      displayName: nickname,
      createdAt: now,
      lastSeenAt: now,
    });

    await this.db.insert(userProfiles).values({
      qqId,
      statsJson: '{}',
      preferencesJson: '{}',
      badgesJson: '[]',
      gamesPlayedJson: '{}',
      updatedAt: now,
    });

    const created = await this.findUser(qqId);
    // created 一定存在，断言非空
    return ok(created!);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 封禁
  // ──────────────────────────────────────────────────────────────────────────

  async banUser(qqId: string, reason: string): Promise<Result<void, never>> {
    await this.db
      .update(users)
      .set({ bannedAt: Date.now(), bannedReason: reason })
      .where(eq(users.qqId, qqId));
    log.warn({ qqId, reason }, '[user] 封禁用户');
    return ok(undefined);
  }

  async unbanUser(qqId: string): Promise<Result<void, never>> {
    await this.db
      .update(users)
      .set({ bannedAt: null, bannedReason: null })
      .where(eq(users.qqId, qqId));
    log.info({ qqId }, '[user] 解封用户');
    return ok(undefined);
  }

  /** 检查是否被封禁 */
  async isBanned(qqId: string): Promise<boolean> {
    const user = await this.findUser(qqId);
    return user?.bannedAt != null;
  }
}
