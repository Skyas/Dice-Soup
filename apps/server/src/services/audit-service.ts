/**
 * @module services/audit-service
 * 审计日志服务。只增不删，应用层禁止 DELETE。（§1.6）
 * 记录：管理员操作、越狱尝试、权限拒绝、KP 转移、输出泄露拦截等。
 */

import { ulid } from 'ulid';
import type { DrizzleDB } from '../db/client';
import { auditLog } from '../db/schema';
import { createLogger } from '@dice-soup/logger';

const log = createLogger({ module: 'audit-service' });

export type AuditCategory =
  | 'admin_op'
  | 'jailbreak'
  | 'permission_deny'
  | 'kp_transfer'
  | 'leak_intercept'
  | 'rate_limit_hit'
  | 'config_change';

export type AuditSeverity = 'info' | 'warning' | 'critical';
export type AuditActorType = 'player' | 'admin' | 'system';

export interface AuditEntry {
  category: AuditCategory;
  actor: string;
  actorType: AuditActorType;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  severity: AuditSeverity;
}

export class AuditService {
  private readonly db: DrizzleDB;

  constructor(db: DrizzleDB) {
    this.db = db;
  }

  /**
   * 写入审计日志。
   * actor 字段无外键约束——未建档用户的 QQ 号也可写入。（§1.6 规则 2）
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert(auditLog).values({
        id: ulid(),
        at: Date.now(),
        category: entry.category,
        actor: entry.actor,
        actorType: entry.actorType,
        action: entry.action,
        target: entry.target ?? null,
        metaJson: entry.meta ? JSON.stringify(entry.meta) : null,
        severity: entry.severity,
      });

      // 同时输出结构化日志，方便 Log Viewer 实时查看
      const logLevel = entry.severity === 'critical' ? 'error'
        : entry.severity === 'warning' ? 'warn'
        : 'info';

      log[logLevel](
        {
          auditCategory: entry.category,
          actor: entry.actor,
          actorType: entry.actorType,
          action: entry.action,
          target: entry.target,
        },
        `[audit] ${entry.action}`,
      );
    } catch (err) {
      // 审计日志写失败不应影响主流程，但必须记录错误
      log.error({ err, entry }, '[audit] 审计日志写入失败');
    }
  }

  /** 快捷：记录越狱尝试 */
  async logJailbreak(
    actor: string,
    input: string,
    pattern: string,
    sessionId?: string,
    channelId?: string,
  ): Promise<void> {
    await this.log({
      category: 'jailbreak',
      actor,
      actorType: 'player',
      action: 'jailbreak.detected',
      severity: 'warning',
      meta: { input, pattern_matched: pattern, session_id: sessionId, channel_id: channelId },
    });
  }

  /** 快捷：记录权限拒绝 */
  async logPermissionDeny(
    actor: string,
    action: string,
    requiredRole: string,
  ): Promise<void> {
    await this.log({
      category: 'permission_deny',
      actor,
      actorType: 'player',
      action: `permission.denied:${action}`,
      severity: 'info',
      meta: { required_role: requiredRole },
    });
  }

  /** 快捷：记录限流触发 */
  async logRateLimit(actor: string, limitKey: string): Promise<void> {
    await this.log({
      category: 'rate_limit_hit',
      actor,
      actorType: 'player',
      action: 'rate_limit.hit',
      severity: 'info',
      meta: { limit_key: limitKey },
    });
  }

  /** 快捷：记录 NapCat 鉴权失败 */
  async logOneBotAuthFailed(remoteAddress: string): Promise<void> {
    await this.log({
      category: 'admin_op',
      actor: 'system',
      actorType: 'system',
      action: 'onebot.auth_failed',
      target: remoteAddress,
      severity: 'warning',
      meta: { remote_address: remoteAddress },
    });
  }
}
