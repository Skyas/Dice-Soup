# 🎲 Dice&Soup

> AI 驱动的 QQ 桌游主持机器人 — 海龟汤 · 阿瓦隆 · 谁是卧底 · CoC 跑团

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)

---

## 目录

- [项目简介](#项目简介)
- [快速开始](#快速开始)
- [开发环境](#开发环境)
- [配置说明](#配置说明)
- [目录结构](#目录结构)
- [指令列表](#指令列表)
- [故障排查](#故障排查)

---

## 项目简介

Dice&Soup 是一个运行在 QQ 群内的 AI 桌游主持机器人，通过 [NapCat](https://napneko.github.io) + OneBot v11 协议接入 QQ。

**第一大阶段（当前）**：基础架构 + 通讯打通 + 管理后台
- QQ 群/私聊双向通讯
- Web 管理后台（Log Viewer + 配置中心）
- 安全骨架（越狱检测、RBAC、审计日志）

---

## 快速开始（Docker Compose）

### 前置条件

- Docker + Docker Compose v2
- 一个 QQ 号用于 Bot（建议小号）

### 步骤

```bash
# 1. 克隆仓库
git clone https://github.com/your-org/dice-soup.git
cd dice-soup

# 2. 复制并填写配置
cp .env.example .env
# 编辑 .env，至少填写：
#   JWT_SECRET=<随机字符串，建议 32+ 字符>
#   ONEBOT_ACCESS_TOKEN=<随机字符串>
#   QQ_ACCOUNT=<Bot 的 QQ 号>

# 3. 配置 NapCat WebSocket
cp docker/napcat-config/onebot11.json.example docker/napcat-config/onebot11.json
# 编辑 onebot11.json，将 ${ONEBOT_ACCESS_TOKEN} 替换为与 .env 相同的值

# 4. 启动服务
cd docker
docker compose up -d

# 5. 查看日志
docker compose logs -f server
```

### 首次登录 NapCat

```bash
# 访问 NapCat WebUI 扫码登录 QQ
open http://localhost:6099
```

### 访问管理后台

```
http://localhost:3000
```

首次登录：用户名 `admin`，密码见启动日志输出（如未设置 `ADMIN_INITIAL_PASSWORD`，会自动生成并打印）。**首次登录必须修改密码。**

---

## 开发环境

### 前置条件

- Node.js 20+
- pnpm 9+

### 启动步骤

```bash
# 安装依赖
pnpm install

# 复制配置
cp .env.example .env
# 填写必要配置（至少 JWT_SECRET）

# 启动 server（热重载）
pnpm dev:server

# 另开终端，启动 web-admin（Vite dev server）
pnpm dev:web

# 验证 .ping 指令：
# 在 QQ 群发 .ping，Bot 应回复 🏓 Pong！
```

### 常用命令

```bash
# 全量构建
pnpm build

# 运行测试
pnpm test

# 代码检查
pnpm lint

# 数据库迁移（开发时不需要手动执行，启动时自动）
pnpm db:generate   # 生成迁移文件（修改 schema 后执行）
pnpm db:push       # 直接 push 到 dev DB（开发用）
```

---

## 配置说明

### 环境变量（.env）

| 变量 | 必填 | 说明 |
|---|---|---|
| `JWT_SECRET` | ✅ | Web 后台 JWT 签名密钥，建议 32+ 字符随机字符串 |
| `ONEBOT_ACCESS_TOKEN` | ✅ | OneBot 连接鉴权 Token，与 NapCat 配置保持一致 |
| `QQ_ACCOUNT` | ✅（Docker）| Bot QQ 号 |
| `ADMIN_INITIAL_PASSWORD` | ⬜ | 初始管理员密码（不填则自动生成并打印） |
| `DB_PATH` | ⬜ | SQLite 数据库路径，默认 `./dice-soup.db` |
| `HTTP_PORT` | ⬜ | HTTP 端口，默认 `3000` |
| `ONEBOT_WS_PORT` | ⬜ | OneBot WS 端口，默认 `6700` |
| `DEEPSEEK_API_KEY` | ⬜ | DeepSeek API Key（第二阶段开始需要）|

### 热更新配置（Web 后台）

登录管理后台 → 配置中心，可实时修改以下配置（无需重启）：

- 限流参数
- 越狱关键词清单
- Bot 前缀
- Session 超时时间

---

## 目录结构

```
dice-soup/
├─ apps/
│  ├─ server/          # Node.js 主程序（Fastify + 业务）
│  └─ web-admin/       # Vue 3 管理后台
├─ packages/
│  ├─ shared-types/    # 跨端共享 TS 类型
│  ├─ logger/          # Pino 封装 + WS 推送
│  ├─ onebot-client/   # 自研 OneBot v11 客户端（MIT，无 AGPL）
│  └─ security/        # 越狱检测 + 限流
├─ docker/
│  ├─ docker-compose.yml
│  ├─ server/Dockerfile
│  └─ napcat-config/   # NapCat 配置模板
└─ docs/               # 设计文档
```

---

## 指令列表

> 默认指令前缀为 `.`（可在管理后台修改）

| 指令 | 权限 | 说明 |
|---|---|---|
| `.ping` | 所有人 | 连通性检测 |
| `.help` | 所有人 | 查看帮助 |
| `.stats` | 所有人 | 查看个人统计（未建档则提示参与游戏）|
| `.soup start` | 所有人 | 海龟汤（第二阶段开放）|
| `.avalon start` | 所有人 | 阿瓦隆桌游（第三阶段开放）|
| `.undercover start` | 所有人 | 谁是卧底（第三阶段开放）|
| `.r <表达式>` | 所有人 | 骰子（第三阶段开放）|
| `.coc start` | 所有人 | CoC 7th 跑团（第四阶段开放）|
| `.card show` | 所有人 | 角色卡查询（第四阶段开放）|

---

## 故障排查

### NapCat 无法连接

1. 检查 `ONEBOT_ACCESS_TOKEN` 是否与 NapCat 配置一致
2. 检查端口 6700 是否被防火墙拦截
3. 查看 server 日志：`docker compose logs -f server | grep onebot`

### Bot 没有回应

1. 确认 NapCat 已扫码登录（访问 http://localhost:6099）
2. 确认 server 日志出现 `✅ NapCat 已连接！Bot 上线`
3. 确认指令前缀正确（默认 `.`）

### 管理后台无法登录

1. 检查启动日志是否打印了初始密码
2. 首次登录后必须修改密码（`must_change_pw=1`）
3. JWT_SECRET 修改后所有已颁发 token 失效，需重新登录

### 重置管理员密码

```bash
# 停止服务
docker compose stop server

# 删除 admins 表记录，下次启动时重新 seed
# （使用 sqlite3 命令或直接删除 DB 文件重建）
sqlite3 /path/to/dice-soup.db "DELETE FROM admins;"

# 重新设置初始密码
ADMIN_INITIAL_PASSWORD=new_password docker compose up -d server
```

---

## License

MIT — 详见 [LICENSE](LICENSE)

> NapCat 为独立进程，以 AGPL 授权。本项目通过 OneBot v11 协议与其通信，**核心代码不包含任何 AGPL 依赖**。
