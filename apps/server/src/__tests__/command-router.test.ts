/**
 * @test command-router
 * 指令路由器单元测试。
 * 覆盖：正常分发、未知指令、频道限制、system 指令拒绝、封禁用户。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NormalizedMessage } from '@dice-soup/shared-types';

// ── Mock 依赖 ──────────────────────────────────────────────────────────────

const mockSendGroup = vi.fn().mockResolvedValue({ ok: true, value: { messageId: '1' } });
const mockSendPrivate = vi.fn().mockResolvedValue({ ok: true, value: { messageId: '2' } });

const mockAdapter = {
  platform: 'qq' as const,
  isConnected: vi.fn().mockReturnValue(true),
  sendGroupMessage: mockSendGroup,
  sendPrivateMessage: mockSendPrivate,
  sendGroupMessageWithPrefix: mockSendGroup,
  recallMessage: vi.fn(),
  getGroupMemberInfo: vi.fn(),
  downloadFile: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

const mockConfigService = {
  get: vi.fn().mockReturnValue(null),
  getCommandPrefix: vi.fn().mockReturnValue('.'),
  getBotPrefix: vi.fn().mockReturnValue('[🎲 Dice&Soup]'),
  on: vi.fn(),
};

const mockAuditService = {
  log: vi.fn().mockResolvedValue(undefined),
  logPermissionDeny: vi.fn().mockResolvedValue(undefined),
  logRateLimit: vi.fn().mockResolvedValue(undefined),
  logJailbreak: vi.fn().mockResolvedValue(undefined),
  logOneBotAuthFailed: vi.fn().mockResolvedValue(undefined),
};

const mockUserService = {
  findUser: vi.fn().mockResolvedValue(null),
  isBanned: vi.fn().mockResolvedValue(false),
  ensureUserExists: vi.fn(),
  findProfile: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
};

// ── 构建路由器 ─────────────────────────────────────────────────────────────

async function buildRouter() {
  // 动态 import 避免模块缓存问题
  const { CommandRouter } = await import('../commands/router');
  const router = new CommandRouter(
    mockConfigService as any,
    mockUserService as any,
    mockAuditService as any,
  );
  router.setAdapter(mockAdapter as any);
  return router;
}

// ── 工具：构建 NormalizedMessage ───────────────────────────────────────────

function makeGroupMsg(text: string, userId = '11111'): NormalizedMessage {
  return {
    id: 'msg-1',
    platform: 'qq',
    channel: { type: 'group', groupId: '99999', userId },
    senderName: '测试用户',
    segments: [{ type: 'text', text }],
    raw: {},
    receivedAt: Date.now(),
  };
}

function makePrivateMsg(text: string, userId = '11111'): NormalizedMessage {
  return {
    id: 'msg-2',
    platform: 'qq',
    channel: { type: 'private', userId },
    senderName: '测试用户',
    segments: [{ type: 'text', text }],
    raw: {},
    receivedAt: Date.now(),
  };
}

// ── 测试 ───────────────────────────────────────────────────────────────────

describe('CommandRouter', () => {
  let router: Awaited<ReturnType<typeof buildRouter>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUserService.isBanned.mockResolvedValue(false);
    router = await buildRouter();
  });

  // ── 非指令消息 ────────────────────────────────────────────────────────────

  it('非指令消息返回 false（不处理）', async () => {
    const result = await router.handle(makeGroupMsg('普通聊天消息'));
    expect(result).toBe(false);
    expect(mockSendGroup).not.toHaveBeenCalled();
  });

  it('空消息返回 false', async () => {
    const result = await router.handle(makeGroupMsg(''));
    expect(result).toBe(false);
  });

  it('仅前缀无指令名返回 false', async () => {
    const result = await router.handle(makeGroupMsg('.'));
    expect(result).toBe(false);
  });

  // ── 正常指令分发 ──────────────────────────────────────────────────────────

  it('.ping 指令被正确处理并回复', async () => {
    const result = await router.handle(makeGroupMsg('.ping'));
    expect(result).toBe(true);
    expect(mockSendGroup).toHaveBeenCalledOnce();
    const sentMsg = mockSendGroup.mock.calls[0][1];
    // 检查回复包含 pong 文本
    const text = sentMsg.segments.find((s: any) => s.type === 'text')?.text ?? '';
    expect(text.toLowerCase()).toContain('pong');
  });

  it('.help 指令被正确处理', async () => {
    const result = await router.handle(makeGroupMsg('.help'));
    expect(result).toBe(true);
    expect(mockSendGroup).toHaveBeenCalledOnce();
  });

  it('.stats 指令（未建档用户）返回提示', async () => {
    mockUserService.findUser.mockResolvedValueOnce(null);
    const result = await router.handle(makeGroupMsg('.stats'));
    expect(result).toBe(true);
    expect(mockSendGroup).toHaveBeenCalledOnce();
    const sentMsg = mockSendGroup.mock.calls[0][1];
    const text = sentMsg.segments.find((s: any) => s.type === 'text')?.text ?? '';
    expect(text).toContain('未参加过游戏');
  });

  it('别名 .帮助 等同于 .help', async () => {
    const result = await router.handle(makeGroupMsg('.帮助'));
    expect(result).toBe(true);
    expect(mockSendGroup).toHaveBeenCalledOnce();
  });

  // ── 占位指令 ──────────────────────────────────────────────────────────────

  it('占位指令 .avalon.start 返回"敬请期待"', async () => {
    const result = await router.handle(makeGroupMsg('.avalon.start'));
    expect(result).toBe(true);
    const sentMsg = mockSendGroup.mock.calls[0][1];
    const text = sentMsg.segments.find((s: any) => s.type === 'text')?.text ?? '';
    expect(text).toMatch(/第三大阶段|敬请期待/);
  });

  // ── 未知指令 ──────────────────────────────────────────────────────────────

  it('未知指令回复错误提示', async () => {
    const result = await router.handle(makeGroupMsg('.unknown_cmd_xyz'));
    expect(result).toBe(true);
    const sentMsg = mockSendGroup.mock.calls[0][1];
    const text = sentMsg.segments.find((s: any) => s.type === 'text')?.text ?? '';
    expect(text).toContain('未知指令');
  });

  // ── 频道限制 ──────────────────────────────────────────────────────────────

  it('group_only 指令在私聊中被拒绝', async () => {
    // avalon.start 是 group_only（占位），在私聊中应被拒
    const result = await router.handle(makePrivateMsg('.avalon.start'));
    expect(result).toBe(true);
    expect(mockSendPrivate).toHaveBeenCalledOnce();
    const sentMsg = mockSendPrivate.mock.calls[0][1];
    const text = sentMsg.segments.find((s: any) => s.type === 'text')?.text ?? '';
    expect(text).toContain('群内');
  });

  // ── RBAC / system 指令 ────────────────────────────────────────────────────

  it('system 类指令被普通用户触发时返回权限拒绝', async () => {
    // 模拟一个 system 指令
    const { CommandRegistry } = await import('../commands/registry');
    const registry = (router as any).registry as InstanceType<typeof CommandRegistry>;
    registry.register({
      meta: {
        name: 'test.admin.cmd',
        action: 'system',
        scope: 'global',
        channel: 'both',
        requiredRole: 'admin',
        description: 'test',
      },
      execute: vi.fn(),
    });

    const result = await router.handle(makeGroupMsg('.test.admin.cmd'));
    expect(result).toBe(true);
    const sentMsg = mockSendGroup.mock.calls[0][1];
    const text = sentMsg.segments.find((s: any) => s.type === 'text')?.text ?? '';
    expect(text).toContain('管理员');
    expect(mockAuditService.logPermissionDeny).toHaveBeenCalledOnce();
  });

  // ── 封禁用户 ──────────────────────────────────────────────────────────────

  it('封禁用户发任何指令均被拒绝', async () => {
    mockUserService.isBanned.mockResolvedValue(true);

    const result = await router.handle(makeGroupMsg('.ping'));
    expect(result).toBe(true);
    const sentMsg = mockSendGroup.mock.calls[0][1];
    const text = sentMsg.segments.find((s: any) => s.type === 'text')?.text ?? '';
    expect(text).toContain('封禁');
    // 封禁拦截不应执行真正的 ping 处理
  });

  // ── 私聊指令 ──────────────────────────────────────────────────────────────

  it('.ping 私聊也能正常回复', async () => {
    const result = await router.handle(makePrivateMsg('.ping'));
    expect(result).toBe(true);
    expect(mockSendPrivate).toHaveBeenCalledOnce();
  });
});
