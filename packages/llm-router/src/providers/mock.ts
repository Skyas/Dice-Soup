/**
 * @module providers/mock
 * MockProvider：测试/开发用。返回固定响应，不实际调用 LLM API。
 * 可在单元测试中替换真实 Provider，避免 API 费用和网络依赖。
 */

import type { ILLMProvider, ChatMessage, ModelId, ChatResponse } from '../types';

export interface MockProviderOptions {
  /**
   * 按 task 类型返回固定内容。
   * 不在 map 中的 task 返回 defaultResponse。
   */
  responses?: Record<string, string>;
  /** 全局默认响应，不设则返回固定 JSON */
  defaultResponse?: string;
  /** 模拟网络延迟（毫秒），默认 0 */
  delayMs?: number;
}

const DEFAULT_RESPONSE = JSON.stringify({
  result: 'mock_response',
  message: 'MockProvider：这是测试响应',
});

export class MockProvider implements ILLMProvider {
  readonly providerId = 'mock';

  private readonly options: Required<MockProviderOptions>;

  constructor(options: MockProviderOptions = {}) {
    this.options = {
      responses: options.responses ?? {},
      defaultResponse: options.defaultResponse ?? DEFAULT_RESPONSE,
      delayMs: options.delayMs ?? 0,
    };
  }

  async chat(
    _messages: ChatMessage[],
    _model: ModelId,
    _maxTokens?: number,
  ): Promise<{ content: string; usage?: ChatResponse['usage'] }> {
    if (this.options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    }

    // 从最后一条 user 消息里尝试判断 task（简单匹配，仅供测试使用）
    const lastUserMsg = [..._messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const content = this.options.responses[lastUserMsg] ?? this.options.defaultResponse;

    return {
      content,
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    };
  }
}
