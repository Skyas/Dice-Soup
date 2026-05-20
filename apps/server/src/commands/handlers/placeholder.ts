/**
 * @module commands/handlers/placeholder
 * 占位指令工厂。
 *
 * Phase 1 中所有未开放的游戏指令均用此工厂生成，
 * 用户触发后返回"敬请期待·将于第 X 大阶段开放"提示。
 */

import { createLogger } from '@dice-soup/logger';
import type { CommandContext, CommandHandler, CommandMeta } from '../types';

const log = createLogger({ module: 'cmd:placeholder' });

const PHASE_NAMES: Record<number, string> = {
  2: '第二大阶段（海龟汤）',
  3: '第三大阶段（骰子 + 桌游）',
  4: '第四大阶段（CoC 7th 跑团）',
  5: '第五大阶段（桌游工坊）',
};

export class PlaceholderHandler implements CommandHandler {
  readonly meta: CommandMeta;
  private readonly featureName: string;
  private readonly phase: number;

  constructor(meta: CommandMeta, featureName: string, phase: number) {
    this.meta = meta;
    this.featureName = featureName;
    this.phase = phase;
  }

  async execute(ctx: CommandContext): Promise<void> {
    const phaseName = PHASE_NAMES[this.phase] ?? `第 ${this.phase} 大阶段`;
    log.info(
      { senderQQ: ctx.senderQQ, command: this.meta.name },
      `[placeholder] 触发占位指令 ${this.meta.name}`,
    );
    await ctx.reply(
      `⏳ ${this.featureName} 将于 ${phaseName} 开放，敬请期待！`,
    );
  }

  /**
   * 快速创建占位指令。
   * @param name         指令主名
   * @param aliases      别名列表
   * @param featureName  功能名称（用于提示文本）
   * @param phase        计划开放的阶段编号
   */
  static make(
    name: string,
    aliases: string[],
    featureName: string,
    phase: number,
  ): PlaceholderHandler {
    const meta: CommandMeta = {
      name,
      aliases,
      action: 'write',
      scope: 'session',
      channel: 'group_only',  // 游戏指令只在群聊中有意义（§5.7）
      requiredRole: 'guest',
      nlAllowed: false,
      description: `${featureName}（将于第${phase}阶段开放）`,
      availableInPhase: phase,
    };
    return new PlaceholderHandler(meta, featureName, phase);
  }
}
