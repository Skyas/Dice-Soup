/**
 * @module router
 * LLMRouter：多 Provider 管理、任务路由、限流、结构化输出验证。
 *
 * 设计原则（§5.9）：
 *   - 业务层通过 chat() 调用，不感知具体 Provider
 *   - 按 task_routing 配置决定使用哪个模型
 *   - 每用户每分钟 3 次限流（管理员免限流）
 *   - outputSchema 验证保证结构化输出安全
 *   - leakDetect Phase 2 实现，此处接口占位
 */

import type { Logger } from '@dice-soup/logger';
import type { IRateLimiter } from '@dice-soup/security';
import { buildLlmRateLimitKey } from '@dice-soup/security';
import {
  ok,
  err,
  createError,
  ErrorCodes,
  type Result,
  type AppError,
} from '@dice-soup/shared-types';
import type {
  ModelId,
  ChatRequest,
  ChatOptions,
  ChatResponse,
  ILLMProvider,
} from './types';

// ─── 常量 ────────────────────────────────────────────────────────────────────

/**
 * 管理员 QQ 号，免除 LLM 限流检查。
 * @todo Phase 2：从 config_items 读取，不在此硬编码
 */
const ADMIN_QQ = '897437055';

/** 任务路由找不到对应模型时的兜底模型 */
const FALLBACK_MODEL: ModelId = 'deepseek-v4-flash';

// ─── LLMRouter 配置 ───────────────────────────────────────────────────────────

export interface LLMRouterOptions {
  /**
   * 已注册的 Provider Map，key 为 providerId。
   * 必须至少包含一个 Provider。
   */
  providers: Map<string, ILLMProvider>;
  /**
   * 默认使用的 Provider ID。
   * 当 task_routing 中的模型不指定 provider 时使用此 Provider。
   */
  defaultProviderId: string;
  /**
   * 任务路由表（对应 config_items.llm.task_routing）。
   * 格式：{ task_type: model_id }
   * 运行时可通过 updateTaskRouting() 热更新。
   */
  taskRouting: Record<string, ModelId>;
  /** LLM 调用限流器（每用户每分钟 3 次） */
  rateLimiter: IRateLimiter;
  logger: Logger;
}

// ─── LLMRouter ────────────────────────────────────────────────────────────────

export class LLMRouter {
  private readonly providers: Map<string, ILLMProvider>;
  private readonly defaultProviderId: string;
  private taskRouting: Record<string, ModelId>;
  private readonly rateLimiter: IRateLimiter;
  private readonly log: Logger;

  constructor(options: LLMRouterOptions) {
    this.providers = options.providers;
    this.defaultProviderId = options.defaultProviderId;
    this.taskRouting = { ...options.taskRouting };
    this.rateLimiter = options.rateLimiter;
    this.log = options.logger;

    this.log.info(
      {
        providers: [...this.providers.keys()],
        defaultProvider: this.defaultProviderId,
        taskCount: Object.keys(this.taskRouting).length,
      },
      '[llm-router] 初始化完成',
    );
  }

  // ── 公共接口 ───────────────────────────────────────────────────────────────

