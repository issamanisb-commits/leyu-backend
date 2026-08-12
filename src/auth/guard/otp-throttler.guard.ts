import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class HttpOnlyThrottlerGuard extends ThrottlerGuard {
  constructor(options: any, storageService: ThrottlerStorageService, reflector: Reflector) {
    super(options, storageService, reflector);
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    return super.canActivate(context);
  }
}
