/**
 * @module modules/soup/soup-llm
 * 海龟汤 LLM 调用封装：prompt 构建、输出解析、泄露检测。
 * K4: 设计时即使用 Handlebars 思路，当前以 TS 模板函数实现（语义等价）。
 * K7: 关键词层为唯一泄露检测手段（仅对用户可见输出生效）。
 *
 * 泄露检测说明：
 *   - callSoupJudge：judge 输出（verdict/confidence/matched_key_points）均不直接展示给玩家，
 *     internal_reason 更是纯内部字段，对输出做泄露检测会误伤 internal_reason 中的正常推理词，
 *     导致正确判定被强制改为 irrelevant。因此 judge 不对 LLM 输出做泄露检测。
 *   - callSoupRestore：restore 的 summary 字段同样不展示给玩家（soup.ts 自行生成提示文字），
 *     仅保留泄露审计日志，不覆盖判定结果。
 */

import { z } from 'zod';
import { createLogger } from '@dice-soup/logger';
import { ok, err, type Result, type AppError, createError, ErrorCodes } from '@dice-soup/shared-types';
import type { LLMRouter } from '@dice-soup/llm-router';
import type { SoupPuzzleData } from '../../services/soup-service';

const log = createLogger({ module: 'soup-llm' });

// ── Zod 输出 Schema ──────────────────────────────────────────────────────────

export const SoupJudgeOutput = z.object({
  verdict: z.enum(['yes', 'no', 'partial', 'unimportant', 'irrelevant']),
  internal_reason: z.string().max(200),
  confidence: z.number().min(0).max(1),
  matched_key_points: z.array(z.string()).max(5),
});

export const SoupRestoreOutput = z.object({
  passed: z.boolean(),
  coverage: z.number().min(0).max(1),
  matched_key_point_ids: z.array(z.string()),
  missing_critical_ids: z.array(z.string()),
  summary: z.string().max(300),
});

export const PuzzleMetadataOutput = z.object({
  key_points: z.array(z.object({
    id: z.string(),
    description: z.string().max(80),
    keywords: z.array(z.string()).max(8),
    critical: z.boolean(),
    weight: z.number().default(1.0),
  })).min(1).max(3),
  sensitive_words: z.array(z.string()).min(1).max(15),
});

export const SummaryOutput = z.object({
  overall_comment: z.string().max(300),
  highlights: z.array(z.object({
    qq: z.string(),
    moment: z.string().max(60),
  })).max(3),
});

export type SoupJudgeResult = z.infer<typeof SoupJudgeOutput>;
export type SoupRestoreResult = z.infer<typeof SoupRestoreOutput>;
export type PuzzleMetadataResult = z.infer<typeof PuzzleMetadataOutput>;
export type SummaryResult = z.infer<typeof SummaryOutput>;

// ── XML 转义（防 prompt 注入） ────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── 默认 Prompt 指令（可由管理员在 WebUI 覆盖） ───────────────────────────────

/**
 * Judge 判定指令（拼接在题目 XML 之后）。
 * 管理员可通过 config_items['soup.prompt.judge'] 覆盖此段文本。
 */
