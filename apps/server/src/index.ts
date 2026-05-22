/**
 * @module index
 * Dice&Soup 主程序入口。
 *
 * 必须是文件第一行：import 'reflect-metadata'（tsyringe DI 装饰器需要）
 *
 * 启动顺序：
 *   1. 加载环境变量
 *   2. 初始化数据库（migration）
 *   3. Seed 初始管理员
 *   4. Bootstrap DI 容器（ConfigService → AuditService → UserService → OneBotClient → ...）
 *   5. 构建 Fastify 应用
 *   6. 启动 HTTP 服务器
 *   7. 启动 OneBot WebSocket 服务端
 *   8. 注册消息处理器（CommandRouter + JailbreakDetector）
 *   9. 注册进程信号处理（优雅退出）
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';

// 尽早加载 .env，在所有其他 import 中 process.env 就绪
dotenv.config();

import { createLogger } from '@dice-soup/logger';
import { JailbreakDetector } from '@dice-soup/security';
import { initDatabase } from './db/client';
import { seedInitialAdmin } from './db/seed';
import { bootstrap } from './di/container';
import { buildApp } from './app';

const log = createLogger({ module: 'main' });

async function main(): Promise<void> {
  const isDev = process.env.NODE_ENV !== 'production';
  const httpPort = parseInt(process.env.HTTP_PORT ?? '3000', 10);

  log.info(
    { nodeEnv: process.env.NODE_ENV ?? 'development', httpPort },
    '🎲 Dice&Soup 启动中...',
  );

  // ── 1. 数据库初始化 ──────────────────────────────────────────────────────

  const dbPath = process.env.DB_PATH ?? './dice-soup.db';
  log.info({ dbPath }, '[startup] 初始化数据库...');
  await initDatabase(dbPath);
  log.info('[startup] 数据库就绪');

  // ── 2. Seed 初始管理员 ───────────────────────────────────────────────────

  await seedInitialAdmin();

  // ── 3. Bootstrap DI 容器 ─────────────────────────────────────────────────

  const { configService, auditService, oneBotAdapter, commandRouter, soupService, llmRouter } =
    await bootstrap();

  // ── 4. 越狱检测器（从配置读关键词） ─────────────────────────────────────

  const jailbreakDetector = new JailbreakDetector();
  // 从两个独立 config key 读取中/英文越狱关键词（§1.11）
  const jailbreakZh = configService.get<string[]>('security.jailbreak_keywords_zh') ?? [];
  const jailbreakEn = configService.get<string[]>('security.jailbreak_keywords_en') ?? [];
  if (jailbreakZh.length > 0 || jailbreakEn.length > 0) {
    jailbreakDetector.updateKeywords(jailbreakZh, jailbreakEn);
  }
  // 配置变更时热更新
  const reloadJailbreakKeywords = (): void => {
    const zh = configService.get<string[]>('security.jailbreak_keywords_zh') ?? [];
    const en = configService.get<string[]>('security.jailbreak_keywords_en') ?? [];
    jailbreakDetector.updateKeywords(zh, en);
    log.info({ zh: zh.length, en: en.length }, '[startup] 越狱关键词已热更新');
  };
  configService.on('change:security.jailbreak_keywords_zh', reloadJailbreakKeywords);
  configService.on('change:security.jailbreak_keywords_en', reloadJailbreakKeywords);

  // ── 5. 构建 Fastify 应用 ─────────────────────────────────────────────────

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    log.error('[startup] JWT_SECRET 未设置，无法启动 Web 管理后台');
    process.exit(1);
  }

  const app = await buildApp({
    configService,
    auditService,
    oneBotAdapter,
    soupService,
    llmRouter,
    jwtSecret,
    isDev,
    port: httpPort,
  });

  // ── 6. 启动 HTTP 服务器 ──────────────────────────────────────────────────

  await app.listen({ port: httpPort, host: '0.0.0.0' });
  log.info({ port: httpPort }, `[startup] HTTP 服务器已启动：http://0.0.0.0:${httpPort}`);

  // ── 7. 启动 OneBot WebSocket 服务端 ─────────────────────────────────────

  const startResult = await oneBotAdapter.start();
  if (!startResult.ok) {
    log.error({ error: startResult.error }, '[startup] OneBot Adapter 启动失败');
    process.exit(1);
  }

  // OneBot 注入到 CommandRouter（解决循环依赖）
  commandRouter.setAdapter(oneBotAdapter);

  // ── 8. 消息处理器注册 ────────────────────────────────────────────────────

  oneBotAdapter.on('message', async (message) => {
    // L5 越狱检测（仅对非指令自然语言消息）
    const text = message.segments
      .filter((s): s is { type: 'text'; text: string } => s.type === 'text')
      .map((s) => s.text)
      .join('');

    const isCommand = text.trim().startsWith(configService.getCommandPrefix());

    if (!isCommand) {
      const verdict = jailbreakDetector.check(text, {
        userQQ: message.channel.type === 'group' ? message.channel.userId : message.channel.userId,
        channel: message.channel.type === 'group' ? message.channel.groupId : 'private',
      });

      if (verdict.suspicious) {
        const qqId = message.channel.type === 'group'
          ? message.channel.userId
          : message.channel.userId;
        const sessionId = undefined; // Phase 1 无会话
        const channelId = message.channel.type === 'group' ? message.channel.groupId : 'private';

        await auditService.logJailbreak(qqId, text, verdict.matched, sessionId, channelId);
        log.warn(
          { qqId, pattern: verdict.matched, category: verdict.category },
          '[security] 越狱尝试已拦截',
        );
        // Phase 1：静默拦截（不回复，避免透露防御细节）
        return;
      }
    }

    // 指令路由
    const handled = await commandRouter.handle(message);
    if (!handled) {
      // 非指令、非越狱：Phase 1 不做 NL 路由，静默忽略
      log.debug(
        { channel: message.channel },
        '[router] 非指令消息，Phase 1 静默忽略',
      );
    }
  });

  // OneBot 连接事件日志
  oneBotAdapter.on('connect', () => {
    log.info('✅ NapCat 已连接！Bot 上线');
  });
  oneBotAdapter.on('disconnect', () => {
    log.warn('⚠️ NapCat 连接断开，等待重连...');
  });

  // ── 9. 优雅退出 ──────────────────────────────────────────────────────────

  const shutdown = async (signal: string) => {
    log.info({ signal }, '[shutdown] 收到退出信号，优雅关闭...');
    try {
      await oneBotAdapter.stop();
      await app.close();
      log.info('[shutdown] 服务已关闭');
      process.exit(0);
    } catch (err) {
      log.error({ err }, '[shutdown] 关闭时出错');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 未捕获异常兜底（记录日志，不直接退出——让进程管理器决定）
  process.on('uncaughtException', (err) => {
    log.fatal({ err }, '[fatal] 未捕获异常');
  });
  process.on('unhandledRejection', (reason) => {
    log.error({ reason }, '[fatal] 未处理的 Promise rejection');
  });

  log.info('🎲 Dice&Soup 启动完成！等待 NapCat 连接...');
}

main().catch((err) => {
  console.error('启动失败：', err);
  process.exit(1);
});
