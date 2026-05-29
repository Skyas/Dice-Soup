import { describe, it, expect } from 'vitest';
import { Sw25PowerTable } from '../power-table';

const table = new Sw25PowerTable();

describe('SW2.5 威力表', () => {
  describe('自动失败', () => {
    it('出目2 是自动失败', () => {
      expect(table.isAutoFail(2)).toBe(true);
      expect(table.isAutoFail(3)).toBe(false);
    });

    it('出目2 查表返回0', () => {
      expect(table.lookup(30, 2)).toBe(0);
    });
  });

  describe('威力0 边界', () => {
    it('威力0 出目7', () => {
      expect(table.lookup(0, 7)).toBe(2);
    });
    it('威力0 出目12', () => {
      expect(table.lookup(0, 12)).toBe(4);
    });
    it('威力0 出目3', () => {
      expect(table.lookup(0, 3)).toBe(0);
    });
  });

  describe('威力30 校验', () => {
    // 计划书数据: 30: 2 4 4 6 7 8 9 10 10 10
    it('威力30 出目3=2', () => { expect(table.lookup(30, 3)).toBe(2); });
    it('威力30 出目4=4', () => { expect(table.lookup(30, 4)).toBe(4); });
    it('威力30 出目5=4', () => { expect(table.lookup(30, 5)).toBe(4); });
    it('威力30 出目6=6', () => { expect(table.lookup(30, 6)).toBe(6); });
    it('威力30 出目7=7', () => { expect(table.lookup(30, 7)).toBe(7); });
    it('威力30 出目8=8', () => { expect(table.lookup(30, 8)).toBe(8); });
    it('威力30 出目9=9', () => { expect(table.lookup(30, 9)).toBe(9); });
    it('威力30 出目10=10', () => { expect(table.lookup(30, 10)).toBe(10); });
    it('威力30 出目11=10', () => { expect(table.lookup(30, 11)).toBe(10); });
    it('威力30 出目12=10', () => { expect(table.lookup(30, 12)).toBe(10); });
  });

  describe('威力50 校验', () => {
    // 计划书数据: 50: 4 6 8 10 10 12 12 13 15 15
    it('威力50 出目3=4',  () => { expect(table.lookup(50, 3)).toBe(4);  });
    it('威力50 出目7=10', () => { expect(table.lookup(50, 7)).toBe(10); });
    it('威力50 出目12=15',() => { expect(table.lookup(50, 12)).toBe(15);});
  });

  describe('威力100 校验', () => {
    // 计划书数据: 100: 8 12 15 18 19 20 22 24 27 30
    it('威力100 出目3=8',  () => { expect(table.lookup(100, 3)).toBe(8);  });
    it('威力100 出目12=30',() => { expect(table.lookup(100, 12)).toBe(30);});
  });

  describe('错误处理', () => {
    it('威力值超范围报错', () => {
      expect(() => table.lookup(101, 7)).toThrow();
      expect(() => table.lookup(-1, 7)).toThrow();
    });
    it('出目超范围报错', () => {
      expect(() => table.lookup(30, 1)).toThrow();
      expect(() => table.lookup(30, 13)).toThrow();
    });
  });
});
