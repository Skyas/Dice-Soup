/**
 * @module di/container
 * tsyringe 依赖注入容器。
 * 所有单例服务在此注册；index.ts 调用 bootstrap() 后方可使用 container.resolve()。
 *
 * 注意：调用此模块前必须先 import 'reflect-metadata'（在 index.ts 首行完成）。
 */

import { container } from 'tsyringe';
import { OneBotClient } from '@dice-soup/onebot-client';
import { MemoryRateLimiter } from '@dice-soup/security';
import {
  LLMRouter,
  MockProvider,
  DeepSeekProvider,
  DEEPSEEK_MODELS,
} from '@dice-soup/llm-router';
import { ConfigService } from '../config/config-service';
import { AuditService } from '../services/audit-service';
import { UserService } from '../services/user-service';
import { SoupService } from '../services/soup-service';
import { SessionManager } from '../services/session-manager';
import { UndercoverService } from '../services/undercover-service';
import { OneBotAdapter } from '../adapters/onebot-adapter';
import { UndercoverHandler } from '../commands/handlers/undercover';
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
  soupService: SoupService;
  sessionManager: SessionManager;
  undercoverService: UndercoverService;
  oneBotClient: OneBotClient;
  oneBotAdapter: OneBotAdapter;
  commandRouter: CommandRouter;
  llmRouter: LLMRouter;
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

  // ── 3b. SoupService ───────────────────────────────────────────────────────
  const soupService = new SoupService(getDatabase());
  container.registerInstance(SoupService, soupService);

  // ── 3c. SessionManager ────────────────────────────────────────────────────
  const sessionManager = new SessionManager(getDatabase());
  container.registerInstance(SessionManager, sessionManager);

  // ── 4. OneBotClient（从配置读端口 + token） ───────────────────────────────
  // onebot.ws_port：非敏感，从 config_items 读（§1.11）
  const oneBotPort = configService.get<number>('onebot.ws_port') ?? 6700;
  // access_token：优先读 DB 加密存储，回退到 .env（向后兼容）
  const oneBotToken =
    configService.getDecrypted('onebot.access_token') ??
    process.env.ONEBOT_ACCESS_TOKEN ??
    undefined;

  // heartbeat_timeout_ms 从 config_items 读取（§1.11）
  // TODO: 修复之前硬编码 45_000 的问题，改为从配置读取
  const heartbeatTimeoutMs = configService.get<number>('onebot.heartbeat_timeout_ms') ?? 60_000;

  const oneBotClientLog = createLogger({ module: 'onebot-client' });
  const oneBotClient = new OneBotClient({
    wsPort: oneBotPort,
    accessToken: oneBotToken,
    heartbeatTimeoutMs,
    apiTimeoutMs: configService.get<number>('onebot.api_timeout_ms') ?? 10_000,
  }, oneBotClientLog);
  container.registerInstance(OneBotClient, oneBotClient);

  // ── 5. OneBotAdapter ──────────────────────────────────────────────────────
  const oneBotAdapter = new OneBotAdapter(oneBotClient, configService, auditService);
  container.registerInstance(OneBotAdapter, oneBotAdapter);

  // ── 6. CommandRouter ──────────────────────────────────────────────────────
  const commandRouter = new CommandRouter(configService, userService, auditService);
  container.registerInstance(CommandRouter, commandRouter);

  // ── 7. LLMRouter ─────────────────────────────────────────────────────────
  const llmRouter = buildLLMRouter(configService);
  container.registerInstance(LLMRouter, llmRouter);

  // 监听配置热更新，同步更新任务路由表
  configService.on('change:llm.task_routing', () => {
    const routing = configService.get<Record<string, string>>('llm.task_routing') ?? {};
    llmRouter.updateTaskRouting(routing);
    log.info('[di] llm.task_routing 热更新已同步到 LLMRouter');
  });

  // ── 8a. UndercoverService + UndercoverHandler ─────────────────────────────
  const undercoverService = new UndercoverService(getDatabase());
  await undercoverService.seedWordPairs();

  const undercoverHandler = new UndercoverHandler(sessionManager, undercoverService);
  undercoverHandler.setAdapter(oneBotAdapter);

  // ── 注入游戏服务到 CommandRouter ──────────────────────────────────────────
  commandRouter.setGameServices(sessionManager, soupService, llmRouter);
  commandRouter.setBoardGameHandlers(undercoverHandler);

  log.info('DI container ready');

  return {
    configService,
    auditService,
    userService,
    soupService,
    sessionManager,
    undercoverService,
    oneBotClient,
    oneBotAdapter,
    commandRouter,
    llmRouter,
  };
}

