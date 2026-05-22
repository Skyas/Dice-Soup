/**
 * @module app
 * Fastify 应用工厂。
 * 注册所有插件（JWT、CORS、WebSocket）和路由。
 * 与 index.ts 解耦：app.ts 只负责构建，启动逻辑在 index.ts。
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyWebSocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { createLogger } from '@dice-soup/logger';
import { healthRoutes } from './routes/health';
import { adminAuthRoutes } from './routes/admin/auth';
import { adminLogsRoutes } from './routes/admin/logs';
import { adminConfigRoutes } from './routes/admin/config';
import { adminPuzzlesRoutes } from './routes/admin/puzzles';
import type { ConfigService } from './config/config-service';
import type { AuditService } from './services/audit-service';
import type { OneBotAdapter } from './adapters/onebot-adapter';
import type { SoupService } from './services/soup-service';
import type { LLMRouter } from '@dice-soup/llm-router';

const log = createLogger({ module: 'app' });

export interface AppOptions {
  configService: ConfigService;
  auditService: AuditService;
  oneBotAdapter: OneBotAdapter;
  soupService: SoupService;
  llmRouter: LLMRouter;
  jwtSecret: string;
  /** HTTP 监听端口，默认 3000 */
  port?: number;
  /** 是否开发模式（开启 logger pretty print 等） */
  isDev?: boolean;
}

/** 构建并返回 Fastify 实例（未 listen） */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { configService, auditService, oneBotAdapter, soupService, llmRouter, jwtSecret, isDev = false } = options;

  const fastify = Fastify({
    // Fastify 内置 Pino；此处指向我们自己的 logger 不合适（两套输出）
    // 使用 disableRequestLogging 避免重复，由我们的中间件负责
    disableRequestLogging: true,
    logger: false,
  });

  // ── 插件注册 ────────────────────────────────────────────────────────────

  // CORS（开发模式放通所有来源；生产只允许同域）
  await fastify.register(fastifyCors, {
    origin: isDev ? true : false,
    credentials: true,
  });

  // JWT
  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
  });

  // WebSocket（Log Viewer 用）
  await fastify.register(fastifyWebSocket);

  // 前端静态文件（web-admin 打包产物）
  const webAdminDist = path.join(__dirname, '../../web-admin/dist');
  const fs = await import('fs');
  if (fs.existsSync(webAdminDist)) {
    await fastify.register(fastifyStatic, {
      root: webAdminDist,
      prefix: '/',
      wildcard: false,
      index: false,    // 不自动处理 index.html，由下面的 NotFoundHandler 手动处理
      serve: true,
    });

    // SPA fallback：只对没有扩展名的路径（即 Vue Router 路由）返回 index.html
    // 有扩展名的（.js/.css/.svg 等静态资源）如果 404 就真的 404
    fastify.setNotFoundHandler(async (request, reply) => {
      const url = request.url.split('?')[0];
      if (url.startsWith('/api')) {
        return reply.status(404).send({ error: 'NOT_FOUND' });
      }
      // 有文件扩展名的静态资源不做 fallback
      if (path.extname(url)) {
        return reply.status(404).send({ error: 'NOT_FOUND' });
      }
      // Vue Router 的前端路由，返回 index.html
      return reply.type('text/html').sendFile('index.html');
    });

    log.info({ path: webAdminDist }, '[app] 静态文件已挂载');
  } else {
    log.info('[app] web-admin/dist 不存在，跳过静态文件挂载');
    fastify.setNotFoundHandler(async (_request, reply) => {
      return reply.status(404).send({ error: 'NOT_FOUND' });
    });
  }

  // ── 请求日志中间件 ───────────────────────────────────────────────────────

  fastify.addHook('onRequest', async (request) => {
    if (request.url.startsWith('/api')) {
      log.info({ method: request.method, url: request.url }, '[http] →');
    }
  });

  fastify.addHook('onResponse', async (request, reply) => {
    if (request.url.startsWith('/api')) {
      log.info(
        { method: request.method, url: request.url, status: reply.statusCode },
        '[http] ←',
      );
    }
  });

  // ── 路由注册 ────────────────────────────────────────────────────────────

  await fastify.register(async (app) => {
    // 健康检查（无需鉴权）
    await healthRoutes(app, { isOneBotConnected: () => oneBotAdapter.isConnected() });

    // 管理员认证
    await adminAuthRoutes(app, { auditService });

    // Log Viewer（WS）
    await adminLogsRoutes(app);

    // 配置中心
    await adminConfigRoutes(app, { configService, auditService });

    // 题库管理
    await adminPuzzlesRoutes(app, { soupService, llmRouter });
  });

  return fastify;
}