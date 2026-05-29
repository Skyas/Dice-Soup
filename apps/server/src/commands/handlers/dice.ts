/**
 * @module commands/handlers/dice
 * 骰子指令处理器（第三大阶段）。
 *
 * 指令：
 *   .r <expr>        通用骰子表达式
 *   .rh <expr>       暗骰（结果私聊）
 *   .ra <技能>[技能值] CoC 技能检定
 *   .rh <expr>       暗骰版 ra
 *   .sc <s>/<f>      CoC 理智检定
 *   .en <技能>        CoC 技能成长
 *   .coc [N]         CoC 随机制卡
 *   .setcoc <0-5>    设置 CoC 房规
 *   .set <system>    切换默认规则系统
 */

import { createLogger } from '@dice-soup/logger';
import { DiceEngine, formatRollResult } from '@dice-soup/dice-engine';
import { skillCheck, sanCheck, growthCheck, generateCharacter, validateHouseRule } from '@dice-soup/rule-coc7';
import { sw25PowerRoll } from '@dice-soup/rule-sw25';
import type { CommandContext, CommandHandler, CommandMeta } from '../types';

const log = createLogger({ module: 'cmd:dice' });

const engine = new DiceEngine();

/** 每个群的 CoC 房规（内存缓存，重启重置；Phase 4 迁入 DB） */
const groupHouseRules = new Map<string, number>();

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function getHouseRule(ctx: CommandContext): number {
  const key = ctx.groupId ?? 'private';
  return groupHouseRules.get(key) ?? 0;
}

function setHouseRule(ctx: CommandContext, n: number): void {
  const key = ctx.groupId ?? 'private';
  groupHouseRules.set(key, n);
}

// ── 通用骰子 .r ───────────────────────────────────────────────────────────────

export class RollHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'r',
    aliases: ['roll'],
    action: 'read',
    scope: 'session',
    channel: 'both',
    requiredRole: 'guest',
    nlAllowed: false,
    description: '通用骰子表达式，如 .r 3d6+2 / .r r30@10+4',
    usage: '.r <表达式>',
  };

  async execute(ctx: CommandContext): Promise<void> {
    const expr = ctx.rawArgs.trim();
    if (!expr) {
      await ctx.reply('用法：.r <骰子表达式>，例如 .r 3d6+2 / .r 4d6kh3 / .r r30@10+4');
      return;
    }

    log.info({ senderQQ: ctx.senderQQ, expr }, '[dice] .r 投骰');

    // 检测是否为威力骰表达式（r<N> 或 K<N>）
    if (/^[rKk]\d/.test(expr)) {
      await handlePowerRollExpr(expr, ctx, false);
      return;
    }

    const result = engine.roll(expr);
    if (!result.ok) {
      await ctx.reply(`❌ 骰子表达式无效：${result.error.message}`);
      return;
    }

    const output = formatRollResult(result.value, expr);
    await ctx.reply(`[🎲 ${ctx.senderName}]\n${output}`);
  }
}

// ── 暗骰 .rh ─────────────────────────────────────────────────────────────────

export class HiddenRollHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'rh',
    aliases: [],
    action: 'read',
    scope: 'session',
    channel: 'both',
    requiredRole: 'guest',
    nlAllowed: false,
    description: '暗骰：结果不在群聊显示，通过私聊发给投骰者',
    usage: '.rh <表达式>',
  };

  async execute(ctx: CommandContext): Promise<void> {
    const expr = ctx.rawArgs.trim();
    if (!expr) {
      await ctx.reply('用法：.rh <骰子表达式>');
      return;
    }

    const result = engine.roll(expr);
    if (!result.ok) {
      await ctx.reply(`❌ 骰子表达式无效：${result.error.message}`);
      return;
    }

    // 群聊中：告知已发暗骰；私聊中：直接回复
    if (ctx.groupId) {
      await ctx.reply(`🎲 ${ctx.senderName} 进行了暗骰（结果已私聊发送）`);
      await ctx.replyPrivate(`[暗骰]\n${formatRollResult(result.value, expr)}`);
    } else {
      const output = formatRollResult(result.value, expr);
      await ctx.reply(`[🎲 ${ctx.senderName}]\n${output}`);
    }
  }
}

// ── CoC 技能检定 .ra ──────────────────────────────────────────────────────────

