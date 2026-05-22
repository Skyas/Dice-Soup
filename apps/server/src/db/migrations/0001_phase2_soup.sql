-- Phase 2: 更新 game_sessions 群级互斥索引（增加 setup/restoring 状态）
DROP INDEX IF EXISTS `uq_sessions_room_active`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sessions_room_active` ON `game_sessions` (`room_id`)
  WHERE `state` IN ('pending', 'running', 'setup', 'restoring');
--> statement-breakpoint
-- 更新 session_members 用户级互斥索引
DROP INDEX IF EXISTS `uq_members_user_active`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_members_user_active` ON `session_members` (`user_qq`)
  WHERE `left_at` IS NULL AND `session_state` IN ('pending', 'running', 'setup', 'restoring');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `soup_puzzles` (
  `id`                     TEXT    PRIMARY KEY NOT NULL,
  `title`                  TEXT    NOT NULL,
  `surface`                TEXT    NOT NULL,
  `truth`                  TEXT    NOT NULL,
  `hints_json`             TEXT    NOT NULL DEFAULT '[]',
  `difficulty`             INTEGER NOT NULL,
  `tags_json`              TEXT    NOT NULL DEFAULT '[]',
  `expected_minutes`       INTEGER,
  `key_points_json`        TEXT    NOT NULL DEFAULT '[]',
  `sensitive_words_json`   TEXT    NOT NULL DEFAULT '[]',
  `metadata_extracted_at`  INTEGER,
  `metadata_version`       INTEGER NOT NULL DEFAULT 0,
  `source`                 TEXT    NOT NULL,
  `source_url`             TEXT,
  `state`                  TEXT    NOT NULL DEFAULT 'draft',
  `created_by`             TEXT,
  `created_at`             INTEGER NOT NULL,
  `updated_at`             INTEGER NOT NULL,
  `play_count`             INTEGER NOT NULL DEFAULT 0,
  `win_rate`               INTEGER,
  `giveup_rate`            INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_soup_puzzles_state` ON `soup_puzzles` (`state`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_soup_puzzles_difficulty` ON `soup_puzzles` (`difficulty`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_soup_puzzles_created_at` ON `soup_puzzles` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `soup_play_records` (
  `id`                      TEXT    PRIMARY KEY NOT NULL,
  `user_qq`                 TEXT    NOT NULL,
  `puzzle_id`               TEXT    NOT NULL,
  `session_id`              TEXT    NOT NULL,
  `played_at`               INTEGER NOT NULL,
  `ended_at`                INTEGER,
  `result`                  TEXT    NOT NULL,
  `contribution_score`      INTEGER,
  `contribution_percentile` INTEGER,
  `breakthrough_count`      INTEGER NOT NULL DEFAULT 0,
  `questions_asked`         INTEGER NOT NULL DEFAULT 0,
  `joined_at`               INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_soup_play_records_user` ON `soup_play_records` (`user_qq`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_soup_play_records_puzzle` ON `soup_play_records` (`puzzle_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_soup_play_records_session` ON `soup_play_records` (`session_id`);