export const DEFAULT_JUDGE_INSTRUCTIONS = `你是海龟汤判定主持人。基于 <truth> 判定玩家提问，verdict 必为 yes / no / partial / unimportant / irrelevant 之一。

【判定流程——按顺序执行】

1) 把玩家提问改写成一句可验证的陈述（去掉"是否"等疑问句式）。
2) 用 <truth> 检验该陈述。允许：同义改写、上下位关系、真相必然蕴含的事实；禁止：脑补真相未蕴含的内容。
3) 按下列五档取一个 verdict（条件从上到下依次检查，命中即返回）：

  ◆ partial — 提问中既有真相支持的部分，也有真相否定的部分
    例：真相"男子失足从飞机坠落" → 问"他从高空被人推下" → partial（高空 √ / 被推 ×）

  ◆ no — 真相否定该陈述，或提问的具体描述与真相中对应元素不符
    判据：基于真相能明确回答"不是/没有/否"
    例：真相"他因自责自杀" → 问"他是被他杀的吗" → no
    例：真相"走楼梯因为按不到电梯按钮" → 问"他在锻炼身体吗" → no
    例：真相"他独自旅行" → 问"他和家人一起来的吗" → no

  ◆ yes — 真相直接支持，或真相必然蕴含该陈述
    例：真相含"妻子在他出国后离世" → 问"是否有人死亡" → yes
    例：真相"他翻报纸时看到妻子的讣告照片" → 问"报纸上是否有照片" → yes
    例：真相"电话那头朋友提到船难" → 问"电话内容是否和船难有关" → yes

  ◆ unimportant — 真相能给出确定答案，但答案不推动玩家理解真相核心
    判据：先确认真相能答 yes 或 no；再判断该答案对推理有没有价值
    典型：提问宽泛到任何答案都不缩小搜索空间，或仅涉及边缘性细节
    例：真相含次要人物（朋友/妻子）→ 问"是否存在汤面未提到的人物" → unimportant（答"是"但不导向真相机制）
    例：真相主体是男主角 → 问"主角是男的吗" → unimportant（真相已暗示，对推理无增益）

  ◆ irrelevant — 真相完全未涉及该陈述，且与谜题情境无任何逻辑接口
    判据：真相既不能答"是"也不能答"否"，且问题完全脱离情境
    例：灯塔谜题 → 问"灯塔的油漆是什么颜色" → irrelevant
    例：电梯谜题 → 问"主角的星座" → irrelevant

【高频误判——必须避免】

× 不要因为"真相字面未出现该词"就判 irrelevant；先做语义比对（同义/上下位/蕴含）。
× 真相能用 yes/no 回答的问题，绝不判 irrelevant；该问题若价值低请用 unimportant。
× 真相中存在的元素被错误描述 → no，不是 irrelevant。
× 真相显然蕴含的事实就是 yes（如"妻子死亡"蕴含"有人死亡"），但禁止过度引申到真相外。
× internal_reason 必须引用真相中的具体依据，禁止"玩家可能想问 X"这类对意图的猜测。

【关键线索命中】
若 verdict 为 yes 或 partial，且提问命中某 key_point 对应的事实（按语义命中，不要求字面包含关键词），将该 key_point id 填入 matched_key_points。

【信心度】
- 真相文字直接支持/否定 → 0.9~1.0
- 需要同义改写或显然蕴含 → 0.7~0.9
- 边界判断（unimportant vs partial、yes vs partial 不易区分）→ 0.4~0.6

【输出（严格 JSON，不要 markdown 围栏或额外文字）】
{"verdict":"yes|no|partial|unimportant|irrelevant","internal_reason":"<80字内，引用真相依据>","confidence":0.0,"matched_key_points":[]}`;

/**
 * Restore 还原评判标准（拼接在题目 XML 之后）。
 * 管理员可通过 config_items['soup.prompt.restore'] 覆盖此段文本。
 */
export const DEFAULT_RESTORE_INSTRUCTIONS = `你是海龟汤还原判定主持人。判断玩家叙述是否抓住了真相的核心机制与因果。

【核心原则——海龟汤还原不要求字面复刻】
玩家用自己的话讲清楚真相的核心逻辑、动机、关键转折，即视为命中。以下三种方式都算覆盖了某个 key_point：
(a) 同义/近义表达——如"自责"≈"内疚"≈"无法承受罪恶感"；"看不懂文字"≈"语言不通"
(b) 逻辑蕴含——玩家虽未明说该 key_point，但其叙述逻辑必然推出该事实
    例：玩家说"他害死了那些船员所以自杀" → 已蕴含"船只触礁导致死伤"+"因疏忽自责"两个 key_point
(c) 合理简化——省略次要细节但保留核心因果链

【不允许】
× 用字面词频或关键词匹配率当 coverage 依据
× 因玩家漏了非 critical 的次要细节就显著降低 coverage
× 把"方向接近但漏掉核心机制"判为通过——核心机制必须有任一形式的覆盖
× summary 包含真相内容或敏感词

【字段定义】
- coverage (0~1)：玩家叙述覆盖真相核心要素的比例。同义/蕴含/简化均按命中计入。
  · 完整覆盖所有核心 → 0.85~1.0
  · 主线清楚但漏 1 个非关键要素 → 0.7~0.85
  · 抓到大致方向但漏掉关键机制 → 0.4~0.6
  · 仅命中边缘细节 → 0~0.3
- matched_key_point_ids：玩家叙述通过语义命中（同义或必然蕴含）的 key_point id。
- missing_critical_ids：critical=true 的 key_point 中，玩家叙述既未直接说也未逻辑蕴含的 id。
  ⚠ 判断"是否蕴含"时自问：仅看玩家这段话，能不能推出该 key_point？能则不算 missing。
- passed：coverage ≥ 0.7 且 missing_critical_ids 为空。
- summary：30 字内内部摘要，描述还原质量但不得复述真相或敏感词。

【输出（严格 JSON，不要 markdown 围栏）】
{"passed":false,"coverage":0.0,"matched_key_point_ids":[],"missing_critical_ids":[],"summary":"..."}`;

