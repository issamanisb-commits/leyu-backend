import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export enum IdempotencyStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface IdempotencyRecord {
  id: string;
  status: IdempotencyStatus;
  response_snapshot?: any;
}

@Injectable()
export class IdempotencyService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;

  // TTL for completed/failed records: 24 hours
  private readonly TTL_SECONDS = 86400;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') as string;
    this.client = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  private key(idempotencyKey: string, userId: string): string {
    return `idempotency:${userId}:${idempotencyKey}`;
  }

  async findRecord(
    idempotencyKey: string,
    userId: string,
  ): Promise<IdempotencyRecord | null> {
    const raw = await this.client!.get(this.key(idempotencyKey, userId));
    if (!raw) return null;
    return JSON.parse(raw) as IdempotencyRecord;
  }

  async createProcessing(
    idempotencyKey: string,
    userId: string,
  ): Promise<IdempotencyRecord> {
    const record: IdempotencyRecord = {
      id: `${userId}:${idempotencyKey}`,
      status: IdempotencyStatus.PROCESSING,
    };
    // NX  only set if not exists; prevents race conditions
    await this.client!.set(
      this.key(idempotencyKey, userId),
      JSON.stringify(record),
      'EX',
      this.TTL_SECONDS,
      'NX',
    );
    return record;
  }

  async markCompleted(
    idempotencyKey: string,
    userId: string,
    snapshot: any,
  ): Promise<void> {
    const record: IdempotencyRecord = {
      id: `${userId}:${idempotencyKey}`,
      status: IdempotencyStatus.COMPLETED,
      response_snapshot: snapshot,
    };
    await this.client!.set(
      this.key(idempotencyKey, userId),
      JSON.stringify(record),
      'EX',
      this.TTL_SECONDS,
    );
  }

  async markFailed(idempotencyKey: string, userId: string): Promise<void> {
    const record: IdempotencyRecord = {
      id: `${userId}:${idempotencyKey}`,
      status: IdempotencyStatus.FAILED,
    };
    // Delete so the client can retry with the same key
    await this.client!.del(this.key(idempotencyKey, userId));
    // Optionally keep a short-lived failed marker (30 s) to absorb in-flight retries
    await this.client!.set(
      this.key(idempotencyKey, userId),
      JSON.stringify(record),
      'EX',
      30,
    );
  }
}
