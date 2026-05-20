/**
 * @module errors
 * 统一错误码体系与 Result<T, E> 类型。
 * 所有操作必须返回 Result，禁止静默吞掉异常。（规则 16）
 */

// ─── Result 类型 ────────────────────────────────────────────────────────────

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** 构造成功的 Result */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** 构造失败的 Result */
export function err<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** 快捷：用错误码 + 消息构造失败 Result */
export function errCode(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): Result<never, AppError> {
  return err(createError(code, message, details, cause));
}

// ─── AppError ───────────────────────────────────────────────────────────────

/** 结构化应用错误，所有 Result 的 E 类型默认使用此结构 */
export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): AppError {
  return { code, message, ...(details ? { details } : {}), ...(cause ? { cause } : {}) };
}

/** 判断一个值是否是 AppError */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as AppError).code === 'string'
  );
}

// ─── 错误码常量 ──────────────────────────────────────────────────────────────

export const ErrorCodes = {
  // 平台 / Adapter
  PLATFORM_DISCONNECTED: 'PLATFORM_DISCONNECTED',
  PLATFORM_API_FAILED: 'PLATFORM_API_FAILED',
  PLATFORM_API_TIMEOUT: 'PLATFORM_API_TIMEOUT',
  PLATFORM_AUTH_FAILED: 'PLATFORM_AUTH_FAILED',
  PLATFORM_MESSAGE_TOO_LONG: 'PLATFORM_MESSAGE_TOO_LONG',

  // 会话
  SESSION_ROOM_BUSY: 'SESSION_ROOM_BUSY',
  SESSION_USER_BUSY: 'SESSION_USER_BUSY',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_WRONG_STATE: 'SESSION_WRONG_STATE',
  SESSION_NOT_MEMBER: 'SESSION_NOT_MEMBER',
  SESSION_ALREADY_MEMBER: 'SESSION_ALREADY_MEMBER',

  // 权限
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  PERMISSION_ADMIN_REQUIRED: 'PERMISSION_ADMIN_REQUIRED',

  // 限流
  RATELIMIT_EXCEEDED: 'RATELIMIT_EXCEEDED',

  // 越狱 / 安全
  JAILBREAK_KEYWORD_HIT: 'JAILBREAK_KEYWORD_HIT',
  JAILBREAK_PATTERN_HIT: 'JAILBREAK_PATTERN_HIT',
  LEAK_OUTPUT_DETECTED: 'LEAK_OUTPUT_DETECTED',

  // LLM
  LLM_PROVIDER_FAILED: 'LLM_PROVIDER_FAILED',
  LLM_TIMEOUT: 'LLM_TIMEOUT',
  LLM_OUTPUT_INVALID: 'LLM_OUTPUT_INVALID',
  LLM_RATE_LIMITED: 'LLM_RATE_LIMITED',

  // 自然语言路由
  NL_INTENT_UNKNOWN: 'NL_INTENT_UNKNOWN',
  NL_INTENT_DISALLOWED: 'NL_INTENT_DISALLOWED',

  // 配置
  CONFIG_KEY_NOT_FOUND: 'CONFIG_KEY_NOT_FOUND',
  CONFIG_TYPE_MISMATCH: 'CONFIG_TYPE_MISMATCH',
  CONFIG_VALIDATION_FAILED: 'CONFIG_VALIDATION_FAILED',

  // 骰子引擎
  DICE_PARSE_FAILED: 'DICE_PARSE_FAILED',
  DICE_EXPRESSION_TOO_COMPLEX: 'DICE_EXPRESSION_TOO_COMPLEX',

  // 数据库
  DB_CONSTRAINT_VIOLATION: 'DB_CONSTRAINT_VIOLATION',
  DB_NOT_FOUND: 'DB_NOT_FOUND',
  DB_QUERY_FAILED: 'DB_QUERY_FAILED',

  // 指令
  COMMAND_UNKNOWN: 'COMMAND_UNKNOWN',
  COMMAND_INVALID_ARGS: 'COMMAND_INVALID_ARGS',
  COMMAND_UNAVAILABLE: 'COMMAND_UNAVAILABLE',

  // 管理员认证
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',

  // 通用
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