  /**
   * 发送 LLM 对话请求。
   *
   * 流程：
   *   1. 限流检查（管理员跳过）
   *   2. 确定目标模型（prefer > task_routing > fallback）
   *   3. 选择 Provider
   *   4. 调用 Provider
   *   5. outputSchema 验证（如传入）
   *   6. 返回 Result<ChatResponse, AppError>
   */
  async chat(
    request: ChatRequest,
    opts: ChatOptions = {},
  ): Promise<Result<ChatResponse, AppError>> {
    // ── 1. 限流检查 ──────────────────────────────────────────────────────────
    if (request.userQQ && request.userQQ !== ADMIN_QQ) {
      const key = buildLlmRateLimitKey(request.userQQ);
      const limitResult = this.rateLimiter.check(key);

      if (!limitResult.allowed) {
        const resetInSeconds = Math.ceil((limitResult.resetAt - Date.now()) / 1000);
        this.log.warn(
          { userQQ: request.userQQ, task: request.task, resetInSeconds },
          '[llm-router] 用户 LLM 调用超出限流',
        );
        return err(
          createError(
            ErrorCodes.LLM_RATE_LIMITED,
            `LLM 调用过于频繁，请 ${resetInSeconds} 秒后重试`,
            { resetInSeconds, current: limitResult.current },
          ),
        );
      }
    }

    // ── 2. 确定目标模型 ──────────────────────────────────────────────────────
    const model = opts.prefer ?? this.taskRouting[request.task] ?? FALLBACK_MODEL;

    // ── 3. 选择 Provider ─────────────────────────────────────────────────────
    const provider = this.providers.get(this.defaultProviderId);
    if (!provider) {
      this.log.error(
        { defaultProviderId: this.defaultProviderId, available: [...this.providers.keys()] },
        '[llm-router] 默认 Provider 不存在',
      );
      return err(
        createError(
          ErrorCodes.LLM_PROVIDER_FAILED,
          `Provider "${this.defaultProviderId}" 未注册`,
        ),
      );
    }

    // ── 4. 调用 Provider ─────────────────────────────────────────────────────
    this.log.info(
      {
        task: request.task,
        model,
        provider: provider.providerId,
        userQQ: request.userQQ,
        messageCount: request.messages.length,
      },
      '[llm-router] 发起 LLM 调用',
    );

    let rawContent: string;
    let usage: ChatResponse['usage'];

    try {
      const result = await provider.chat(request.messages, model, opts.maxTokens);
      rawContent = result.content;
      usage = result.usage;
    } catch (callErr) {
      const errMsg = String(callErr);
      this.log.error(
        { err: callErr, task: request.task, model, userQQ: request.userQQ },
        '[llm-router] Provider 调用失败',
      );

      // 区分超时和其他失败
      if (errMsg.includes('timeout') || errMsg.includes('TIMEOUT') || errMsg.includes('timed out')) {
        return err(
          createError(ErrorCodes.LLM_TIMEOUT, `LLM 调用超时（task=${request.task}）`, {
            model,
            task: request.task,
          }),
        );
      }

      return err(
        createError(
          ErrorCodes.LLM_PROVIDER_FAILED,
          `LLM 调用失败（task=${request.task}）: ${errMsg}`,
          { model, task: request.task },
          callErr,
        ),
      );
    }

    // ── 5. outputSchema 验证 ─────────────────────────────────────────────────
    if (opts.outputSchema) {
      // 尝试 JSON 解析
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawContent);
      } catch (_parseErr) {
        this.log.warn(
          { task: request.task, model, contentPreview: rawContent.slice(0, 200) },
          '[llm-router] LLM 输出不是合法 JSON',
        );
        return err(
          createError(
            ErrorCodes.LLM_OUTPUT_INVALID,
            `LLM 输出不是合法 JSON（task=${request.task}）`,
            { contentPreview: rawContent.slice(0, 200) },
          ),
        );
      }

      // Zod schema 验证
      const validation = opts.outputSchema.safeParse(parsed);
      if (!validation.success) {
        this.log.warn(
          { task: request.task, model, issues: validation.error.issues },
          '[llm-router] LLM 输出不符合 Schema',
        );
        return err(
          createError(
            ErrorCodes.LLM_OUTPUT_INVALID,
            `LLM 输出不符合预期格式（task=${request.task}）`,
            { issues: validation.error.issues },
          ),
        );
      }
    }

    // ── 6. leakDetect（Phase 2 实现，此处跳过） ──────────────────────────────
    if (opts.leakDetect) {
      // TODO Phase 2：实现输出泄露检测（§4.4.4 L4）
      // 当前占位：不做检测，直接放行
      this.log.debug(
        { task: request.task },
        '[llm-router] leakDetect 未实现（Phase 2），已跳过',
      );
    }

    this.log.info(
      {
        task: request.task,
        model,
        contentLength: rawContent.length,
        usage,
      },
      '[llm-router] LLM 调用成功',
    );

    return ok({
      content: rawContent,
      modelUsed: model,
      taskType: request.task,
      usage,
    });
  }

  // ── 热更新 ────────────────────────────────────────────────────────────────

  /**
   * 热更新任务路由表。
   * 由 ConfigService 的 change:llm.task_routing 事件触发。
   */
  updateTaskRouting(routing: Record<string, ModelId>): void {
    this.taskRouting = { ...routing };
    this.log.info(
      { taskCount: Object.keys(routing).length },
      '[llm-router] 任务路由表已热更新',
    );
  }

  // ── 状态查询 ──────────────────────────────────────────────────────────────

  /** 返回当前已注册的 Provider 列表（用于健康检查） */
  getProviderIds(): string[] {
    return [...this.providers.keys()];
  }

  /** 返回当前任务路由表快照 */
  getTaskRouting(): Record<string, ModelId> {
    return { ...this.taskRouting };
  }
}
