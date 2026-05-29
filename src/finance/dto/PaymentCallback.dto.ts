import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class PaymentPayoutCallbackDto {
  @IsString()
  @IsNotEmpty()
  event: string; // 'payout.success' | 'payout.failed' | 'payout.cancelled'

  @IsString()
  type: string;

  @IsString()
  account_name: string;

  @IsString()
  account_number: string;

  bank_id: number;

  @IsString()
  bank_name: string;

  @IsString()
  amount: string;

  @IsString()
  charge: string;

  @IsString()
  currency: string;

  @IsString()
  @IsIn(['success', 'failed', 'cancelled'])
  status: 'success' | 'failed' | 'cancelled';

  /** Matches the transaction.id we sent as reference to Payment */
  @IsString()
  @IsNotEmpty()
  reference: string;

  @IsString()
  Payment_reference: string;

  @IsString()
  bank_reference: string;

  created_at: string;
  updated_at: string;
}
