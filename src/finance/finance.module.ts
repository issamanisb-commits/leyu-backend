import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Wallet } from './entities/Wallet.entity';
import { ScoreValue } from './entities/ScoreValue.entity';
import { Transaction } from './entities/Transaction.entity';
import { WalletService } from './service/Wallet.service';
import { ScoreValueService } from './service/ScoreValue.service';
import { TransactionService } from './service/Transaction.service';
import { WalletController } from './controller/Wallet.controller';
import { TransactionController } from './controller/Transaction.controller';
import { ScoreValueController } from './controller/ScoreValue.controller';
import { PaymentService } from './service/Payment.service';
import { IdempotencyService } from './service/Idempotency.service';
import { PaymentController } from './controller/Payment.controller';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Wallet, ScoreValue, Transaction]),
  ],
  controllers: [WalletController, TransactionController, ScoreValueController, PaymentController],
  providers: [
    WalletService,
    ScoreValueService,
    TransactionService,
    PaymentService,
    IdempotencyService,
  ],
  exports: [WalletService, ScoreValueService, IdempotencyService],
})
export class FinanceModule {}
