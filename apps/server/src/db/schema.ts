/**
 * @module schema
 * Drizzle ORM schema — Phase 1 所有表定义。
 * 建表时机和字段约定严格遵循 §1.1-§1.11 详设文档。
 */

import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── users（§1.3） ────────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  qqId: text('qq_id').primaryKey().notNull(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
  bannedAt: integer('banned_at'),
  bannedReason: text('banned_reason'),
});

// ─── admins（§1.4） ──────────────────────────────────────────────────────────

export const admins = sqliteTable('admins', {
  username: text('username').primaryKey().notNull(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: integer('created_at').notNull(),
  lastLoginAt: integer('last_login_at'),
  disabled: integer('disabled').notNull().default(0),
  mustChangePw: integer('must_change_pw').notNull().default(0),
});

// ─── user_profiles（§1.5） ────────────────────────────────────────────────────

export const userProfiles = sqliteTable('user_profiles', {
  qqId: text('qq_id')
    .primaryKey()
    .notNull()
    .references(() => users.qqId, { onDelete: 'cascade' }),
  statsJson: text('stats_json').notNull().default('{}'),
  preferencesJson: text('preferences_json').notNull().default('{}'),
  badgesJson: text('badges_json').notNull().default('[]'),
  gamesPlayedJson: text('games_played_json').notNull().default('{}'),
  updatedAt: integer('updated_at').notNull(),
});

// ─── audit_log（§1.6） ───────────────────────────────────────────────────────

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey().notNull(),
    at: integer('at').notNull(),
    category: text('category').notNull(),
    actor: text('actor').notNull(),
    actorType: text('actor_type').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    metaJson: text('meta_json'),
    severity: text('severity').notNull(),
  },
  (table) => ({
    idxAtDesc: index('idx_audit_at_desc').on(table.at),
    idxCatAt: index('idx_audit_cat_at').on(table.category, table.at),
    idxActorAt: index('idx_audit_actor_at').on(table.actor, table.at),
    idxSeverityAt: index('idx_audit_severity_at').on(table.severity, table.at),
  }),
);

// ─── rooms（§1.7） ───────────────────────────────────────────────────────────

export const rooms = sqliteTable(
  'rooms',
  {
    id: text('id').primaryKey().notNull(),
    platform: text('platform').notNull(),
    channelId: text('channel_id').notNull(),
    displayName: text('display_name'),
    createdAt: integer('created_at').notNull(),
    lastSessionAt: integer('last_session_at').notNull(),
    settingsJson: text('settings_json').notNull().default('{}'),
  },
  (table) => ({
    uqPlatformChannel: uniqueIndex('uq_rooms_platform_channel').on(table.platform, table.channelId),
  }),
);

// ─── game_sessions（§1.8） ────────────────────────────────────────────────────

export const gameSessions = sqliteTable(
  'game_sessions',
  {
    id: text('id').primaryKey().notNull(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'restrict' }),
    gameType: text('game_type').notNull(),
    state: text('state').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.qqId, { onDelete: 'restrict' }),
    createdAt: integer('created_at').notNull(),
    startedAt: integer('started_at'),
    endedAt: integer('ended_at'),
    endReason: text('end_reason'),
    stateSnapshotJson: text('state_snapshot_json').notNull().default('{}'),
    configJson: text('config_json').notNull().default('{}'),
    kpQq: text('kp_qq').references(() => users.qqId, { onDelete: 'restrict' }),
    lastActivityAt: integer('last_activity_at').notNull(),
  },
  (table) => ({
    // 群级互斥：同群同时只能有一个活跃会话
    uqRoomActive: uniqueIndex('uq_sessions_room_active')
      .on(table.roomId)
      .where(sql`${table.state} IN ('pending', 'running', 'setup', 'restoring')`),
    idxState: index('idx_sessions_state').on(table.state),
    idxRoom: index('idx_sessions_room').on(table.roomId, table.createdAt),
    idxLastActivity: index('idx_sessions_last_activity').on(table.lastActivityAt),
  }),
);

// ─── session_members（§1.9） ──────────────────────────────────────────────────

