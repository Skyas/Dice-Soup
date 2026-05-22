/**
 * @test llm-router
 * LLMRouter + Provider 集成测试。
 *
 * 测试层级：
 *   - Unit：MockProvider + LLMRouter 路由逻辑（始终运行，无网络）
 *   - Integration：DeepSeekProvider 真实调用（仅在 DEEPSEEK_API_KEY 存在时运行）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger } from '@dice-soup/logger';
import { MemoryRateLimiter } from '@dice-soup/security';
import { LLMRouter } from '../router';
import { MockProvider } from '../providers/mock';
import { DeepSeekProvider, DEEPSEEK_MODELS } from '../providers/deepseek';
import type { ILLMProvider } from '../types';

// ── 测试辅助 ─────────────────────────────────────────────────────────────────

function buildRouter(providers: Map<string, ILLMProvider>, defaultId: string): LLMRouter {
  return new LLMRouter({
    providers,
    defaultProviderId: defaultId,
    taskRouting: {
      soup_judge: DEEPSEEK_MODELS.FLASH,
      intent_parse: DEEPSEEK_MODELS.FLASH,
      summary: DEEPSEEK_MODELS.FLASH,
    },
    rateLimiter: new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 3 }),
    logger: createLogger({ module: 'test:llm-router' }),
  });
}

// ── MockProvider 单元测试 ─────────────────────────────────────────────────────

describe('MockProvider', () => {
  it('返回固定响应', async () => {
    const mock = new MockProvider({ defaultResponse: 'hello mock' });
    const result = await mock.chat([{ role: 'user', content: 'test' }], 'any-model');
    expect(result.content).toBe('hello mock');
    expect(result.usage).toBeDefined();
  });

  it('providerId 为 mock', () => {
    expect(new MockProvider().providerId).toBe('mock');
  });

  it('支持延迟模拟', async () => {
    const mock = new MockProvider({ delayMs: 50 });
    const start = Date.now();
    await mock.chat([{ role: 'user', content: 'x' }], 'model');
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

// ── LLMRouter 单元测试（Mock Provider） ──────────────────────────────────────

describe('LLMRouter (mock)', () => {
  let router: LLMRouter;

  beforeEach(() => {
    const providers = new Map<string, ILLMProvider>();
    providers.set('mock', new MockProvider({ defaultResponse: '{"ok":true}' }));
    router = buildRouter(providers, 'mock');
  });

  it('chat() 返回 ok 结果', async () => {
    const result = await router.chat({
      task: 'soup_judge',
      messages: [{ role: 'user', content: '是吗？' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('{"ok":true}');
      expect(result.value.taskType).toBe('soup_judge');
      expect(result.value.modelUsed).toBe(DEEPSEEK_MODELS.FLASH);
    }
  });

  it('限流：同一用户第 4 次请求被拒', async () => {
    const req = {
      task: 'soup_judge' as const,
      messages: [{ role: 'user' as const, content: 'test' }],
      userQQ: '123456789',
    };
    await router.chat(req);
    await router.chat(req);
    await router.chat(req);
    const result = await router.chat(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_RATE_LIMITED');
    }
  });

  it('outputSchema 验证通过', async () => {
    const { z } = await import('zod');
    const schema = z.object({ ok: z.boolean() });
    const result = await router.chat(
      { task: 'soup_judge', messages: [{ role: 'user', content: 'x' }] },
      { outputSchema: schema },
    );
    expect(result.ok).toBe(true);
  });

  it('outputSchema 验证失败时返回 LLM_OUTPUT_INVALID', async () => {
    const { z } = await import('zod');
    const schema = z.object({ name: z.string() });
    const result = await router.chat(
      { task: 'soup_judge', messages: [{ role: 'user', content: 'x' }] },
      { outputSchema: schema },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_OUTPUT_INVALID');
    }
  });

  it('updateTaskRouting() 热更新生效', () => {
    router.updateTaskRouting({ soup_judge: 'deepseek-v4-pro' });
    expect(router.getTaskRouting()['soup_judge']).toBe('deepseek-v4-pro');
  });

  it('getProviderIds() 返回已注册 Provider', () => {
    expect(router.getProviderIds()).toContain('mock');
  });

  it('非 JSON 响应 + outputSchema → LLM_OUTPUT_INVALID', async () => {
    const { z } = await import('zod');
    const providers = new Map<string, ILLMProvider>();
    providers.set('mock', new MockProvider({ defaultResponse: 'not json at all' }));
    const r = buildRouter(providers, 'mock');
    const result = await r.chat(
      { task: 'soup_judge', messages: [{ role: 'user', content: 'x' }] },
      { outputSchema: z.object({ x: z.number() }) },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('LLM_OUTPUT_INVALID');
  });
});

// ── DeepSeek 集成测试（有 API Key 时运行） ────────────────────────────────────

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;

describe.skipIf(!DEEPSEEK_KEY)('DeepSeekProvider (integration)', () => {
  let provider: DeepSeekProvider;

  beforeEach(() => {
    provider = new DeepSeekProvider(
      { apiKey: DEEPSEEK_KEY!, timeoutMs: 30_000 },
      createLogger({ module: 'test:deepseek' }),
    );
  });

  it('providerId 为 deepseek', () => {
    expect(provider.providerId).toBe('deepseek');
  });

  it('能成功调用 deepseek-v4-flash 并返回内容', async () => {
    const result = await provider.chat(
      [
        { role: 'system', content: '你是一个测试助手，请用中文简短回答。' },
        { role: 'user', content: '用一句话介绍自己。' },
      ],
      DEEPSEEK_MODELS.FLASH,
    );
    expect(result.content).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.usage).toBeDefined();
    expect(result.usage?.totalTokens).toBeGreaterThan(0);
  }, 40_000);

  it('LLMRouter 经 DeepSeek 完成完整调用链', async () => {
    const providers = new Map<string, ILLMProvider>();
    providers.set('deepseek', provider);
    const router = buildRouter(providers, 'deepseek');

    const result = await router.chat({
      task: 'soup_judge',
      messages: [
        { role: 'system', content: '你是一个测试助手。' },
        { role: 'user', content: '回答 OK 两个字。' },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.modelUsed).toBe(DEEPSEEK_MODELS.FLASH);
      expect(result.value.content.length).toBeGreaterThan(0);
    }
  }, 40_000);
});
