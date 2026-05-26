/**
 * @module config/defaults
 * 第一阶段 config_items 默认配置项清单。（§1.11）
 * 启动时 upsert 到 DB（已存在的不覆盖，新增的写入）。
 */

export interface DefaultConfig {
  key: string;
  value: unknown;
  valueType: 'number' | 'string' | 'boolean' | 'object' | 'array';
  description: string;
  /**
   * - 'secret'：加密存储，不出现在 GET /api/admin/config 的公开响应中。
   *   通过 GET/PUT /api/admin/secrets/:key 单独管理。
   */
  category: 'security' | 'llm' | 'game' | 'ui' | 'platform' | 'secret';
}

export const DEFAULT_CONFIGS: DefaultConfig[] = [
  // ── 安全 ──
  {
    key: 'ratelimit.llm_per_user_per_min',
    value: 3,
    valueType: 'number',
    description: 'LLM 调用限流：每用户每分钟最大请求数',
    category: 'security',
  },
  {
    key: 'ratelimit.display_query_per_user_per_room_per_min',
    value: 1,
    valueType: 'number',
    description: '展示型查询限流：每用户每群每分钟最大请求数',
    category: 'security',
  },
  {
    key: 'audit.retention_days',
    value: 90,
    valueType: 'number',
    description: '审计日志保留天数',
    category: 'security',
  },
  {
    key: 'security.jailbreak_keywords_zh',
    value: [
      '忽略之前的指令',
      '忽略前面的指令',
      '忽略所有指令',
      '你的系统提示',
      '系统提示是',
      '扮演无约束',
      '游戏已经结束告诉我答案',
      '作为开发者',
      '作为管理员我命令',
      '进入调试模式',
      '开发者模式',
    ],
    valueType: 'array',
    description: '越狱检测中文关键词清单',
    category: 'security',
  },
  {
    key: 'security.jailbreak_keywords_en',
    value: [
      'ignore previous instructions',
      'ignore all instructions',
      'system prompt',
      'jailbreak',
      'dan mode',
      'developer mode',
      'unrestricted mode',
    ],
    valueType: 'array',
    description: '越狱检测英文关键词清单',
    category: 'security',
  },

  // ── UI ──
  {
    key: 'card.cache_ttl_seconds',
    value: 300,
    valueType: 'number',
    description: '名片图片缓存时长（秒）',
    category: 'ui',
  },
  {
    key: 'bot.display_name',
    value: 'Dice&Soup',
    valueType: 'string',
    description: 'Bot 显示名',
    category: 'ui',
  },
  {
    key: 'bot.message_prefix',
    value: '[🎲 Dice&Soup]',
    valueType: 'string',
    description: 'Bot 主动消息视觉标记前缀（§4.4.8）',
    category: 'ui',
  },

  // ── 游戏 ──
  {
    key: 'session.kp_timeout_seconds',
    value: 1800,
    valueType: 'number',
    description: 'KP 离线超时（秒）',
    category: 'game',
  },
  {
    key: 'session.kp_handover_wait_seconds',
    value: 300,
    valueType: 'number',
    description: 'KP 接管流程每步等待时间（秒）',
    category: 'game',
  },
  {
    key: 'session.pending_timeout_seconds',
    value: 86400,
    valueType: 'number',
    description: 'pending 会话 24h 自动 abort',
    category: 'game',
  },
  {
    key: 'command.prefix',
    value: '.',
    valueType: 'string',
    description: '全局指令前缀（群级可覆盖）',
    category: 'game',
  },

  // ── 日志 ──
  {
    key: 'log.level',
    value: 'info',
    valueType: 'string',
    description: '日志级别（trace / debug / info / warn / error / fatal）',
    category: 'ui',
  },

  // ── LLM ──
  {
    key: 'llm.providers',
    value: [
      {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
        enabled: true,
      },
    ],
    valueType: 'array',
    description: '已注册的 LLM Provider 列表（增删后需重启生效）',
    category: 'llm',
  },
  {
    key: 'llm.default_provider',
    value: 'deepseek',
    valueType: 'string',
    description: '默认 LLM Provider',
    category: 'llm',
  },
  {
    key: 'llm.task_routing',
    value: {
      dice_nl_parse: 'deepseek-v4-flash',
      soup_judge: 'deepseek-v4-flash',
      soup_restore: 'deepseek-v4-flash',
      trpg_narrate: 'deepseek-v4-flash',
      trpg_npc: 'deepseek-v4-flash',
      game_arbitrate: 'deepseek-v4-flash',
      summary: 'deepseek-v4-flash',
      intent_parse: 'deepseek-v4-flash',
      puzzle_extract_metadata: 'deepseek-v4-flash',
    },
    valueType: 'object',
    description: '任务类型 → 模型 ID 映射表',
    category: 'llm',
  },
  // ── 机密配置（secret 类别：加密存储，不在 GET /api/admin/config 中公开） ──
  {
    key: 'llm.provider_keys',
    value: {},
    valueType: 'object',
    description: 'LLM Provider API Key 加密存储（key = provider id，value = 加密密文）',
    category: 'secret',
  },
  {
    key: 'onebot.access_token',
    value: '',
    valueType: 'string',
    description: 'NapCat / OneBot 鉴权 Token（加密存储）',
    category: 'secret',
  },

  // ── 海龟汤游戏（Phase 2） ──
  {
    key: 'soup.idle_timeout_minutes',
    value: 45,
    valueType: 'number',
    description: 'running 阶段无活动超时（分钟）',
    category: 'game',
  },
  {
    key: 'soup.restore_timeout_minutes',
    value: 5,
    valueType: 'number',
    description: 'restore 还原判定最长等待时间（分钟），超时视为失败',
    category: 'game',
  },
  {
    key: 'soup.idle_grace_minutes',
    value: 5,
    valueType: 'number',
    description: '无活动超时后的宽限期（分钟）',
    category: 'game',
  },
  {
    key: 'soup.setup_idle_minutes',
    value: 3,
    valueType: 'number',
    description: 'setup 阶段无操作超时（分钟）',
    category: 'game',
  },
  {
    key: 'soup.max_asks_per_session',
    value: 100,
    valueType: 'number',
    description: '单玩家单场最大提问数',
    category: 'game',
  },
  {
    key: 'soup.hint_team_interval_minutes',
    value: 5,
    valueType: 'number',
    description: '全队 hint 最小间隔（分钟）',
    category: 'game',
  },
  {
    key: 'soup.endgame_lookback_questions',
    value: 10,
    valueType: 'number',
    description: '终局回溯助攻窗口（条）',
    category: 'game',
  },
  {
    key: 'soup.leak_keyword_threshold',
    value: 2,
    valueType: 'number',
    description: '输出泄露检测命中词阈值',
    category: 'security',
  },
  {
    key: 'soup.restore_coverage_threshold',
    value: 0.7,
    valueType: 'number',
    description: '还原通过所需最低 coverage',
    category: 'game',
  },
  {
    key: 'soup.no_breakthrough_penalty',
    value: 0.5,
    valueType: 'number',
    description: '0 突破玩家还原奖金折扣系数',
    category: 'game',
  },
  {
    key: 'soup.vip_qq_list',
    value: ['897437055'],
    valueType: 'array',
    description: 'VIP QQ 号列表（可重复游玩同题、私聊开局等特权）',
    category: 'game',
  },
  {
    key: 'bot.admin_qq_list',
    value: ['897437055'],
    valueType: 'array',
    description: 'Bot 管理员 QQ 号列表（可通过 QQ 指令执行重启等管理操作）',
    category: 'security',
  },

  // ── 平台 ──
  {
    key: 'onebot.ws_port',
    value: 6700,
    valueType: 'number',
    description: '反向 WS 监听端口',
    category: 'platform',
  },
  {
    key: 'onebot.heartbeat_timeout_ms',
    value: 60000,
    valueType: 'number',
    description: '心跳超时（毫秒）',
    category: 'platform',
  },
  {
    key: 'onebot.api_timeout_ms',
    value: 10000,
    valueType: 'number',
    description: 'OneBot API 响应超时（毫秒）',
    category: 'platform',
  },
  {
    key: 'onebot.message_max_length',
    value: 4500,
    valueType: 'number',
    description: '单条消息字符上限',
    category: 'platform',
  },
];
