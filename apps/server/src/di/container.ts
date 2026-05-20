/**
 * @module di/container
 * tsyringe 依赖注入容器。
 * 所有单例服务在此注册；index.ts 调用 bootstrap() 后方可使用 container.resolve()。
 *
 * 注意：调用此模块前必须先 import 'reflect-metadata'（在 index.ts 首行完成）。
 */

import { container } from 'tsyringe';
import { OneBotClient } from '@dice-soup/onebot-client';
import { ConfigService } from '../config/config-service';
import { AuditService } from '../services/audit-service';
import { UserService } from '../services/user-service';
import { OneBotAdapter } from '../adapters/onebot-adapter';
import { CommandRouter } from '../commands/router';
import { getDatabase } from '../db/client';
import { createLogger } from '@dice-soup/logger';

const log = createLogger({ module: 'di' });

/** 全局 DI 容器（tsyringe 默认容器） */
export { container };

/**
 * 按依赖顺序构建并注册所有单例。
 * 保持"手工组装"风格：明确控制初始化顺序，避免循环依赖隐患。
 */
export async function bootstrap(): Promise<{
  configService: ConfigService;
  auditService: AuditService;
  userService: UserService;
  oneBotClient: OneBotClient;
  oneBotAdapter: OneBotAdapter;
  commandRouter: CommandRouter;
}> {
  log.info('bootstrapping DI container...');

  // ── 1. ConfigService（无依赖，最先初始化） ────────────────────────────────
  const configService = new ConfigService(getDatabase());
  await configService.init();
  container.registerInstance(ConfigService, configService);

  // ── 2. AuditService ───────────────────────────────────────────────────────
  const auditService = new AuditService(getDatabase());
  container.registerInstance(AuditService, auditService);

  // ── 3. UserService ────────────────────────────────────────────────────────
  const userService = new UserService(getDatabase());
  container.registerInstance(UserService, userService);

  // ── 4. OneBotClient（从配置读端口 + token） ───────────────────────────────
  // onebot.ws_port：非敏感，从 config_items 读（§1.11）
  const oneBotPort = configService.get<number>('onebot.ws_port') ?? 6700;
  // access_token：敏感配置，只走 .env（§5.2）
  const oneBotToken = process.env.ONEBOT_ACCESS_TOKEN ?? undefined;

  const oneBotClientLog = createLogger({ module: 'onebot-client' });
  const oneBotClient = new OneBotClient({
    wsPort: oneBotPort,
    accessToken: oneBotToken,
    heartbeatTimeoutMs: 45_000,
    apiTimeoutMs: 10_000,
  }, oneBotClientLog);
  container.registerInstance(OneBotClient, oneBotClient);

  // ── 5. OneBotAdapter ──────────────────────────────────────────────────────
  const oneBotAdapter = new OneBotAdapter(oneBotClient, configService, auditService);
  container.registerInstance(OneBotAdapter, oneBotAdapter);

  // ── 6. CommandRouter ──────────────────────────────────────────────────────
  const commandRouter = new CommandRouter(configService, userService, auditService);
  container.registerInstance(CommandRouter, commandRouter);

  log.info('DI container ready');

  return { configService, auditService, userService, oneBotClient, oneBotAdapter, commandRouter };
}
