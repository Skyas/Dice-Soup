/**
 * @module config/config-service
 * 配置中心。非敏感配置从 DB config_items 读取，支持热更新。
 * 机密配置（API Key、Token 等）通过 setEncrypted / getDecrypted 加密存储。
 * 规则 14：所有模块通过 ConfigService 访问配置，禁止直接读 process.env（初始化密钥除外）。
 */

import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import type { DrizzleDB } from '../db/client';
import { configItems } from '../db/schema';
import { DEFAULT_CONFIGS } from './defaults';
import { createLogger } from '@dice-soup/logger';
import type { AppError, Result } from '@dice-soup/shared-types';
import { ok, errCode, ErrorCodes } from '@dice-soup/shared-types';
import { encryptValue, decryptValue, isEncrypted } from '../utils/crypto';

const log = createLogger({ module: 'config-service' });

export class ConfigService extends EventEmitter {
  private readonly db: DrizzleDB;
  /** 内存缓存 */
  private readonly cache = new Map<string, unknown>();
  /**
   * 派生自 JWT_SECRET 的加密密钥材料。
   * 此处允许直接读 process.env，因为这是加密基础设施本身的初始化密钥，
   * 不属于应用层配置，必须在 DB 读取之前可用。
   */
  private readonly encKey: string;

  constructor(db: DrizzleDB) {
    super();
    this.db = db;
    this.encKey = process.env.JWT_SECRET ?? 'dice-soup-default-enc-key-please-set-jwt-secret';
  }

  /**
   * 初始化：upsert 默认配置，加载全部配置到内存缓存。
   * 规则：已存在的配置不覆盖（保留管理员修改）；新增的写入。
   */
  async init(): Promise<void> {
    log.info('[config] 正在初始化配置中心...');
    const now = Date.now();

    for (const cfg of DEFAULT_CONFIGS) {
      const existing = await this.db
        .select()
        .from(configItems)
        .where(eq(configItems.key, cfg.key))
        .get();

      if (!existing) {
        await this.db.insert(configItems).values({
          key: cfg.key,
          valueJson: JSON.stringify(cfg.value),
          valueType: cfg.valueType,
          description: cfg.description,
          category: cfg.category,
          updatedAt: now,
          updatedBy: 'system',
        });
        log.info({ key: cfg.key }, '[config] 写入默认配置');
      }
    }

    // 加载全量配置到缓存
    await this.reloadAll();
    log.info('[config] 配置中心初始化完成');
  }

  /** 从 DB 重新加载全量配置到内存缓存 */
  async reloadAll(): Promise<void> {
    const all = await this.db.select().from(configItems).all();
    this.cache.clear();
    for (const item of all) {
      try {
        this.cache.set(item.key, JSON.parse(item.valueJson));
      } catch {
        log.warn({ key: item.key }, '[config] 配置值解析失败，跳过');
      }
    }
    log.debug({ count: this.cache.size }, '[config] 配置缓存已重新加载');
  }