// ─── LLMRouter 构建辅助 ───────────────────────────────────────────────────────

function buildLLMRouter(configService: ConfigService): LLMRouter {
  const routerLog = createLogger({ module: 'llm-router' });
  const providers = new Map<string, import('@dice-soup/llm-router').ILLMProvider>();

  // MockProvider：始终注册，用于测试和降级
  providers.set('mock', new MockProvider({
    defaultResponse: JSON.stringify({ result: 'mock', message: '这是 Mock 响应，LLM 未配置' }),
  }));

  // 动态读取已注册的 provider 列表（来自 llm.providers 配置）
  const providerList = configService.getOptional<Array<{
    id: string; name: string; baseUrl: string; models: string[]; enabled: boolean;
  }>>('llm.providers') ?? [];

  let registeredCount = 0;
  for (const p of providerList) {
    if (!p.enabled) continue;

    // 检查 API Key 是否已配置（DB 或 env），未配置则跳过
    const hasKey =
      configService.hasProviderApiKey(p.id) ||
      !!process.env[p.id.toUpperCase() + '_API_KEY'] ||
      (p.id === 'deepseek' && !!process.env.DEEPSEEK_API_KEY);

    if (!hasKey) {
      log.warn({ providerId: p.id }, '[di] Provider API Key 未配置，跳过注册');
      continue;
    }

    // 目前只支持 DeepSeek（OpenAI 兼容），其他 provider 留 TODO
    if (p.id === 'deepseek') {
      const deepseekLog = createLogger({ module: 'deepseek-provider' });
      // getApiKey 在每次 chat() 调用时执行，支持 API Key 热更新
      providers.set('deepseek', new DeepSeekProvider({
        getApiKey: () =>
          configService.getProviderApiKey('deepseek') ??
          process.env.DEEPSEEK_API_KEY ??
          '',
      }, deepseekLog));
      log.info('[di] DeepSeek Provider 已注册（来源：' +
        (configService.hasProviderApiKey('deepseek') ? 'DB' : 'env') + '，支持热更新）');
      registeredCount++;
    }
    // TODO: 其他厂商 Provider 注册（OpenAI、Qwen、Anthropic 等）
  }

  // 如果没有任何 provider 从 llm.providers 注册，尝试直接读 env var（纯 env 部署兼容）
  if (registeredCount === 0) {
    if (process.env.DEEPSEEK_API_KEY) {
      const deepseekLog = createLogger({ module: 'deepseek-provider' });
      providers.set('deepseek', new DeepSeekProvider({
        getApiKey: () => process.env.DEEPSEEK_API_KEY ?? '',
      }, deepseekLog));
      log.info('[di] DeepSeek Provider 已注册（来源：env fallback）');
    } else {
      log.warn('[di] 无可用 LLM Provider，将使用 Mock Provider');
    }
  }

  // 确定默认 Provider（优先读 config，回退到 deepseek/mock）
  const configuredDefault = configService.getOptional<string>('llm.default_provider');
  const deepseekApiKey = providers.has('deepseek');
  const defaultProviderId = configuredDefault ?? (deepseekApiKey ? 'deepseek' : 'mock');

  // 任务路由配置
  const taskRouting = configService.get<Record<string, string>>('llm.task_routing') ?? {
    soup_judge:     DEEPSEEK_MODELS.FLASH,
    soup_restore:   DEEPSEEK_MODELS.FLASH,
    intent_parse:   DEEPSEEK_MODELS.FLASH,
    dice_nl_parse:  DEEPSEEK_MODELS.FLASH,
    game_arbitrate: DEEPSEEK_MODELS.FLASH,
    trpg_narrate:   DEEPSEEK_MODELS.FLASH,
    trpg_npc:       DEEPSEEK_MODELS.FLASH,
    summary:        DEEPSEEK_MODELS.FLASH,
  };

  // LLM 限流器：每用户每分钟 3 次（§4.4.7）
  const llmRateLimiter = new MemoryRateLimiter({
    windowMs: 60_000,
    maxRequests: 3,
  });

  log.info(
    { defaultProvider: defaultProviderId, providerCount: providers.size, taskCount: Object.keys(taskRouting).length },
    '[di] LLMRouter 构建完成',
  );

  return new LLMRouter({
    providers,
    defaultProviderId,
    taskRouting,
    rateLimiter: llmRateLimiter,
    logger: routerLog,
  });
}