export class CocRollHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'ra',
    aliases: ['rc'],
    action: 'read',
    scope: 'session',
    channel: 'both',
    requiredRole: 'guest',
    nlAllowed: false,
    description: 'CoC 技能检定，如 .ra 侦查70 或 .ra 70',
    usage: '.ra <技能名>[技能值] 或 .ra <技能值>',
  };

  async execute(ctx: CommandContext): Promise<void> {
    const args = ctx.rawArgs.trim();
    if (!args) {
      await ctx.reply('用法：.ra <技能名>[技能值]\n例如：.ra 侦查70 / .ra 70');
      return;
    }

    // 解析技能名和技能值
    const match = args.match(/^([^0-9]*)(\d+)$/);
    if (!match) {
      await ctx.reply(`❌ 格式错误：${args}\n用法：.ra <技能名><技能值>，如 .ra 侦查70`);
      return;
    }

    const skillName = match[1]!.trim() || '技能';
    const skillValue = parseInt(match[2]!, 10);
    const houseRule = getHouseRule(ctx);

    // 投 1d100
    const rollResult = engine.roll('1d100');
    if (!rollResult.ok) {
      await ctx.reply('❌ 内部错误：投骰失败');
      return;
    }
    const rolled = rollResult.value.total;

    try {
      const check = skillCheck({
        rolled,
        skillValue,
        houseRule: validateHouseRule(houseRule),
        skillName,
        playerName: ctx.senderName,
      });
      log.info({ senderQQ: ctx.senderQQ, skillName, skillValue, rolled, level: check.level }, '[dice] CoC 检定');
      await ctx.reply(check.detail);
    } catch (e) {
      await ctx.reply(`❌ ${(e as Error).message}`);
    }
  }
}

// ── CoC 理智检定 .sc ──────────────────────────────────────────────────────────

export class SanCheckHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'sc',
    aliases: [],
    action: 'read',
    scope: 'session',
    channel: 'both',
    requiredRole: 'guest',
    nlAllowed: false,
    description: 'CoC 理智检定，如 .sc 1/1d6 或 .sc 1/1d6 --cap=3 --half',
    usage: '.sc <成功损失>/<失败损失> [--cap=N] [--half]',
  };

  async execute(ctx: CommandContext): Promise<void> {
    const args = ctx.rawArgs.trim();
    const slashIdx = args.indexOf('/');
    if (slashIdx === -1) {
      await ctx.reply('用法：.sc <成功损失>/<失败损失>，例如 .sc 1/1d6');
      return;
    }

    // 解析 --cap 和 --half
    const capMatch = args.match(/--cap=(\d+)/);
    const half = args.includes('--half');
    const cap = capMatch ? parseInt(capMatch[1]!, 10) : undefined;

    // 去除 flag 后的纯表达式部分
    const exprPart = args.replace(/--\S+/g, '').trim();
    const parts = exprPart.split('/');
    if (parts.length !== 2) {
      await ctx.reply('用法：.sc <成功损失>/<失败损失>');
      return;
    }

    const successExpr = parts[0]!.trim();
    const failureExpr = parts[1]!.trim();

    // 投 1d100
    const roll1 = engine.roll('1d100');
    if (!roll1.ok) { await ctx.reply('❌ 内部错误'); return; }
    const rolled = roll1.value.total;

    // 判断成功/失败（暂不接入角色卡，使用固定 SAN 值占位）
    // TODO: Phase 4 接入角色卡后从 DB 读取真实 SAN 值
    await ctx.reply('⚠️ 注意：.sc 指令需要角色卡 SAN 值。当前版本请附带当前 SAN 值，如：.sc 1/1d6 san=60\n（角色卡系统将于第四大阶段完善）');

    // 简化版：直接用 san 参数
    const sanMatch = ctx.rawArgs.match(/san=(\d+)/i);
    if (!sanMatch) return;

    const sanValue = parseInt(sanMatch[1]!, 10);
    const successRoll = engine.roll(successExpr || '0');
    const failureRoll = engine.roll(failureExpr || '0');
    if (!successRoll.ok || !failureRoll.ok) { await ctx.reply('❌ 损失值表达式无效'); return; }

    try {
      const result = sanCheck({
        rolled,
        sanValue,
        successLoss: successRoll.value.total,
        failureLoss: failureRoll.value.total,
        cap,
        half,
        playerName: ctx.senderName,
      });
      await ctx.reply(result.detail);
    } catch (e) {
      await ctx.reply(`❌ ${(e as Error).message}`);
    }
  }
}

// ── CoC 技能成长 .en ──────────────────────────────────────────────────────────

export class GrowthHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'en',
    aliases: [],
    action: 'write',
    scope: 'personal',
    channel: 'both',
    requiredRole: 'guest',
    nlAllowed: false,
    description: 'CoC 技能成长检定，如 .en 侦查70',
    usage: '.en <技能名><当前技能值>',
  };

  async execute(ctx: CommandContext): Promise<void> {
    const args = ctx.rawArgs.trim();
    const match = args.match(/^([^0-9]*)(\d+)$/);
    if (!match) {
      await ctx.reply('用法：.en <技能名><当前技能值>，例如 .en 侦查70');
      return;
    }

    const skillName = match[1]!.trim() || '技能';
    const currentValue = parseInt(match[2]!, 10);

    const roll1 = engine.roll('1d100');
    const gainRoll = engine.roll('1d10');
    if (!roll1.ok || !gainRoll.ok) { await ctx.reply('❌ 内部错误'); return; }

    const result = growthCheck({
      skillName,
      currentValue,
      rolled: roll1.value.total,
      gainRolled: gainRoll.value.total,
    });

    await ctx.reply(`[🎲 ${ctx.senderName}] ${result.detail}`);
  }
}