  /**
   * 读取配置值。
   * @param key 点分路径 key
   * @param defaultValue 缓存未命中时的默认值
   */
  get<T>(key: string, defaultValue?: T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`[config] 配置 key 不存在: ${key}`);
  }

  getOptional<T>(key: string): T | undefined {
    return this.cache.has(key) ? (this.cache.get(key) as T) : undefined;
  }

  /**
   * 更新配置值（写 DB + 更新缓存 + 广播变更事件）。
   */
  async set(
    key: string,
    value: unknown,
    updatedBy: string,
  ): Promise<Result<void, AppError>> {
    const existing = await this.db
      .select()
      .from(configItems)
      .where(eq(configItems.key, key))
      .get();

    if (!existing) {
      return errCode(ErrorCodes.CONFIG_KEY_NOT_FOUND, `配置 key 不存在: ${key}`);
    }

    const now = Date.now();
    const oldValue = this.cache.get(key);

    try {
      await this.db
        .update(configItems)
        .set({
          valueJson: JSON.stringify(value),
          updatedAt: now,
          updatedBy,
        })
        .where(eq(configItems.key, key));

      this.cache.set(key, value);
      log.info({ key, updatedBy }, '[config] 配置已更新');

      // 广播变更事件，订阅模块自动收到
      this.emit(`change:${key}`, value, oldValue);
      this.emit('change', key, value, oldValue);

      return ok(undefined);
    } catch (err) {
      log.error({ err, key }, '[config] 配置更新失败');
      return errCode(ErrorCodes.DB_QUERY_FAILED, `配置更新失败: ${String(err)}`);
    }
  }

  /**
   * 返回所有非敏感配置项（供 Web API 列举）。
   * category === 'secret' 的项不在此返回，通过 secrets API 单独管理。
   * llm 类别保留在响应中（供 AI 配置页加载），但 ConfigView 前端过滤不显示。
   */
  getAllItems(): Array<{ key: string; value: unknown; category: string; description?: string }> {
    const result: Array<{ key: string; value: unknown; category: string; description?: string }> = [];
    for (const cfg of DEFAULT_CONFIGS) {
      if (cfg.category === 'secret') continue; // 机密项不公开
      result.push({
        key: cfg.key,
        value: this.cache.get(cfg.key) ?? cfg.value,
        category: cfg.category,
        description: cfg.description,
      });
    }
    return result;
  }

  /**
   * 返回单个配置项（供 Web API 读取）。
   * secret 类别的项通过此接口也可读取（用于内部），但 API 路由层应检查 category。
   */
  getItem(key: string): { key: string; value: unknown } | null {
    if (!this.cache.has(key)) return null;
    return { key, value: this.cache.get(key) };
  }

  /**
   * 加密写入一个机密配置值。
   * @param key       配置 key（必须已在 DEFAULT_CONFIGS 中声明为 secret 类别）
   * @param plaintext 明文值（字符串）
   * @param updatedBy 操作人
   */
  async setEncrypted(key: string, plaintext: string, updatedBy: string): Promise<Result<void, AppError>> {
    const encrypted = encryptValue(plaintext, this.encKey);
    return this.set(key, encrypted, updatedBy);
  }

  /**
   * 读取并解密一个机密配置值。
   * @returns 明文字符串；如果未设置或为空则返回 null
   */
  getDecrypted(key: string): string | null {
    const raw = this.cache.get(key);
    if (!raw || raw === '') return null;
    if (typeof raw !== 'string') return null;
    if (!isEncrypted(raw)) return raw; // 兼容明文（迁移期间）
    try {
      return decryptValue(raw, this.encKey);
    } catch (err) {
      log.error({ err, key }, '[config] 解密失败');
      return null;
    }
  }

  /**
   * 读取 llm.provider_keys 中某个 provider 的解密 API Key。
   * @returns API Key 字符串，或 null（未配置）
   */
  getProviderApiKey(providerId: string): string | null {
    const keys = this.cache.get('llm.provider_keys');
    if (!keys || typeof keys !== 'object') return null;
    const keysMap = keys as Record<string, string>;
    const encrypted = keysMap[providerId];
    if (!encrypted) return null;
    if (!isEncrypted(encrypted)) return encrypted; // 兼容明文
    try {
      return decryptValue(encrypted, this.encKey);
    } catch (err) {
      log.error({ err, providerId }, '[config] Provider API Key 解密失败');
      return null;
    }
  }

  /**
   * 设置某个 provider 的 API Key（加密存储在 llm.provider_keys 对象中）。
   */
  async setProviderApiKey(providerId: string, apiKey: string, updatedBy: string): Promise<Result<void, AppError>> {
    const current = (this.cache.get('llm.provider_keys') as Record<string, string>) ?? {};
    const encrypted = encryptValue(apiKey, this.encKey);
    const updated = { ...current, [providerId]: encrypted };
    return this.set('llm.provider_keys', updated, updatedBy);
  }

  /**
   * 删除某个 provider 的 API Key。
   */
  async deleteProviderApiKey(providerId: string, updatedBy: string): Promise<Result<void, AppError>> {
    const current = (this.cache.get('llm.provider_keys') as Record<string, string>) ?? {};
    const updated = { ...current };
    delete updated[providerId];
    return this.set('llm.provider_keys', updated, updatedBy);
  }

  /**
   * 判断某个 provider 是否已配置 API Key。
   */
  hasProviderApiKey(providerId: string): boolean {
    const keys = (this.cache.get('llm.provider_keys') as Record<string, string>) ?? {};
    return Boolean(keys[providerId]);
  }

  /**
   * 快捷方法：读取 Bot 消息前缀。
   */
  getBotPrefix(): string {
    return this.get<string>('bot.message_prefix', '[🎲 Dice&Soup]');
  }

  /**
   * 快捷方法：读取指令前缀（支持群级覆盖，暂只返回全局默认）。
   */
  getCommandPrefix(): string {
    return this.get<string>('command.prefix', '.');
  }
}