/**
 * Extract Metadata 提取指令（完整 system prompt，因无题目数据需注入）。
 * 管理员可通过 config_items['soup.prompt.extract_metadata'] 覆盖。
 */
export const DEFAULT_EXTRACT_METADATA_INSTRUCTIONS = `你是海龟汤题目分析助手。请从以下题目中提取：
1. key_points：题目关键信息点（1-3个），每个含 id、description、keywords、critical（是否是判断通过的必要条件）、weight（固定1.0）
2. sensitive_words：如果被复述在回复中，可能透露真相的敏感词（2-15个）

critical 标记说明：标记 true 的不超过 2 个，代表"必须猜到才算通关"的核心要素。

【key_point 质量要求 — 必须严格遵守，否则游戏评分系统会出错】

每个 key_point 必须代表独立的认知突破：玩家发现它时，获得的是之前完全不知道的新事实。

禁止把同一事实拆成两个 key_point，例如：
  ✗ 错误：kp1"主角是矮子" + kp2"他按不到30楼的按钮" — 这两条是同一事实，只保留一个
  ✗ 错误：kp1"主角死亡" + kp2"主角被杀" — 重复，合并

判断标准：如果 kpA 几乎必然蕴含 kpB，则只保留 kpA；如果同一个玩家提问会同时命中两个 key_point，说明它们太相似，必须合并。

正确示例（电梯矮人谜题）：
  kp1: description="主角身材矮小，无法按到高楼层按钮", keywords=["矮","身高","按不到","按钮","身材"], critical=true
  kp2: description="借助雨伞或他人可以按到30楼", keywords=["雨伞","他人","帮忙","30楼"], critical=false

必须以 JSON 格式回复：
{"key_points":[{"id":"kp1","description":"...","keywords":["..."],"critical":true,"weight":1.0}],"sensitive_words":["..."]}`;

/**
 * Summary 总结指令（完整 system prompt 模板）。
 * 支持以下占位符：{{puzzle_title}} {{surface}} {{result}} {{duration}} {{score_text}} {{question_log}}
 * 管理员可通过 config_items['soup.prompt.summary'] 覆盖。
 */
export const DEFAULT_SUMMARY_INSTRUCTIONS = `你是海龟汤游戏主持人，请基于以下真实游玩数据，给出一段简短精彩的点评（100字以内），并选出最多3个高光时刻。

题目：《{{puzzle_title}}》
汤面：{{surface}}
结果：{{result}}
用时：{{duration}}
玩家得分：{{score_text}}

本局提问记录（共{{question_count}}问）：
{{question_log}}

要求：
- 点评必须基于上面的真实提问记录，不要编造过程
- 选出的高光时刻须对应具体玩家和真实问题节点
- 不要透露汤底真相内容

以 JSON 格式回复：{"overall_comment":"...","highlights":[{"qq":"...","moment":"..."}]}`;

// ── Prompt 构建 ───────────────────────────────────────────────────────────────

function buildJudgeSystemPrompt(puzzle: SoupPuzzleData, instructionOverride?: string): string {
  const kpXml = puzzle.keyPoints
    .map(
      (kp) =>
        `  <point id="${kp.id}" critical="${kp.critical}">\n    <desc>${escapeXml(kp.description)}</desc>\n    <keywords>${kp.keywords.map((k) => escapeXml(k)).join(', ')}</keywords>\n  </point>`,
    )
    .join('\n');

  const instructions = instructionOverride ?? DEFAULT_JUDGE_INSTRUCTIONS;

  return `你是海龟汤游戏的主持人，只负责对玩家提问做出是非判定，绝对不能透露、暗示或复述以下题目信息。

<puzzle>
  <surface>${escapeXml(puzzle.surface)}</surface>
  <truth>${escapeXml(puzzle.truth)}</truth>
  <key_points>
${kpXml}
  </key_points>
</puzzle>

${instructions}`;
}

