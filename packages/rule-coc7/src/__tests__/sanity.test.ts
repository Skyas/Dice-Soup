import { describe, it, expect } from 'vitest';
import { sanCheck } from '../sanity';
import { CocError } from '../errors';

describe('理智检定', () => {
  it('成功时损失少', () => {
    const r = sanCheck({ rolled: 40, sanValue: 60, successLoss: 1, failureLoss: 6 });
    expect(r.success).toBe(true);
    expect(r.loss).toBe(1);
    expect(r.sanAfter).toBe(59);
  });

  it('失败时损失多', () => {
    const r = sanCheck({ rolled: 70, sanValue: 60, successLoss: 1, failureLoss: 6 });
    expect(r.success).toBe(false);
    expect(r.loss).toBe(6);
    expect(r.sanAfter).toBe(54);
  });

  it('--half 减半', () => {
    const r = sanCheck({ rolled: 70, sanValue: 60, successLoss: 1, failureLoss: 6, half: true });
    expect(r.loss).toBe(3); // ceil(6/2)
  });

  it('--cap 上限截断', () => {
    const r = sanCheck({ rolled: 70, sanValue: 60, successLoss: 1, failureLoss: 10, cap: 3 });
    expect(r.loss).toBe(3);
  });

  it('先减半再上限截断 (--cap --half)', () => {
    // 失败损失 10 → 减半 → 5 → 上限 3 → 3
    const r = sanCheck({ rolled: 70, sanValue: 60, successLoss: 1, failureLoss: 10, cap: 3, half: true });
    expect(r.loss).toBe(3);
  });

  it('SAN 不低于 0', () => {
    const r = sanCheck({ rolled: 70, sanValue: 5, successLoss: 1, failureLoss: 10 });
    expect(r.sanAfter).toBe(0);
  });

  it('SAN 值无效报错', () => {
    expect(() => sanCheck({ rolled: 50, sanValue: 100, successLoss: 1, failureLoss: 1 })).toThrow(CocError);
    expect(() => sanCheck({ rolled: 50, sanValue: -1, successLoss: 1, failureLoss: 1 })).toThrow(CocError);
  });

  it('detail 包含关键信息', () => {
    const r = sanCheck({ rolled: 30, sanValue: 60, successLoss: 0, failureLoss: 3, playerName: '鲍勃' });
    expect(r.detail).toContain('鲍勃');
    expect(r.detail).toContain('30');
    expect(r.detail).toContain('60');
  });
});
