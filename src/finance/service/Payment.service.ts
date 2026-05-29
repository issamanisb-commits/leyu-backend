import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { PaymentPayoutCallbackDto } from '../dto/PaymentCallback.dto';
export interface PaymentBanks {
  id: string;
  slug: string;
  swift: string;
  name: string;
  acct_length: number;
  country_id: number;
  is_mobilemoney: number;
  is_active: number;
  is_rtgs: number;
  active: number;
  is_24hrs: number;
  created_at: string;
  updated_at: string;
  currency: string;
}
export interface PaymentBanksResponse {
  message: string;
  data: PaymentBanks[];
}
export interface PaymentTransferResponse {
  message: string;
  status: 'success' | 'failed';
  data: string;
}
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private baseUrl: string;
  private authenticationKey: string;
  private webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = configService.get<string>('PAYMENT_BASE_URL') || '';
    this.authenticationKey =
      this.configService.get<string>('PAYMENT_MERCHANT_ID') || '';
    this.webhookSecret =
      this.configService.get<string>('PAYMENT_WEBHOOK_SECRET') || '';
  }

  /**
   * Verify the Payment webhook HMAC-SHA256 signature.
   * Payment sends the hash in the `x-Payment-signature` header as
   * HMAC-SHA256(rawBody, webhookSecret).
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): void {
    if (!this.webhookSecret) {
      throw new InternalServerErrorException(
        'PAYMENT_WEBHOOK_SECRET is not configured',
      );
    }
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const suppliedBuf = Buffer.from(signature, 'utf8');

    if (
      expectedBuf.length !== suppliedBuf.length ||
      !timingSafeEqual(expectedBuf, suppliedBuf)
    ) {
      throw new UnauthorizedException('Invalid PAYMENT webhook signature');
    }
  }

  /**
   * Parse and return the payout callback payload.
   * Signature verification must be done before calling this (see verifyWebhookSignature).
   */
  parsePayoutCallback(payload: PaymentPayoutCallbackDto): {
    transactionId: string;
    isSuccess: boolean;
    isFailed: boolean;
    raw: PaymentPayoutCallbackDto;
  } {
    const isSuccess = payload.status === 'success';
    const isFailed = payload.status === 'failed' || payload.status === 'cancelled';

    this.logger.log(
      `Payment payout callback  ref: ${payload.reference}, status: ${payload.status}, Payment_ref: ${payload.Payment_reference}`,
    );

    return {
      transactionId: payload.reference,
      isSuccess,
      isFailed,
      raw: payload,
    };
  }
  async withDrawMoney(withDrawData: {
    account_name?: string;
    account_number: string;
    amount: number;
    bank_code: string;
    reference: string;
  }) {
    try {
      const url = `${this.baseUrl}/transfers`;
      const response = await axios.post(url, withDrawData, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authenticationKey}`,
        },
      });
      const resData: PaymentTransferResponse = response.data;
      if (resData.status == 'success') {
        return response.data;
      } else {
        throw new BadRequestException('Payment ERROR');
      }
    } catch (error: any) {
      if (error.response) {
        const data = error?.response?.data;
        let errorString = 'Payment ERROR';

        if (data && typeof data === 'object') {
          errorString = Object.entries(data)
            .map(([key, messages]) => {
              if (Array.isArray(messages)) {
                return `${key}: ${messages.join(', ')}`;
              }

              if (typeof messages === 'string') {
                return `${key}: ${messages}`;
              }

              if (typeof messages === 'object' && messages !== null) {
                return `${key}: ${JSON.stringify(messages)}`;
              }

              return `${key}: ${String(messages)}`;
            })
            .join(' | ');
        }

        throw new BadRequestException(errorString);
      }
      throw new BadRequestException(error.message);
    }
  }
  async getBanks(): Promise<PaymentBanks[]> {
    try {
      const url = `${this.baseUrl}/banks`;
      console.log('Base url ', url);
      const PaymentResponse = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authenticationKey}`,
        },
      });
      const response: PaymentBanksResponse = PaymentResponse.data;
      if (response.data) {
        return response.data;
      } else {
        throw new InternalServerErrorException('Payment is not responding');
      }
    } catch (error) {
      console.log(error.message);
      throw new InternalServerErrorException('Payment ERROR');
    }
  }
  
}
