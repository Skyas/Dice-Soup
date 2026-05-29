import { levelToNumber, skillCheck } from './check';
import type { HouseRule } from './house-rules';
import type { OpposedCheckResult } from './types';
import { LEVEL_NAMES } from './house-rules';

/**
 * 对抗检定：双方各自投 1d100，比较成功等级。
 * 同等级时被动方（defender）优先。
 */
export function opposedCheck(opts: {
  attackerRolled: number;
  attackerSkill: number;
  attackerName?: string;
  attackerSkillName?: string;
  defenderRolled: number;
  defenderSkill: number;
  defenderName?: string;
  defenderSkillName?: string;
  houseRule?: HouseRule;
}): OpposedCheckResult {
  const {
    attackerRolled, attackerSkill, attackerName = '攻击方', attackerSkillName = '技能',
    defenderRolled, defenderSkill, defenderName = '防御方', defenderSkillName = '技能',
    houseRule = 0,
  } = opts;

  const attacker = skillCheck({
    rolled: attackerRolled,
    skillValue: attackerSkill,
    houseRule,
    skillName: attackerSkillName,
    playerName: attackerName,
  });

  const defender = skillCheck({
    rolled: defenderRolled,
    skillValue: defenderSkill,
    houseRule,
    skillName: defenderSkillName,
    playerName: defenderName,
  });

  const aLevel = levelToNumber(attacker.level);
  const dLevel = levelToNumber(defender.level);

  let winner: OpposedCheckResult['winner'];
  if (aLevel > dLevel) {
    winner = 'attacker';
  } else if (dLevel > aLevel) {
    winner = 'defender';
  } else {
    winner = 'draw'; // 同等级时被动方（defender）优先
  }

  const winnerName = winner === 'attacker' ? attackerName : winner === 'defender' ? defenderName : null;
  const resultStr = winnerName ? `${winnerName} 胜出` : `平局（被动方 ${defenderName} 优先）`;

  const detail = [
    `对抗检定:`,
    `  ${attacker.detail}`,
    `  ${defender.detail}`,
    `  结果: ${attackerName}[${LEVEL_NAMES[attacker.level]}] vs ${defenderName}[${LEVEL_NAMES[defender.level]}] → ${resultStr}`,
  ].join('\n');

  return { attacker, defender, winner, detail };
}
