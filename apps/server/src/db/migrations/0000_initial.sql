-- Dice&Soup Phase 1 初始建表迁移
-- 由 drizzle-kit 管理，请勿手动修改已提交内容

CREATE TABLE `users` (
  `qq_id`         TEXT    PRIMARY KEY NOT NULL,
  `display_name`  TEXT    NOT NULL,
  `created_at`    INTEGER NOT NULL,
  `last_seen_at`  INTEGER NOT NULL,
  `banned_at`     INTEGER,
  `banned_reason` TEXT
);
--> statement-breakpoint

CREATE TABLE `admins` (
  `username`      TEXT    PRIMARY KEY NOT NULL,
  `password_hash` TEXT    NOT NULL,
  `display_name`  TEXT    NOT NULL,
  `created_at`    INTEGER NOT NULL,
  `last_login_at` INTEGER,
  `disabled`      INTEGER NOT NULL DEFAULT 0,
  `must_change_pw` INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint

CREATE TABLE `user_profiles` (
  `qq_id`              TEXT    PRIMARY KEY NOT NULL REFERENCES `users`(`qq_id`) ON DELETE CASCADE,
  `stats_json`         TEXT    NOT NULL DEFAULT '{}',
  `preferences_json`   TEXT    NOT NULL DEFAULT '{}',
  `badges_json`        TEXT    NOT NULL DEFAULT '[]',
  `games_played_json`  TEXT    NOT NULL DEFAULT '{}',
  `updated_at`         INTEGER NOT NULL
);
--> statement-breakpoint

CREATE TABLE `audit_log` (
  `id`         TEXT    PRIMARY KEY NOT NULL,
  `at`         INTEGER NOT NULL,
  `category`   TEXT    NOT NULL,
  `actor`      TEXT    NOT NULL,
  `actor_type` TEXT    NOT NULL,
  `action`     TEXT    NOT NULL,
  `target`     TEXT,
  `meta_json`  TEXT,
  `severity`   TEXT    NOT NULL
);
--> statement-breakpoint

CREATE INDEX `idx_audit_at_desc` ON `audit_log` (`at`);
--> statement-breakpoint

CREATE INDEX `idx_audit_cat_at` ON `audit_log` (`category`, `at`);
--> statement-breakpoint

CREATE INDEX `idx_audit_actor_at` ON `audit_log` (`actor`, `at`);
--> statement-breakpoint

CREATE INDEX `idx_audit_severity_at` ON `audit_log` (`severity`, `at`);
--> statement-breakpoint

CREATE TABLE `rooms` (
  `id`               TEXT    PRIMARY KEY NOT NULL,
  `platform`         TEXT    NOT NULL,
  `channel_id`       TEXT    NOT NULL,
  `display_name`     TEXT,
  `created_at`       INTEGER NOT NULL,
  `last_session_at`  INTEGER NOT NULL,
  `settings_json`    TEXT    NOT NULL DEFAULT '{}'
);
--> statement-breakpoint

CREATE UNIQUE INDEX `uq_rooms_platform_channel` ON `rooms` (`platform`, `channel_id`);
--> statement-breakpoint

CREATE TABLE `game_sessions` (
  `id`                   TEXT    PRIMARY KEY NOT NULL,
  `room_id`              TEXT    NOT NULL REFERENCES `rooms`(`id`) ON DELETE RESTRICT,
  `game_type`            TEXT    NOT NULL,
  `state`                TEXT    NOT NULL,
  `created_by`           TEXT    NOT NULL REFERENCES `users`(`qq_id`) ON DELETE RESTRICT,
  `created_at`           INTEGER NOT NULL,
  `started_at`           INTEGER,
  `ended_at`             INTEGER,
  `end_reason`           TEXT,
  `state_snapshot_json`  TEXT    NOT NULL DEFAULT '{}',
  `config_json`          TEXT    NOT NULL DEFAULT '{}',
  `kp_qq`                TEXT    REFERENCES `users`(`qq_id`) ON DELETE RESTRICT,
  `last_activity_at`     INTEGER NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX `uq_sessions_room_active`
  ON `game_sessions` (`room_id`)
  WHERE `state` IN ('pending', 'running');
--> statement-breakpoint

CREATE INDEX `idx_sessions_state` ON `game_sessions` (`state`);
--> statement-breakpoint

CREATE INDEX `idx_sessions_room` ON `game_sessions` (`room_id`, `created_at`);
--> statement-breakpoint

CREATE INDEX `idx_sessions_last_activity` ON `game_sessions` (`last_activity_at`);
--> statement-breakpoint

CREATE TABLE `session_members` (
  `session_id`     TEXT    NOT NULL REFERENCES `game_sessions`(`id`) ON DELETE CASCADE,
  `user_qq`        TEXT    NOT NULL REFERENCES `users`(`qq_id`) ON DELETE RESTRICT,
  `role`           TEXT    NOT NULL,
  `joined_at`      INTEGER NOT NULL,
  `left_at`        INTEGER,
  `state_json`     TEXT    NOT NULL DEFAULT '{}',
  `session_state`  TEXT    NOT NULL,
  PRIMARY KEY (`session_id`, `user_qq`)
);
--> statement-breakpoint

CREATE UNIQUE INDEX `uq_members_user_active`
  ON `session_members` (`user_qq`)
  WHERE `left_at` IS NULL AND `session_state` IN ('pending', 'running');
--> statement-breakpoint

CREATE INDEX `idx_members_user` ON `session_members` (`user_qq`);
--> statement-breakpoint

CREATE INDEX `idx_members_session` ON `session_members` (`session_id`);
--> statement-breakpoint

CREATE TABLE `config_items` (
  `key`          TEXT    PRIMARY KEY NOT NULL,
  `value_json`   TEXT    NOT NULL,
  `value_type`   TEXT    NOT NULL,
  `description`  TEXT,
  `category`     TEXT    NOT NULL,
  `updated_at`   INTEGER NOT NULL,
  `updated_by`   TEXT    NOT NULL
);
