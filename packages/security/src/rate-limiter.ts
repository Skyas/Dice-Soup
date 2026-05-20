/**
 * @module rate-limiter
 * 纯内存滑动窗口限流器。不建 DB 表，单进程重启清零不影响使用。（§1.12）
 * 抽象接口已预留，未来可替换为 Redis 实现。
 */

export interface RateLimiterOptions {
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 窗口内最大请求数 */
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** 当前窗口内已消费次数 */
  current: number;
  /** 窗口重置时间 unix ms */
  resetAt: number;
  /** 剩余可用次数 */
  remaining: number;
}

/** 抽象接口，便于未来替换为 Redis 实现 */
export interface IRateLimiter {
  check(key: string): RateLimitResult;
  reset(key: string): void;
}

// ─── 内存实现 ────────────────────────────────────────────────────────────────

export class MemoryRateLimiter implements IRateLimiter {
  private readonly options: RateLimiterOptions;
  /** key → 请求时间戳列表（滑动窗口） */
  private readonly store = new Map<string, number[]>();
  /** 自动 GC 防止内存泄漏（每 5 分钟清理过期 key） */
  private readonly gcTimer: ReturnType<typeof setInterval>;

  constructor(options: RateLimiterOptions) {
    this.options = options;
    this.gcTimer = setInterval(() => this.gc(), 5 * 60 * 1000);
    // 防止 Node 进程因 timer 而不退出
    this.gcTimer.unref?.();
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    // 获取并过滤窗口内的记录
    const timestamps = (this.store.get(key) ?? []).filter((t) => t > windowStart);

    const allowed = timestamps.length < this.options.maxRequests;
    if (allowed) {
      timestamps.push(now);
    }
    this.store.set(key, timestamps);

    const earliest = timestamps[0] ?? now;
    return {
      allowed,
      current: timestamps.length,
      remaining: Math.max(0, this.options.maxRequests - timestamps.length),
      resetAt: earliest + this.options.windowMs,
    };
  }

  reset(key: string): void {
    this.store.delete(key);
  }

  /** 清理所有过期 key */
  private gc(): void {
    const windowStart = Date.now() - this.options.windowMs;
    let cleaned = 0;
    for (const [key, timestamps] of this.store) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        this.store.delete(key);
        cleaned++;
      } else {
        this.store.set(key, active);
      }
    }
    if (cleaned > 0) {
      // GC 完成后不输出日志（避免日志噪声），由调用方在需要时查询
    }
  }

  destroy(): void {
    clearInterval(this.gcTimer);
    this.store.clear();
  }
}

// ─── 预定义限流器工厂 ────────────────────────────────────────────────────────

/**
 * 构建 LLM 调用限流 key。每用户每分钟 3 次。
 * key 格式：llm:{userQQ}
 */
export function buildLlmRateLimitKey(userQQ: string): string {
  return `llm:${userQQ}`;
}

/**
 * 构建展示型查询限流 key。每用户每群每分钟 1 次。
 * key 格式：display:{userQQ}:{groupId}
 */
export function buildDisplayRateLimitKey(userQQ: string, groupId: string): string {
  return `display:${userQQ}:${groupId}`;
}
