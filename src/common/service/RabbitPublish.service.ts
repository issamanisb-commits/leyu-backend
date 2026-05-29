// some.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '../entities/Notifaction.entity';
// contracts/dataset-action.event.ts
export type DatasetAction = 'APPROVED' | 'REJECTED' | 'INVITED';

export interface DatasetActionEvent {
  datasetReviewId: string;
  action: DatasetAction;
  actorId: string;
  timestamp: string;
}
@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);
  private readonly exchangeName: string;
  private readonly routingKey: string;
  // private readonly queueName:string;

  private readonly dataSetExchangeName: string;
  private readonly dataSetRoutingKey: string;
  //  National ID Image verification
  private readonly IDVerificationExchangeName: string;
  private readonly IDVerificationKey: string;
  // private readonly dataSetQueueName:string;
  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly configService: ConfigService,
  ) {
    this.exchangeName =
      this.configService.get<string>('RABBITMQ_EXCHANGE_NAME') ||
      'notifications.exchange';
    this.routingKey =
      this.configService.get<string>('RABBITMQ_ROUTING_KEY') ||
      'notification.created';
    // this.queueName =
    //   this.configService.get<string>('RABBITMQ_QUEUE_NAME') || 'notifications.queue';
    this.dataSetExchangeName =
      this.configService.get<string>('DATASET_RABBITMQ_EXCHANGE_NAME') ||
      'dataset.exchange';
    this.dataSetRoutingKey =
      this.configService.get<string>('DATASET_RABBITMQ_ROUTING_KEY') ||
      'dataset.created';
    this.IDVerificationExchangeName =
      this.configService.get<string>('ID_VERIFICATION_EXCHANGE_NAME') ||
      'id_verification.exchange';
    this.IDVerificationKey =
      this.configService.get<string>('ID_VERIFICATION_KEY') ||
      'id_verification.created';
    // this.dataSetQueueName =
    //   this.configService.get<string>('DATASET_RABBITMQ_QUEUE_NAME') || 'dataset.queue';
  }

  async publishNotificationEvent(data: {
    userId: string;
    notificationType: NotificationType;
    displayName: string;
    title: string;
    message?: string;
    payload?: object;
    target?:'email'|'push',
    email?:string
  }) {
    console.log('In publishNotificationEvent');
    return this.amqpConnection.publish(
      this.exchangeName,
      this.routingKey, // Routing key
      { data, pattern: 'notification.created' },
      { persistent: true }, // Options
    );
  }

  async publishDatasetAction(event: DatasetActionEvent) {
    await this.amqpConnection.publish(
      this.dataSetExchangeName,
      this.dataSetRoutingKey,
      event,
      { persistent: true },
    );
    this.logger.log(
      `Dataset action published: ${event.datasetReviewId} → ${event.action}`,
    );
  }
  async publishNationIdImage(event: { request_id: string; image_url: string }) {
    await this.amqpConnection.publish(
      this.IDVerificationExchangeName,
      this.IDVerificationKey,
      event,
    );
  }
}
