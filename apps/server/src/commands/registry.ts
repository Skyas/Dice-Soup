/**
 * @module commands/registry
 * 指令注册表。统一存储所有 CommandHandler，支持按名称/别名查找。
 */

import { createLogger } from '@dice-soup/logger';
import type { CommandHandler } from './types';

const log = createLogger({ module: 'command-registry' });

export class CommandRegistry {
  /** 主名 → handler */
  private readonly handlers = new Map<string, CommandHandler>();
  /** 别名 → 主名 */
  private readonly aliases = new Map<string, string>();

  /**
   * 注册一个指令处理器。
   * 主名和所有别名均不得重复（重复视为编码错误，直接抛出）。
   */
  register(handler: CommandHandler): void {
    const { name, aliases = [] } = handler.meta;

    if (this.handlers.has(name)) {
      throw new Error(`[registry] 指令主名重复：${name}`);
    }
    this.handlers.set(name, handler);

    for (const alias of aliases) {
      if (this.aliases.has(alias)) {
        throw new Error(`[registry] 指令别名重复：${alias} (注册于 ${name})`);
      }
      this.aliases.set(alias, name);
    }

    log.debug({ name, aliases }, '[registry] 注册指令');
  }

  /**
   * 按名称查找处理器（支持别名）。
   * @returns handler | undefined
   */
  find(nameOrAlias: string): CommandHandler | undefined {
    const primaryName = this.aliases.get(nameOrAlias) ?? nameOrAlias;
    return this.handlers.get(primaryName);
  }

  /** 返回所有已注册的 handler（用于 .help 枚举） */
  all(): CommandHandler[] {
    return Array.from(this.handlers.values());
  }
}
