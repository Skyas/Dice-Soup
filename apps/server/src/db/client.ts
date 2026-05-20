/**
 * @module db/client
 * 数据库连接与迁移。使用 better-sqlite3（SQLite，开发默认）。
 * 启用 foreign_keys + WAL 模式（§1.1 G8）。
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';
import { createLogger } from '@dice-soup/logger';

const log = createLogger({ module: 'db' });

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDB | null = null;

/**
 * 获取数据库实例（单例）。
 * 首次调用时初始化连接并运行迁移。
 */
export function getDatabase(): DrizzleDB {
  if (_db) return _db;
  throw new Error('[db] 数据库未初始化，请先调用 initDatabase()');
}

/**
 * 初始化数据库连接，运行迁移，设置 SQLite pragma。
 * 应在应用启动时调用一次。
 */
export async function initDatabase(databaseUrl: string): Promise<DrizzleDB> {
  if (_db) {
    log.warn('[db] initDatabase 被重复调用，忽略');
    return _db;
  }

  // 解析 SQLite 文件路径
  const filePath = databaseUrl.startsWith('file:')
    ? databaseUrl.slice(5)
    : databaseUrl;

  // 确保目录存在
  const dir = path.dirname(path.resolve(filePath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log.info({ dir }, '[db] 创建数据目录');
  }

  log.info({ filePath }, '[db] 正在连接 SQLite...');

  const sqlite = new Database(filePath);

  // 启用 foreign keys 和 WAL 模式（§1.1 G8）
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  log.info('[db] SQLite pragma 设置完成 (foreign_keys=ON, journal_mode=WAL)');

  _db = drizzle(sqlite, { schema });

  // 运行迁移
  const migrationsFolder = path.join(__dirname, 'migrations');
  if (fs.existsSync(migrationsFolder)) {
    log.info({ migrationsFolder }, '[db] 正在运行数据库迁移...');
    migrate(_db, { migrationsFolder });
    log.info('[db] 数据库迁移完成');
  } else {
    log.warn({ migrationsFolder }, '[db] 迁移目录不存在，跳过迁移（请运行 pnpm db:generate）');
  }

  log.info('[db] 数据库初始化完成');
  return _db;
}

/** 关闭数据库连接（应在应用退出时调用） */
export function closeDatabase(): void {
  if (_db) {
    // @ts-expect-error — Drizzle 内部访问原始 sqlite 实例
    _db.session?.client?.close?.();
    _db = null;
    log.info('[db] 数据库连接已关闭');
  }
}
