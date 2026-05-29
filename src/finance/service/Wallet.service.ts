import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryRunner, Repository } from 'typeorm';
import { Wallet } from '../entities/Wallet.entity';
import { TransactionService } from './Transaction.service';
import { Transaction } from '../entities/Transaction.entity';
import { PaymentService } from './Payment.service';
import { User } from 'src/auth/entities/User.entity';
import { createHmac } from 'crypto';
import { NotificationService } from 'src/common/service/Notification.service';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly transactionService: TransactionService,
    private readonly PaymentPaymentService: PaymentService,
    private readonly i18n: I18nService,
        private readonly notificationService:NotificationService,
  ) {}

  // ── Integrity helpers ────────────────────────────────────────────────────

  private computeHash(balance: number, heldBalance: number): string {
    const secret = process.env.WALLET_INTEGRITY_SECRET;
    if (!secret) {
      throw new InternalServerErrorException(
        'WALLET_INTEGRITY_SECRET is not configured',
      );
    }
    return createHmac('sha256', secret)
      .update(`${balance}:${heldBalance}`)
      .digest('hex');
  }

  /**
   * Verify the stored hash matches the current balance fields.
   * Throws if tampered. Skips check when hash is null (new wallets).
   */
  private verifyHash(wallet: Wallet): void {
    if (!wallet.integrity_hash) return; // first-time write, no prior hash
    const expected = this.computeHash(
      parseFloat(wallet.balance.toString()),
      parseFloat(wallet.held_balance.toString()),
    );
    if (wallet.integrity_hash !== expected) {
      throw new InternalServerErrorException('Wallet integrity check failed');
    }
  }

  /** Stamp a fresh hash onto the wallet object (call before saving). */
  private stampHash(
    wallet: Wallet,
    balance: number,
    heldBalance: number,
  ): void {
    wallet.integrity_hash = this.computeHash(balance, heldBalance);
  }

  async findAll(query: FindOptionsWhere<Wallet>): Promise<Wallet[]> {
    return this.walletRepository.find({ where: query });
  }

  async findOne(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { user_id: userId },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet for this user not found`);
    }
    return wallet;
  }
  async findOneOrCreate(
    userId: string,
    queryRunner?: QueryRunner,
  ): Promise<Wallet> {
    if (queryRunner) {
      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { user_id: userId },
      });
      if (!wallet) {
        const w = queryRunner.manager.create(Wallet, {
          user_id: userId,
          integrity_hash: this.computeHash(0, 0),
        });
        return queryRunner.manager.save(w);
      }
      return wallet;
    } else {
      const wallet = await this.walletRepository.findOne({
        where: { user_id: userId },
      });
      if (!wallet) {
        const w = this.walletRepository.create({
          user_id: userId,
          integrity_hash: this.computeHash(0, 0),
        });
        return this.walletRepository.save(w);
      }
      return wallet;
    }
  }

  async create(wallet: Partial<Wallet>): Promise<Wallet> {
    const balance = parseFloat((wallet.balance ?? 0).toString());
    const heldBalance = parseFloat((wallet.held_balance ?? 0).toString());
    const w = this.walletRepository.create({
      ...wallet,
      integrity_hash: this.computeHash(balance, heldBalance),
    });
    return this.walletRepository.save(w);
  }
  async addFunds(
    userId: string,
    amount: number,
    metadata: any,
    queryRunner: QueryRunner,
  ): Promise<Transaction> {
    const transaction = await this.transactionService.create(
      {
        user_id: userId,
        amount: amount,
        type: 'Credit',
        status: 'Done',
        metadata,
      },
      queryRunner,
    );
    const wallet = await this.findOneOrCreate(userId, queryRunner);

    this.verifyHash(wallet);

    const balance = parseFloat(wallet.balance.toString());
    const heldBalance = parseFloat(wallet.held_balance.toString());
    const newBalance = balance + amount;

    this.stampHash(wallet, newBalance, heldBalance);
    await queryRunner.manager.update(
      Wallet,
      { id: wallet.id },
      { balance: newBalance, integrity_hash: wallet.integrity_hash },
    );
    return transaction;
  }

  async withdrawMoney(
  withDrawData: {
    account_name?: string;
    account_number: string;
    amount: number;
    bank_code: string;
  },
  user: User,
  queryRunner: QueryRunner,
): Promise<Transaction> {
  // Acquire pessimistic write lock on the wallet row
  const wallet = await queryRunner.manager.findOne(Wallet, {
    where: { user_id: user.id },
    lock: { mode: 'pessimistic_write' },
  });

  if (!wallet) {
    throw new NotFoundException(`Wallet for this user not found`);
  }

  // Verify integrity before any mutation
  this.verifyHash(wallet);

  const balance = parseFloat(wallet.balance.toString());
  const heldBalance = parseFloat(wallet.held_balance.toString());
  const withdrawAmount = parseFloat(withDrawData.amount.toString());

  // Compute available balance as balance − held_balance
  const availableBalance = balance - heldBalance;

  // Reject if withdrawal amount exceeds available balance
  if (withdrawAmount > availableBalance) {
    throw new BadRequestException('Insufficient available balance');
  }

  // Increment held_balance to freeze funds while Payment processes
  const newHeld = heldBalance + withdrawAmount;
  this.stampHash(wallet, balance, newHeld);
  wallet.held_balance = newHeld;
  await queryRunner.manager.save(wallet);

  // Create a Pending transaction  callback will finalise it
  const transaction = await this.transactionService.create(
    {
      user_id: user.id,
      amount: -withdrawAmount,
      type: 'Withdraw',
      status: 'Pending',
      metadata: withDrawData,
    },
    queryRunner,
  );

  // Fire payout request to Payment  do not await success/failure here
  // handlePaymentPayoutCallback owns all balance mutations from this point
  await this.PaymentPaymentService.withDrawMoney({
    account_name:
      user.first_name + ' ' + user.middle_name + ' ' + user.last_name,
    account_number: withDrawData.account_number,
    amount: withdrawAmount,
    bank_code: withDrawData.bank_code,
    reference: transaction.id,
  });

  return transaction;
}

  async remove(id: string) {
    const wallet = await this.walletRepository.findOne({ where: { id } });
    if (!wallet) {
      throw new NotFoundException(`Wallet with id ${id} not found`);
    }
    await this.walletRepository.remove(wallet);
  }
  async getBalance(userId: string): Promise<number> {
    const wallet = await this.walletRepository.findOne({
      where: { user_id: userId },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet for this user not found`);
    }
    return wallet.balance;
  }
  async getWithDrawOptions(): Promise<any> {
    return this.PaymentPaymentService.getBanks();
  }

  /**
   * Called by the Payment webhook controller after signature verification.
   * - success  → deduct balance, release hold, mark transaction Done
   * - failed/cancelled → release hold only, mark transaction Failed
   */
  async handlePaymentPayoutCallback(
    transactionId: string,
    isSuccess: boolean,
    metadata: Record<string, any>,
  ): Promise<void> {
    const queryRunner =
      this.walletRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const transaction = await queryRunner.manager.findOne(Transaction, {
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        // Unknown reference  log and ignore (don't throw, return 200 to Payment)
        return;
      }

      // Already finalised  idempotent, skip
      if (
        transaction.status === 'Done' ||
        transaction.metadata?.Payment_finalised
      ) {
        return;
      }

      const wallet = await queryRunner.manager.findOne(Wallet, {
        where: { user_id: transaction.user_id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new Error(`Wallet not found for user ${transaction.user_id}`);
      }
      const user=await queryRunner.manager.findOne(User, {
        where: { id: transaction.user_id }
      });

      this.verifyHash(wallet);

      const balance = parseFloat(wallet.balance.toString());
      const heldBalance = parseFloat(wallet.held_balance.toString());
      const withdrawAmount = Math.abs(
        parseFloat(transaction.amount.toString()),
      );
      const releaseHeld = Math.max(0, heldBalance - withdrawAmount);

      if (isSuccess) {
        // Deduct from balance, release hold
        const newBalance = balance - withdrawAmount;
        this.stampHash(wallet, newBalance, releaseHeld);
        wallet.balance = newBalance;
        wallet.held_balance = releaseHeld;
        await queryRunner.manager.save(wallet);
        await queryRunner.manager.update(
          Transaction,
          { id: transactionId },
          {
            status: 'Done',
            metadata: {
              ...transaction.metadata,
              ...metadata,
              Payment_finalised: true,
            } as any,
          },
        );
        await queryRunner.commitTransaction();
        const title= this.i18n.t('common.withdrawal_success_notification_title', {
          lang:user?.preferred_language||'en'
        }) || '';
        const message= this.i18n.t('common.withdrawal_success_notification_message', {
            lang:user?.preferred_language||'en',
            args:{amount:withdrawAmount}
          }) || '';
        await this.notificationService.create(
          {
            user_id: transaction.user_id,
            title: title,
            message: message,
            type: 'wallet-withdrawal-success'
          }
        )
      } else {
        // Release hold only  balance unchanged
        this.stampHash(wallet, balance, releaseHeld);
        wallet.held_balance = releaseHeld;
        await queryRunner.manager.save(wallet);
        await queryRunner.manager.update(
          Transaction,
          { id: transactionId },
          {
            status: 'Failed',
            metadata: {
              ...transaction.metadata,
              ...metadata,
              Payment_finalised: true,
            } as any,
          },
        );
      }

      await queryRunner.commitTransaction();
      const title= this.i18n.t('common.withdrawal_failed_notification_title', {
        lang:user?.preferred_language||'en'
      }) || '';
      const message= this.i18n.t('common.withdrawal_failed_notification_message', {
          lang:user?.preferred_language||'en'
        }) || '';
      await this.notificationService.create(
        {
          user_id: transaction.user_id,
          title: title,
          message: message,
          type: 'wallet-withdrawal-failed'
        }
      )
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (!queryRunner.isReleased) {
        await queryRunner.release();
      }
    }
  }
}