// ── CoC 随机制卡 .coc ─────────────────────────────────────────────────────────

export class CocChargenHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'coc',
    aliases: [],
    action: 'read',
    scope: 'personal',
    channel: 'both',
    requiredRole: 'guest',
    nlAllowed: false,
    description: 'CoC 7th 随机制卡，如 .coc 或 .coc 2（生成2套）',
    usage: '.coc [N]',
  };

  async execute(ctx: CommandContext): Promise<void> {
    const count = Math.min(parseInt(ctx.rawArgs.trim() || '1', 10) || 1, 5);
    const lines: string[] = [`[🎲 ${ctx.senderName}] CoC 随机制卡 ×${count}\n`];

    for (let i = 0; i < count; i++) {
      const char = generateCharacter();
      if (count > 1) lines.push(`── 第 ${i + 1} 套 ──`);
      lines.push(char.detail);
      if (i < count - 1) lines.push('');
    }

    await ctx.reply(lines.join('\n'));
  }
}

// ── .setcoc <0-5> ─────────────────────────────────────────────────────────────

export class SetCocHandler implements CommandHandler {
  readonly meta: CommandMeta = {
    name: 'setcoc',
    aliases: [],
    action: 'write',
    scope: 'session',
    channel: 'group_only',
    requiredRole: 'kp',
    nlAllowed: false,
    description: '设置 CoC 7th 房规（0~5）',
    usage: '.setcoc <0-5>',
  };

  async execute(ctx: CommandContext): Promise<void> {
    const n = parseInt(ctx.rawArgs.trim(), 10);
    if (isNaN(n) || n < 0 || n > 5) {
      await ctx.reply('用法：.setcoc <0-5>，例如 .setcoc 2（0=规则书默认，2=出1-5且成功=大成功）');
      return;
    }

    try {
      validateHouseRule(n);
      setHouseRule(ctx, n);
      const desc = [
        '规则书默认（出1=大成功）',
        '技能<50时出1=大成功',
        '出1-5且成功=大成功 / 出96-100且失败=大失败',
        '出1-5=大成功（无视判定）/ 出96-100=大失败',
        '出1-5且≤技能/10=大成功',
        '出1-2且≤技能/5=大成功',
      ][n];
      await ctx.reply(`✅ CoC 房规已设置为 ${n}：${desc}`);
    } catch (e) {
      await ctx.reply(`❌ ${(e as Error).message}`);
    }
  }
}

// ── 威力骰表达式处理（内部函数） ───────────────────────────────────────────────

async function handlePowerRollExpr(expr: string, ctx: CommandContext, hidden: boolean): Promise<void> {
  // 解析威力骰格式：r<power>[@<crit>][+<modifier>]
  // 使用 DiceEngine 解析 AST，然后提取参数
  const parseResult = engine.parse(expr);
  if (!parseResult.ok) {
    await ctx.reply(`❌ 威力骰表达式无效：${parseResult.error.message}`);
    return;
  }

  const ast = parseResult.value;
  if (ast.type !== 'power_roll') {
    // 不是威力骰，按普通骰处理
    const r = engine.roll(expr);
    if (!r.ok) { await ctx.reply(`❌ ${r.error.message}`); return; }
    const output = formatRollResult(r.value, expr);
    await sendRollResult(ctx, output, hidden);
    return;
  }

  // 求值 power、crit、modifier
  const rollCtx = {};
  const powerResult = engine.roll(ast.power.type === 'number' ? String(ast.power.value) : expr, rollCtx);
  if (!powerResult.ok) { await ctx.reply(`❌ 威力值无效`); return; }
  const power = powerResult.value.total;

  let criticalValue = 10;
  if (ast.critSpec !== null) {
    const critResult = engine.roll(
      ast.critSpec.type === 'number' ? String(ast.critSpec.value) : expr,
    );
    if (!critResult.ok) { await ctx.reply(`❌ C值表达式无效`); return; }
    criticalValue = critResult.value.total;
  }

  let modifier = 0;
  for (const part of ast.addParts) {
    const partResult = engine.roll(part.type === 'number' ? String(part.value) : expr);
    if (!partResult.ok) { await ctx.reply(`❌ 追加值无效`); return; }
    modifier += partResult.value.total;
  }

  try {
    const result = sw25PowerRoll({
      power,
      criticalValue,
      modifier,
      expression: expr,
      playerName: ctx.senderName,
    });
    await sendRollResult(ctx, result.detail, hidden);
  } catch (e) {
    await ctx.reply(`❌ ${(e as Error).message}`);
  }
}

async function sendRollResult(ctx: CommandContext, output: string, hidden: boolean): Promise<void> {
  if (hidden && ctx.groupId) {
    await ctx.reply(`🎲 ${ctx.senderName} 进行了暗骰（结果已私聊发送）`);
    await ctx.replyPrivate(`[暗骰]\n${output}`);
  } else {
    await ctx.reply(output);
  }
}