function buildRestoreSystemPrompt(puzzle: SoupPuzzleData, instructionOverride?: string): string {
  const kpXml = puzzle.keyPoints
    .map(
      (kp) =>
        `  <point id="${kp.id}" critical="${kp.critical}">${escapeXml(kp.description)}</point>`,
    )
    .join('\n');

  const instructions = instructionOverride ?? DEFAULT_RESTORE_INSTRUCTIONS;

  return `你是海龟汤游戏的主持人，负责判断玩家的还原是否通过。

题目信息（保密）：
<puzzle>
  <surface>${escapeXml(puzzle.surface)}</surface>
  <truth>${escapeXml(puzzle.truth)}</truth>
  <key_points>
${kpXml}
  </key_points>
</puzzle>

${instructions}`;
}

// ── 泄露检测（K7 / §3.3） ────────────────────────────────────────────────────

function detectLeak(
  outputText: string,
  sensitiveWords: string[],
  threshold: number,
): { leaked: boolean; hitWords: string[] } {
  const lowerOutput = outputText.toLowerCase();
  const hitWords: string[] = [];

  for (const word of sensitiveWords) {
    if (word.length < 2) continue;
    if (lowerOutput.includes(word.toLowerCase())) {
      hitWords.push(word);
    }
  }

  return { leaked: hitWords.length >= threshold, hitWords };
}

// ── 主调用函数 ────────────────────────────────────────────────────────────────

/**
 * 调用 soup_judge：判断玩家提问。
 *
 * 注意：judge 输出（verdict/confidence/matched_key_points）均不直接展示给玩家，
 * internal_reason 为纯内部字段。对 LLM 输出做泄露检测会误命中 internal_reason 中的
 * 正常推理词（如"妻子"、"高空"等），导致正确判定被强制改为 irrelevant。
 * 因此 judge 不对 LLM 输出做泄露检测。
 */
export async function callSoupJudge(
  llmRouter: LLMRouter,
  puzzle: SoupPuzzleData,
  userQQ: string,
  question: string,
  _leakThreshold = 2,
  _onLeakDetected?: (hitWords: string[]) => Promise<void>,
  instructionOverride?: string,
): Promise<Result<SoupJudgeResult, AppError>> {
  // K5: 500字符截断
  const safeQuestion = question.slice(0, 500);

  const systemPrompt = buildJudgeSystemPrompt(puzzle, instructionOverride);

  const result = await llmRouter.chat(
    {
      task: 'soup_judge',
      userQQ,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: escapeXml(safeQuestion) },
      ],
    },
    { outputSchema: SoupJudgeOutput },
  );

  if (!result.ok) return result;

  const rawContent = result.value.content;

  // 解析 JSON（outputSchema 已验证，此处 fallback 解析兼容 markdown 代码块）
  try {
    let jsonStr = rawContent.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const parsed = SoupJudgeOutput.parse(JSON.parse(jsonStr));
    return ok(parsed);
  } catch (e) {
    log.warn({ content: rawContent.slice(0, 200) }, '[soup-llm] soup_judge 解析失败');
    return err(createError(ErrorCodes.LLM_OUTPUT_INVALID, 'LLM 输出格式异常'));
  }
}

/**
 * 调用 soup_restore：判断玩家还原。
 *
 * 泄露检测：仅做审计日志，不覆盖判定结果（restore 输出同样不直接展示给玩家）。
 */
export async function callSoupRestore(
  llmRouter: LLMRouter,
  puzzle: SoupPuzzleData,
  userQQ: string,
  restoreText: string,
  leakThreshold = 2,
  onLeakDetected?: (hitWords: string[]) => Promise<void>,
  instructionOverride?: string,
): Promise<Result<SoupRestoreResult & { appPassed: boolean }, AppError>> {
  const safeRestore = restoreText.slice(0, 1000);
  const systemPrompt = buildRestoreSystemPrompt(puzzle, instructionOverride);

  const result = await llmRouter.chat(
    {
      task: 'soup_restore',
      userQQ,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: escapeXml(safeRestore) },
      ],
    },
    {},
  );

  if (!result.ok) return result;

  const rawContent = result.value.content;

  // 泄露检测：仅审计日志，不干预判定结果
  const { leaked, hitWords } = detectLeak(rawContent, puzzle.sensitiveWords, leakThreshold);
  if (leaked) {
    log.warn({ userQQ, hitWords, task: 'soup_restore' }, '[soup-llm] 还原输出泄露检测命中（仅记录，不覆盖结果）');
    if (onLeakDetected) await onLeakDetected(hitWords).catch(() => {});
  }

  try {
    let jsonStr = rawContent.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const llmOutput = SoupRestoreOutput.parse(JSON.parse(jsonStr));

    // K17 双重条件：coverage >= 0.7 且所有 critical key_points 命中
    const appPassed =
      llmOutput.coverage >= 0.7 && llmOutput.missing_critical_ids.length === 0;

    return ok({ ...llmOutput, appPassed });
  } catch (e) {
    log.warn({ content: rawContent.slice(0, 200) }, '[soup-llm] soup_restore 解析失败');
    return err(createError(ErrorCodes.LLM_OUTPUT_INVALID, 'LLM 输出格式异常'));
  }
}

