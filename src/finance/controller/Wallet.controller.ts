import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WalletService } from '../service/Wallet.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guard/role.guard';
import { Role } from 'src/auth/decorators/roles.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { WithdrawMoneyDto } from '../dto/wallet.dto';
import { User } from 'src/auth/entities/User.entity';
import { DataSource } from 'typeorm';
import { WithdrawPayloadHmacGuard } from '../guard/withdraw-payload-hmac.guard';
import {
  IdempotencyService,
  IdempotencyStatus,
} from '../service/Idempotency.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly dataSource: DataSource,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('withdraw-money')
  @Roles(Role.CONTRIBUTOR, Role.REVIEWER)
  @UseGuards(WithdrawPayloadHmacGuard)
  async withdrawMoney(
    @Body() withDrawData: WithdrawMoneyDto,
    @Request() req,
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Headers('x-payload-signature') payloadSignature: string,
  ) {
    // Requirement 1.1, 1.2  X-Idempotency-Key is required
    if (!idempotencyKey) {
      throw new BadRequestException('X-Idempotency-Key header is required');
    }

    const user = req.user as User;

    // Requirement 1.3, 1.4, 1.5  check idempotency before opening DB transaction
    const existing = await this.idempotencyService.findRecord(
      idempotencyKey,
      user.id,
    );

    if (existing) {
      if (existing.status === IdempotencyStatus.COMPLETED) {
        // Requirement 1.3  return cached response
        return existing.response_snapshot;
      }
      if (existing.status === IdempotencyStatus.PROCESSING) {
        // Requirement 1.4  reject with 409
        throw new ConflictException('Withdrawal already in progress');
      }
    }
    if(user.role.name===Role.REVIEWER){
      throw new BadRequestException('Withdrawal not allowed for reviewers yet !');
    }

    // Requirement 1.5  mark as processing before entering DB transaction
    await this.idempotencyService.createProcessing(idempotencyKey, user.id);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Requirement 2.3  withdrawal logic runs inside the DB transaction
      const result = await this.walletService.withdrawMoney(
        withDrawData,
        user,
        queryRunner,
      );

      await queryRunner.commitTransaction();

      // Requirement 1.6  mark completed and store snapshot
      await this.idempotencyService.markCompleted(
        idempotencyKey,
        user.id,
        result,
      );

      return result;
    } catch (withdrawError) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      // Requirement 1.7  mark failed so client can retry with same key
      await this.idempotencyService.markFailed(idempotencyKey, user.id);
      throw withdrawError;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }

  @Get('balance')
  @Roles(Role.CONTRIBUTOR, Role.REVIEWER)
  async getBalance(@Request() req) {
    const user = req.user as User;
    return await this.walletService.getBalance(user.id);
  }

  @Get('get-withdraw-options')
  @Roles(Role.CONTRIBUTOR, Role.REVIEWER)
  async get(@Request() req) {
    const user = req.user as User;
    return await this.walletService.getWithDrawOptions();
  }
}
