/**
 * @module index
 * @dice-soup/llm-router 公开导出
 */

export * from './types';
export * from './router';
export { MockProvider } from './providers/mock';
export { DeepSeekProvider, DEEPSEEK_MODELS } from './providers/deepseek';
export type { MockProviderOptions } from './providers/mock';
export type { DeepSeekProviderOptions } from './providers/deepseek';
