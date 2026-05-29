import { describe, it, expect } from 'vitest';
import { generateCharacter } from '../chargen';

describe('CoC 制卡', () => {
  it('属性在合法范围内', () => {
    for (let i = 0; i < 10; i++) {
      const char = generateCharacter();
      // 3d6×5: 15~90
      expect(char.STR).toBeGreaterThanOrEqual(15);
      expect(char.STR).toBeLessThanOrEqual(90);
      expect(char.CON).toBeGreaterThanOrEqual(15);
      expect(char.CON).toBeLessThanOrEqual(90);
      expect(char.DEX).toBeGreaterThanOrEqual(15);
      expect(char.DEX).toBeLessThanOrEqual(90);
      // (2d6+6)×5: 40~90
      expect(char.SIZ).toBeGreaterThanOrEqual(40);
      expect(char.SIZ).toBeLessThanOrEqual(90);
      expect(char.INT).toBeGreaterThanOrEqual(40);
      expect(char.INT).toBeLessThanOrEqual(90);
      expect(char.EDU).toBeGreaterThanOrEqual(40);
      expect(char.EDU).toBeLessThanOrEqual(90);
      // HP = floor((CON+SIZ)/10)
      expect(char.HP).toBe(Math.floor((char.CON + char.SIZ) / 10));
    }
  });

  it('固定随机数产生确定属性', () => {
    let i = 0;
    const values = [0, 0.5, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];
    const rand = () => values[i++ % values.length]!;
    const char = generateCharacter(rand);
    expect(char.HP).toBe(Math.floor((char.CON + char.SIZ) / 10));
    expect(char.detail).toBeDefined();
  });

  it('detail 包含所有属性', () => {
    const char = generateCharacter();
    expect(char.detail).toContain('STR');
    expect(char.detail).toContain('CON');
    expect(char.detail).toContain('HP');
    expect(char.detail).toContain('LUK');
  });
});
