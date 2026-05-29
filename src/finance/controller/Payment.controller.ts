import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { WalletService } from '../service/Wallet.service';
import { PaymentPayoutCallbackDto } from '../dto/PaymentCallback.dto';
import { PaymentService } from '../service/Payment.service';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Payment payout webhook  no JWT auth, secured by HMAC-SHA256 signature.
   * Payment sends `x-Payment-signature: <hex>` in the request headers.
   */
  @Post('payment/callback')
  @HttpCode(HttpStatus.OK)
  async PaymentPayoutCallback(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-Payment-signature') signature: string,
    @Body() payload: PaymentPayoutCallbackDto,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing x-Payment-signature header');
    }

    const rawBody = req.rawBody;
    this.logger.warn({
        body:rawBody
    })
    this.logger.warn({
        rawBody:rawBody
    })

    this.logger.warn({
        payload:payload
    })

    if (!rawBody) {
      throw new BadRequestException('Raw body unavailable for signature verification');
    }

    // Verify HMAC signature before processing
    this.paymentService.verifyWebhookSignature(rawBody, signature);

    const { transactionId, isSuccess, isFailed, raw } =
      this.paymentService.parsePayoutCallback(payload);

    if (!isSuccess && !isFailed) {
      // Unknown status  acknowledge and ignore
      this.logger.warn(`Unknown Payment payout status: ${payload.status}`);
      return { received: true };
    }

    await this.walletService.handlePaymentPayoutCallback(
      transactionId,
      isSuccess,
      {
        Payment_reference: raw.Payment_reference,
        bank_reference: raw.bank_reference,
        Payment_status: raw.status,
        Payment_event: raw.event,
      },
    );

    return { received: true };
  }
}
