/**
 * @module logger
 * Pino 封装。
 * 输出双路：(a) stdout（可重定向到文件）；(b) LogBroadcaster（WebSocket 推送）。
 * 规则 8：关键 log 强制保留，生产环境保留 INFO 级别。
 */

import pino from 'pino';
import { Writable } from 'stream';
import { logBroadcaster } from './broadcaster';

// ─── 自定义双路流 ────────────────────────────────────────────────────────────

/**
 * 将每行日志同时发到 stdout 和 LogBroadcaster。
 * Pino 每次 write() 调用对应一行 JSON 日志。
 */
class DualStream extends Writable {
  private readonly writeToConsole: boolean;

  constructor(writeToConsole = true) {
    super();
    this.writeToConsole = writeToConsole;
  }

  _write(chunk: Buffer | string, _encoding: string, callback: () => void): void {
    const line = chunk.toString();
    if (this.writeToConsole) {
      process.stdout.write(line);
    }
    logBroadcaster.write(line);
    callback();
  }
}

// ─── Pino 配置 ───────────────────────────────────────────────────────────────

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const IS_PRETTY = process.env.NODE_ENV === 'development';

function createRootLogger() {
  if (IS_PRETTY) {
    // 开发模式：直接输出到 stdout，同时广播
    return pino(
      {
        level: LOG_LEVEL,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      },
      // pino-pretty 模式下不能用自定义流，广播单独处理
      undefined,
    );
  }

  // 生产模式：JSON 输出走双路流
  const stream = new DualStream(true);
  return pino({ level: LOG_LEVEL }, stream);
}

const rootLogger = createRootLogger();

// ─── 模块日志 Bindings ────────────────────────────────────────────────────────

export interface LoggerBindings {
  module: string;
  sessionId?: string;
  userId?: string;
  groupId?: string;
  requestId?: string;
}

/**
 * 为特定模块创建子 logger，自动附加 bindings。
 *
 * @example
 * const log = createLogger({ module: 'onebot-adapter' });
 * log.info('NapCat connected');
 */
export function createLogger(bindings: LoggerBindings) {
  return rootLogger.child(bindings);
}

export type Logger = ReturnType<typeof createLogger>;

export { rootLogger, logBroadcaster };
