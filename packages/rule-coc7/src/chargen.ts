import type { CocCharAttributes } from './types';

type RandFn = () => number;

function rollD6(rand: RandFn): number {
  return Math.floor(rand() * 6) + 1;
}

function sum3d6(rand: RandFn): number {
  return rollD6(rand) + rollD6(rand) + rollD6(rand);
}

function sum2d6plus6(rand: RandFn): number {
  return rollD6(rand) + rollD6(rand) + 6;
}

/**
 * CoC 7th 随机制卡。
 * 生成 8 属性 + 幸运 + HP。
 */
export function generateCharacter(rand?: RandFn): CocCharAttributes {
  const r = rand ?? (() => Math.random());

  const STR = sum3d6(r) * 5;
  const CON = sum3d6(r) * 5;
  const SIZ = sum2d6plus6(r) * 5;
  const DEX = sum3d6(r) * 5;
  const APP = sum3d6(r) * 5;
  const INT = sum2d6plus6(r) * 5;
  const POW = sum3d6(r) * 5;
  const EDU = sum2d6plus6(r) * 5;
  const LUK = sum3d6(r) * 5;
  const HP = Math.floor((CON + SIZ) / 10);

  const detail = [
    `STR(力量): ${STR}  CON(体质): ${CON}  SIZ(体型): ${SIZ}`,
    `DEX(敏捷): ${DEX}  APP(外貌): ${APP}  INT(智力): ${INT}`,
    `POW(意志): ${POW}  EDU(教育): ${EDU}`,
    `LUK(幸运): ${LUK}  HP(生命): ${HP}`,
  ].join('\n');

  return { STR, CON, SIZ, DEX, APP, INT, POW, EDU, LUK, HP, detail };
}
