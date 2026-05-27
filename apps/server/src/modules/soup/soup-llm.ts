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
  verdict: z.enum(['yes', 'no', 'irrelevant', 'partial']),
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
export const DEFAULT_JUDGE_INSTRUCTIONS = `判定规则：
- verdict=yes：提问内容与真相某个事实点完全吻合
- verdict=no：提问与真相相矛盾，OR 掌握完整真相后可以明确回答"不是/没有/否"
- verdict=partial：提问部分正确，但有部分与真相不符
- verdict=irrelevant：即使掌握完整真相，也根本无法对该问题给出确定的是/否——问题涉及真相完全未提及且无法推断的细节

no 与 irrelevant 的核心区别（这是最重要的规则，必须严格遵守）：

【必须判 no 的三种情形，满足任意一条即判 no，绝不能判 irrelevant】
① 提问涉及的元素在真相中有对应，但描述错误
  ✓ 真相：男子从高空坠落（飞机取水）→ 问"是被人从高空扔下来的吗" → no
  ✓ 真相：他因自责自杀 → 问"他是被逼迫自杀的吗" → no
② 掌握完整真相后，可以明确回答"不是/没有"
  ✓ 真相：没有人死亡 → 问"故事里有人死了吗" → no（不是 irrelevant！）
  ✓ 真相：他走楼梯是因为按不到按钮，非为健身 → 问"男子在锻炼身体吗" → no
  ✓ 真相：他因身高原因被迫在15楼下 → 问"他是自愿只到15楼的吗" → no
  ✓ 通用原则：凡是真相能给出确定否定答案的，一律判 no
③ 提问中有任何元素在真相中存在（哪怕机制/细节不同）
  ✓ 真相有"高空坠落" → 问任何涉及高空的问题 → no（不是 irrelevant）

【只能判 irrelevant 的极端情形——条件极为严格】
  即使掌握完整真相，也根本无法判断该问题答案，且问题与案件逻辑完全无关
  ✓ 真相：矮人电梯谜题 → 问"他是左撇子吗" → irrelevant（真相未提，且与事件无任何逻辑关联）
  ✓ 真相：任何谜题 → 问"电梯是什么颜色" → irrelevant（真相未提颜色，纯粹脱离情节）
  ✗ 错误用法：只要"某概念未在真相文字中出现"就判 irrelevant → 这是错的，应先问"能用真相明确答否吗"

判定步骤（必须按此顺序执行）：
1. 用完整真相直接回答该问题：能明确回答"否/没有/不是" → 立刻判 no，终止
2. 找出提问核心元素，判断真相中是否有对应：
   - 有对应且描述正确 → yes / 部分正确 → partial / 描述错误 → no
   - 完全没有对应，且即使知道全部真相也无法回答 → irrelevant

⚠️ 约束：
1. 只能基于真相字面内容判定，严禁推理、引申、联想
2. "有人死了吗""有人受伤吗""这是故意的吗"等通用问题，一律可用真相回答，禁止判 irrelevant
3. 真相说明了动机/方式/关系时，问"是否是其他动机/方式/关系" → 判 no，绝不判 irrelevant

若提问命中任意 key_point 关键词且 verdict 为 yes/partial，在 matched_key_points 填入对应 id。

必须以 JSON 格式回复，不要任何其他内容：
{"verdict":"...","internal_reason":"<内部推理，不超过80字>","confidence":0.0,"matched_key_points":[]}`;

/**
 * Restore 还原评判标准（拼接在题目 XML 之后）。
 * 管理员可通过 config_items['soup.prompt.restore'] 覆盖此段文本。
 */
export const DEFAULT_RESTORE_INSTRUCTIONS = `评判标准：
- coverage：玩家还原内容覆盖真相关键要素的比例（0~1）
- matched_key_point_ids：玩家还原中命中的 key_point id 列表
- missing_critical_ids：critical=true 的 key_point 中未被命中的 id 列表
- passed 条件：coverage >= 0.7 且 missing_critical_ids 为空
- summary：内部评估摘要（不超过30字），绝对不能包含真相内容或透露关键要素具体内容

必须以 JSON 格式回复：
{"passed":false,"coverage":0.0,"matched_key_point_ids":[],"missing_critical_ids":[],"summary":"继续提问，慢慢接近真相"}`;

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
  const verdictMap: Record<string, string> = { yes: '✅是', no: '❌否', partial: '〜部分', irrelevant: '↩无关' };
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