/**
 * 调用 puzzle_extract_metadata：从题目内容提取 key_points 和 sensitive_words。
 */
export async function callExtractMetadata(
  llmRouter: LLMRouter,
  puzzle: { title: string; surface: string; truth: string; tags: string[] },
  instructionOverride?: string,
): Promise<Result<PuzzleMetadataResult, AppError>> {
  const systemPrompt = instructionOverride ?? DEFAULT_EXTRACT_METADATA_INSTRUCTIONS;

  const userPrompt = `题目标题：${puzzle.title}
汤面：${puzzle.surface}
真相：${puzzle.truth}
标签：${puzzle.tags.join(', ')}`;

  const result = await llmRouter.chat(
    {
      task: 'puzzle_extract_metadata',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
    {},
  );

  if (!result.ok) return result;

  try {
    let jsonStr = result.value.content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const parsed = PuzzleMetadataOutput.parse(JSON.parse(jsonStr));
    return ok(parsed);
  } catch (e) {
    return err(createError(ErrorCodes.LLM_OUTPUT_INVALID, 'metadata 提取 LLM 输出解析失败'));
  }
}

/**
 * 调用 summary：生成游戏总结点评。
 */
export async function callSummary(
  llmRouter: LLMRouter,
  puzzle: SoupPuzzleData,
  scores: Array<{ qq: string; displayName: string; score: number; breakthroughCount: number }>,
  won: boolean,
  durationSeconds: number,
  questionLog: Array<{ qq: string; question?: string; verdict: string; matchedKeyPoints: string[] }>,
  playerNames: Record<string, string>,
  promptOverride?: string,
): Promise<SummaryResult> {
  const scoreText = scores
    .map((s) => `${s.displayName}：${s.score.toFixed(1)}分（突破×${s.breakthroughCount}）`)
    .join('、');

  // 提问历史：带原文的完整记录（最近 30 条）
  const verdictMap: Record<string, string> = { yes: '✅是', no: '❌否', partial: '〜部分', unimportant: '🤷不重要', irrelevant: '↩无关' };
  const logLines = questionLog.slice(-30).map((q, i) => {
    const name = playerNames[q.qq] ?? q.qq;
    const v = verdictMap[q.verdict] ?? q.verdict;
    const kp = q.matchedKeyPoints.length > 0 ? `（触发线索）` : '';
    const qText = q.question ? ` "${q.question}"` : '';
    return `Q${i + 1} [${name}]${qText}: ${v}${kp}`;
  }).join('\n');

  const durationStr = `${Math.floor(durationSeconds / 60)}分${durationSeconds % 60}秒`;
  const resultStr = won ? '通关成功' : '未通关';

  const template = promptOverride ?? DEFAULT_SUMMARY_INSTRUCTIONS;
  const systemPrompt = template
    .replace('{{puzzle_title}}', puzzle.title)
    .replace('{{surface}}', puzzle.surface)
    .replace('{{result}}', resultStr)
    .replace('{{duration}}', durationStr)
    .replace('{{score_text}}', scoreText)
    .replace('{{question_count}}', String(questionLog.length))
    .replace('{{question_log}}', logLines || '（无提问记录）');

  const result = await llmRouter.chat(
    {
      task: 'summary',
      messages: [{ role: 'user', content: systemPrompt }],
    },
    {},
  );

  if (!result.ok) {
    return { overall_comment: '本局海龟汤已结束，感谢参与！', highlights: [] };
  }

  try {
    let jsonStr = result.value.content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
    return SummaryOutput.parse(JSON.parse(jsonStr));
  } catch {
    return { overall_comment: result.value.content.slice(0, 200), highlights: [] };
  }
}
