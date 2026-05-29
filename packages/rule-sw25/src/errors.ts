export type Sw25ErrorCode =
  | 'SW25_INVALID_POWER'
  | 'SW25_INVALID_CRITICAL_VALUE'
  | 'SW25_INVALID_DICE_SUM';

export class Sw25Error extends Error {
  constructor(
    public readonly code: Sw25ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'Sw25Error';
  }
}