export const sessionMembers = sqliteTable(
  'session_members',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => gameSessions.id, { onDelete: 'cascade' }),
    userQq: text('user_qq')
      .notNull()
      .references(() => users.qqId, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    joinedAt: integer('joined_at').notNull(),
    leftAt: integer('left_at'),
    stateJson: text('state_json').notNull().default('{}'),
    /** 冗余字段：与 game_sessions.state 同步，用于 partial unique index（§1.9 技术决定） */
    sessionState: text('session_state').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.userQq] }),
    // 用户级互斥：一个 QQ 号同时只能在一个活跃会话中
    uqUserActive: uniqueIndex('uq_members_user_active')
      .on(table.userQq)
      .where(sql`${table.leftAt} IS NULL AND ${table.sessionState} IN ('pending', 'running', 'setup', 'restoring')`),
    idxUser: index('idx_members_user').on(table.userQq),
    idxSession: index('idx_members_session').on(table.sessionId),
  }),
);

// ─── config_items（§1.11） ────────────────────────────────────────────────────

export const configItems = sqliteTable('config_items', {
  key: text('key').primaryKey().notNull(),
  valueJson: text('value_json').notNull(),
  valueType: text('value_type').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  updatedAt: integer('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
});

// ─── soup_puzzles（§4.1.1） ────────────────────────────────────────────────────

export const soupPuzzles = sqliteTable(
  'soup_puzzles',
  {
    id: text('id').primaryKey().notNull(),
    title: text('title').notNull(),
    surface: text('surface').notNull(),
    truth: text('truth').notNull(),
    hintsJson: text('hints_json').notNull().default('[]'),
    difficulty: integer('difficulty').notNull(),
    tagsJson: text('tags_json').notNull().default('[]'),
    expectedMinutes: integer('expected_minutes'),
    keyPointsJson: text('key_points_json').notNull().default('[]'),
    sensitiveWordsJson: text('sensitive_words_json').notNull().default('[]'),
    metadataExtractedAt: integer('metadata_extracted_at'),
    metadataVersion: integer('metadata_version').notNull().default(0),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    state: text('state').notNull().default('draft'),
    createdBy: text('created_by'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    playCount: integer('play_count').notNull().default(0),
    winRate: integer('win_rate'),
    giveupRate: integer('giveup_rate'),
  },
  (table) => ({
    idxState: index('idx_soup_puzzles_state').on(table.state),
    idxDifficulty: index('idx_soup_puzzles_difficulty').on(table.difficulty),
    idxCreatedAt: index('idx_soup_puzzles_created_at').on(table.createdAt),
  }),
);

// ─── soup_play_records（§附录B） ──────────────────────────────────────────────

export const soupPlayRecords = sqliteTable(
  'soup_play_records',
  {
    id: text('id').primaryKey().notNull(),
    userQq: text('user_qq').notNull(),
    puzzleId: text('puzzle_id').notNull(),
    sessionId: text('session_id').notNull(),
    playedAt: integer('played_at').notNull(),
    endedAt: integer('ended_at'),
    result: text('result').notNull(),
    contributionScore: integer('contribution_score'),
    contributionPercentile: integer('contribution_percentile'),
    breakthroughCount: integer('breakthrough_count').notNull().default(0),
    questionsAsked: integer('questions_asked').notNull().default(0),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => ({
    idxUser: index('idx_soup_play_records_user').on(table.userQq),
    idxPuzzle: index('idx_soup_play_records_puzzle').on(table.puzzleId),
    idxSession: index('idx_soup_play_records_session').on(table.sessionId),
  }),
);

// ─── 类型推导（Drizzle 自动推导，供 TS 使用） ─────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Admin = typeof admins.$inferSelect;
export type NewAdmin = typeof admins.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type GameSession = typeof gameSessions.$inferSelect;
export type NewGameSession = typeof gameSessions.$inferInsert;
export type SessionMember = typeof sessionMembers.$inferSelect;
export type NewSessionMember = typeof sessionMembers.$inferInsert;
export type ConfigItem = typeof configItems.$inferSelect;
export type NewConfigItem = typeof configItems.$inferInsert;

export type SoupPuzzle = typeof soupPuzzles.$inferSelect;
export type NewSoupPuzzle = typeof soupPuzzles.$inferInsert;
export type SoupPlayRecord = typeof soupPlayRecords.$inferSelect;
export type NewSoupPlayRecord = typeof soupPlayRecords.$inferInsert;
