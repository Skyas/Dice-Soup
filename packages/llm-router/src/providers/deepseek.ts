/**
 * @module providers/deepseek
 * DeepSeekProvider：通过 OpenAI 兼容接口调用 DeepSeek API。
 *
 * 支持模型：
 *   - deepseek-v4-flash（快速经济，默认）
 *   - deepseek-v4-pro（旗舰性能）
 *
 * API Base URL：https://api.deepseek.com
 * 兼容格式：OpenAI ChatCompletions
 *
 * 注意：deepseek-chat / deepseek-reasoner 旧名将于 2026-07-24 停用，
 * 本实现直接使用新模型名，无需迁移。
 */

import OpenAI from 'openai';
import type { Logger } from '@dice-soup/logger';
import type { ILLMProvider, ChatMessage, ModelId, ChatResponse } from '../types';

export interface DeepSeekProviderOptions {
  apiKey: string;
  /** 请求超时（毫秒），默认 30000 */
  timeoutMs?: number;
  /** 最大重试次数，默认 2 */
  maxRetries?: number;
}

/** DeepSeek 支持的模型列表（用于日志和校验） */
export const DEEPSEEK_MODELS = {
  FLASH: 'deepseek-v4-flash',
  PRO: 'deepseek-v4-pro',
} as const;

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export class DeepSeekProvider implements ILLMProvider {
  readonly providerId = 'deepseek';

  private readonly client: OpenAI;
  private readonly log: Logger;

  constructor(options: DeepSeekProviderOptions, log: Logger) {
    this.log = log;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: DEEPSEEK_BASE_URL,
      timeout: options.timeoutMs ?? 30_000,
      maxRetries: options.maxRetries ?? 2,
    });
  }

  async chat(
    messages: ChatMessage[],
    model: ModelId,
    maxTokens?: number,
  ): Promise<{ content: string; usage?: ChatResponse['usage'] }> {
    this.log.debug(
      { model, messageCount: messages.length, maxTokens },
      '[deepseek] 发起 API 调用',
    );

    const completion = await this.client.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      // Phase 1 不启用 thinking mode，使用默认非思考模式（更快更便宜）
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error('DeepSeek API 返回空 choices');
    }

    const content = choice.message.content ?? '';
    const usage = completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : undefined;

    this.log.debug(
      { model, contentLength: content.length, usage },
      '[deepseek] API 调用成功',
    );

    return { content, usage };
  }
}
