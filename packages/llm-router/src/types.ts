/**
 * @module types
 * LLMRouter 核心类型定义。
 * TaskType：所有 LLM 任务分类（§5.9）
 * ChatRequest / ChatOptions / ChatResponse：路由器公共接口
 */

import type { ZodSchema } from 'zod';

// ─── 任务类型 ────────────────────────────────────────────────────────────────

/**
 * LLM 任务类型枚举。每种任务对应不同的 Prompt 模板和模型路由。
 * 新增任务类型时同步更新 config_items 的 llm.task_routing 默认配置。
 */
export type TaskType =
  | 'soup_judge'              // 海龟汤：是/否/无关/部分正确 判定
  | 'soup_restore'            // 海龟汤：还原判定
  | 'puzzle_extract_metadata' // 海龟汤：从题目提取 key_points 和 sensitive_words
  | 'intent_parse'            // 自然语言意图识别 → 指令白名单
  | 'dice_nl_parse'           // 自然语言 → 骰子表达式
  | 'game_arbitrate'          // 桌游：仲裁与播报
  | 'trpg_narrate'            // 跑团：叙事/场景描述
  | 'trpg_npc'                // 跑团：NPC 对话
  | 'summary';                // 游戏结束总结

// ─── 模型 ID ────────────────────────────────────────────────────────────────

/** 模型标识符，格式：provider:model-name，如 'deepseek-v4-flash'、'deepseek-v4-pro' */
export type ModelId = string;

// ─── 消息结构 ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ─── 请求与选项 ────────────────────────────────────────────────────────────────

export interface ChatRequest {
  /** 任务类型，决定默认模型路由 */
  task: TaskType;
  /** 对话消息列表 */
  messages: ChatMessage[];
  /**
   * 发起调用的用户 QQ 号，用于限流检查。
   * 不传则跳过用户级限流（如系统内部调用）。
   */
  userQQ?: string;
}

export interface ChatOptions {
  /**
   * 覆盖 task_routing 中的默认模型。
   * 例：某场景需要强制使用 deepseek-v4-pro。
   */
  prefer?: ModelId;
  /** 最大输出 token 数，不传使用 Provider 默认值 */
  maxTokens?: number;
  /**
   * 结构化输出 Schema（Zod）。
   * 传入时 LLMRouter 会对 LLM 返回内容做 JSON.parse + schema.parse 验证。
   * 验证失败返回 LLM_OUTPUT_INVALID 错误。
   */
  outputSchema?: ZodSchema<unknown>;
  /**
   * 输出泄露检测配置（§4.4.4 L4）。
   * Phase 1 不实现，接口占位。
   * @todo Phase 2 实现
   */
  leakDetect?: {
    /** 不允许出现在输出中的敏感内容（如 puzzle.truth） */
    forbiddenContent: string;
    /** 相似度阈值，超过则视为泄露 */
    threshold: number;
  };
}

// ─── 响应 ─────────────────────────────────────────────────────────────────────

export interface ChatResponse {
  /** LLM 返回的原始文本内容 */
  content: string;
  /** 实际使用的模型 ID */
  modelUsed: ModelId;
  /** 对应的任务类型 */
  taskType: TaskType;
  /** Token 用量（Provider 支持时返回） */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ─── Provider 接口 ────────────────────────────────────────────────────────────

export interface ILLMProvider {
  /** Provider 唯一标识，如 'deepseek'、'mock' */
  readonly providerId: string;
  /**
   * 发送对话请求，返回 LLM 原始文本响应。
   * 异常时抛出 Error（由 LLMRouter 统一捕获转换为 Result）。
   */
  chat(
    messages: ChatMessage[],
    model: ModelId,
    maxTokens?: number,
  ): Promise<{ content: string; usage?: ChatResponse['usage'] }>;
}
