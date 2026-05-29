import { describe, it, expect } from 'vitest';
import { skillCheck } from '../check';
import { CocError } from '../errors';

describe('技能检定', () => {
  describe('标准成功等级', () => {
    const skill = 70;
    const hard = 35;
    const extreme = 14;

    it('极难成功 (≤14)', () => {
      const r = skillCheck({ rolled: extreme, skillValue: skill });
      expect(r.level).toBe('extreme');
      expect(r.isSuccess).toBe(true);
    });

    it('困难成功 (≤35)', () => {
      const r = skillCheck({ rolled: hard, skillValue: skill });
      expect(r.level).toBe('hard');
      expect(r.isSuccess).toBe(true);
    });

    it('成功 (≤70)', () => {
      const r = skillCheck({ rolled: skill, skillValue: skill });
      expect(r.level).toBe('regular');
      expect(r.isSuccess).toBe(true);
    });

    it('失败 (>70)', () => {
      const r = skillCheck({ rolled: 71, skillValue: skill });
      expect(r.level).toBe('failure');
      expect(r.isSuccess).toBe(false);
    });
  });

  describe('房规 0（默认）', () => {
    it('出1=大成功', () => {
      const r = skillCheck({ rolled: 1, skillValue: 50, houseRule: 0 });
      expect(r.level).toBe('critical');
    });

    it('技能<50 出96=大失败', () => {
      const r = skillCheck({ rolled: 96, skillValue: 49, houseRule: 0 });
      expect(r.level).toBe('fumble');
    });

    it('技能≥50 出99≠大失败', () => {
      const r = skillCheck({ rolled: 99, skillValue: 50, houseRule: 0 });
      expect(r.level).toBe('failure');
    });

    it('技能≥50 出100=大失败', () => {
      const r = skillCheck({ rolled: 100, skillValue: 50, houseRule: 0 });
      expect(r.level).toBe('fumble');
    });
  });

  describe('房规 2（常用）', () => {
    it('出1-5且成功=大成功', () => {
      const r = skillCheck({ rolled: 5, skillValue: 60, houseRule: 2 });
      expect(r.level).toBe('critical');
    });

    it('出1-5但失败≠大成功', () => {
      const r = skillCheck({ rolled: 5, skillValue: 4, houseRule: 2 });
      expect(r.level).toBe('failure'); // rolled>skillValue
    });

    it('出96-100且失败=大失败', () => {
      const r = skillCheck({ rolled: 96, skillValue: 30, houseRule: 2 });
      expect(r.level).toBe('fumble');
    });
  });

  describe('房规 3', () => {
    it('出1-5无视判定=大成功', () => {
      const r = skillCheck({ rolled: 3, skillValue: 1, houseRule: 3 }); // 正常是大失败
      expect(r.level).toBe('critical');
    });

    it('出96-100=大失败', () => {
      const r = skillCheck({ rolled: 97, skillValue: 99, houseRule: 3 }); // 正常是成功
      expect(r.level).toBe('fumble');
    });
  });

  describe('边界', () => {
    it('技能值1: 极难成功=1', () => {
      const r = skillCheck({ rolled: 1, skillValue: 1, houseRule: 0 });
      // 出1 → 大成功（房规0优先于极难）
      expect(r.level).toBe('critical');
    });

    it('技能值100: 任意≤100=成功', () => {
      const r = skillCheck({ rolled: 100, skillValue: 100, houseRule: 0 });
      // 出100 with 技能=100 and 房规0: 技能≥50 出100=大失败
      expect(r.level).toBe('fumble');
    });

    it('技能值无效报错', () => {
      expect(() => skillCheck({ rolled: 50, skillValue: 0 })).toThrow(CocError);
      expect(() => skillCheck({ rolled: 50, skillValue: 101 })).toThrow(CocError);
    });
  });

  describe('输出格式', () => {
    it('detail 包含技能名和结果', () => {
      const r = skillCheck({ rolled: 30, skillValue: 70, skillName: '侦查', playerName: '爱丽丝' });
      expect(r.detail).toContain('侦查');
      expect(r.detail).toContain('爱丽丝');
      expect(r.detail).toContain('30');
      expect(r.detail).toContain('70');
    });
  });
});
