import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class WithdrawPayloadHmacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-payload-signature'];

    if (!signature) {
      throw new BadRequestException('X-Payload-Signature header is required');
    }

    const secret = process.env.WITHDRAW_PAYLOAD_SECRET;
    if (!secret) {
      throw new BadRequestException('Payload secret is not configured');
    }

    const body = request.body ?? {};
    const canonicalJson = JSON.stringify(body, Object.keys(body).sort());
    const expected = createHmac('sha256', secret)
      .update(canonicalJson)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const suppliedBuf = Buffer.from(signature as string, 'utf8');
    

    if (
      expectedBuf.length !== suppliedBuf.length ||
      !timingSafeEqual(expectedBuf, suppliedBuf)
    ) {
      throw new UnauthorizedException('Invalid payload signature');
    }

    return true;
  }
}
