import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThrottlerModule } from '@nestjs/throttler';
import { BaseDataModule } from './base_data/base_data.module';
import { CommonModule } from './common/common.module';
import { ProjectModule } from './project/project.module';
import { DataSetModule } from './data_set/data_set.module';
import { CommunicationModule } from './communication/communication.module';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from 'src/database/data-source';
import { ConfigModule } from '@nestjs/config';
import { SmsModule } from './sms/sms.module';
import { FinanceModule } from './finance/finance.module';
import { EmailModule } from './email/email.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { HealthModule } from './health/health.module';
import { LoggerMiddleware } from './middleware/logger.middleware';
import { TaskDistributionModule } from './task_distribution/task_distribution.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { StatisticsModule } from './statistics/statistics.module';
import { CacheModule } from './cache/cache.module';
import { BullModule } from '@nestjs/bullmq';
import { BackgroundTaskModule } from './background_task/background_task.module';
import * as Joi from 'joi';
import configuration from './config/configuration';
import { I18nModule, QueryResolver } from 'nestjs-i18n';
import { YcI18nModule } from './yc-i18n/yc-i18n.module';
import * as path from 'path';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { HttpOnlyThrottlerGuard } from './auth/guard/otp-throttler.guard';
import { ChatbotModule } from './chatbot/chatbot.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, //  Makes ConfigModule available in all modules,
      load: [configuration],
      validationSchema: Joi.object({
        PORT: Joi.number().required(),
        NODE_ENV: Joi.string()
          .required()
          .valid('development', 'production', 'test', 'provision'),
        JWT_SECRET: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().required(),
        DATABASE_URL: Joi.string().required(),
        DATABASE_SCHEMA: Joi.string().required(),
        REDIS_HOST: Joi.string().required(),
        REDIS_PORT: Joi.number().required(),
        REDIS_URL: Joi.string().required(),
        RABBITMQ_URI: Joi.string().required(),
        RABBITMQ_QUEUE_NAME: Joi.string().required(),
        RABBITMQ_EXCHANGE_NAME: Joi.string().required(),
        RABBITMQ_EXCHANGE_TYPE: Joi.string().required(),
        RABBITMQ_ROUTING_KEY: Joi.string().required(),
        RABBITMQ_DURABLE: Joi.string().required(),
        DATASET_RABBITMQ_EXCHANGE_NAME: Joi.string().required(),
        DATASET_RABBITMQ_QUEUE_NAME: Joi.string().required(),
        DATASET_RABBITMQ_ROUTING_KEY: Joi.string().required(),
        AFRO_SMS_BASE_URL: Joi.string().required(),
        AFRO_SMS_IDENTIFIER: Joi.string().required(),
        AFRO_SMS_SENDER: Joi.string().required(),
        AFRO_TOKEN: Joi.string().required(),
        MINIO_ENDPOINT: Joi.string().required(),
        MINIO_ACCESS_KEY: Joi.string().required(),
        MINIO_SECRET_KEY: Joi.string().required(),
        MINIO_BUCKET: Joi.string().required(),
        EMAIL_USER: Joi.string().required(),
        EMAIL_PASS: Joi.string().required(),
        Payment_BASE_URL: Joi.string().required(),
        WITHDRAW_PAYLOAD_SECRET: Joi.string().required(),
        FRONTEND_URL: Joi.string().required(),
        WALLET_INTEGRITY_SECRET: Joi.string().required(),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    MailerModule.forRoot({
      transport: {
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      },
      defaults: {
        from: '"Leyu" leyu@gmail.com',
      },
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, 'i18n'),
        watch: process.env.NODE_ENV !== 'production',
      },
      resolvers: [new QueryResolver(['lang'])],
      typesOutputPath: path.join(
        __dirname,
        '../src/generated/i18n.generated.ts',
      ),
    }),

    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 400,
        },
      ],
      storage: new ThrottlerStorageRedisService(
        process.env.REDIS_URL ||
          `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
      ),
      errorMessage: 'Too many requests, please try again later.',
    }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL,
        // host: 'localhost',
        // port: 6379,
      },
    }),

    TypeOrmModule.forRoot(dataSourceOptions),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    SmsModule,
    BaseDataModule,
    AuthModule,
    CommonModule,
    ProjectModule,
    ProjectModule,
    DataSetModule,
    CommunicationModule,
    FinanceModule,
    EmailModule,
    HealthModule,
    TaskDistributionModule,
    StatisticsModule,
    CacheModule,
    BackgroundTaskModule,
    YcI18nModule,
    ChatbotModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: HttpOnlyThrottlerGuard,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
