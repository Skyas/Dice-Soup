# Dice&Soup Server Dockerfile
# 多阶段构建：build → production

# ── Stage 1: 依赖 + 构建 ──────────────────────────────────────────────────

FROM node:20-alpine AS builder

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

# 先复制 workspace 配置（充分利用 Docker layer 缓存）
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/server/package.json ./apps/server/
COPY apps/web-admin/package.json ./apps/web-admin/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/onebot-client/package.json ./packages/onebot-client/
COPY packages/security/package.json ./packages/security/

# 安装所有依赖（含 devDeps，build 需要）
RUN pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建 web-admin
RUN pnpm --filter @dice-soup/web-admin build

# 构建 server（TypeScript 编译）
RUN pnpm --filter @dice-soup/server build

# ── Stage 2: 生产镜像 ─────────────────────────────────────────────────────

FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# 只复制生产必须的文件
COPY pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/onebot-client/package.json ./packages/onebot-client/
COPY packages/security/package.json ./packages/security/

# 安装生产依赖
RUN pnpm install --prod --frozen-lockfile

# 复制编译产物
COPY --from=builder /build/apps/server/dist ./apps/server/dist
COPY --from=builder /build/apps/web-admin/dist ./apps/web-admin/dist
COPY --from=builder /build/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /build/packages/logger/dist ./packages/logger/dist
COPY --from=builder /build/packages/onebot-client/dist ./packages/onebot-client/dist
COPY --from=builder /build/packages/security/dist ./packages/security/dist

# 数据目录
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3000 6700

CMD ["node", "apps/server/dist/index.js"]
