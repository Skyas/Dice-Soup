import { DiceError } from '@dice-soup/dice-engine';

export type CocErrorCode =
  | 'COC_INVALID_SKILL_VALUE'
  | 'COC_INVALID_SAN_VALUE'
  | 'COC_INVALID_HOUSE_RULE'
  | 'COC_INVALID_GROWTH_EXPR';

export class CocError extends Error {
  constructor(
    public readonly code: CocErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CocError';
  }
}

export type RuleError = CocError | DiceError;
