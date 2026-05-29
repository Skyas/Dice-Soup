export type DiceErrorCode =
  | 'DICE_SYNTAX_ERROR'
  | 'DICE_DIVIDE_BY_ZERO'
  | 'DICE_SIDES_ZERO'
  | 'DICE_COUNT_INVALID'
  | 'DICE_KEEP_TOO_MANY'
  | 'DICE_UNKNOWN_VARIABLE'
  | 'DICE_POWER_CHAIN_LIMIT'
  | 'DICE_POWER_VALUE_OUT_OF_RANGE'
  | 'DICE_CRITICAL_VALUE_INVALID'
  | 'DICE_MULTI_ROLL_COUNT_INVALID';

export class DiceError extends Error {
  constructor(
    public readonly code: DiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DiceError';
  }
}
