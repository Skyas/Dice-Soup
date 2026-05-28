-- 谁是卧底词库
CREATE TABLE IF NOT EXISTS `undercover_words` (
	`id` text PRIMARY KEY NOT NULL,
	`normal_word` text NOT NULL,
	`undercover_word` text NOT NULL,
	`category` text NOT NULL DEFAULT 'general',
	`difficulty` text NOT NULL DEFAULT 'medium',
	`source` text NOT NULL DEFAULT 'seed',
	`state` text NOT NULL DEFAULT 'active',
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_undercover_words_state` ON `undercover_words` (`state`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_undercover_words_category` ON `undercover_words` (`category`);
--> statement-breakpoint

-- 谁是卧底游玩记录
CREATE TABLE IF NOT EXISTS `undercover_play_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_qq` text NOT NULL,
	`session_id` text NOT NULL,
	`word_pair_id` text NOT NULL,
	`role` text NOT NULL,
	`result` text NOT NULL,
	`survived_rounds` integer NOT NULL,
	`played_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_undercover_records_user` ON `undercover_play_records` (`user_qq`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_undercover_records_session` ON `undercover_play_records` (`session_id`);
