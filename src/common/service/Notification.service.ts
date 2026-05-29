import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationDto } from 'src/common/dto/Pagination.dto';
import { PaginationService } from 'src/common/service/pagination.service';
import { PaginatedResult } from 'src/utils/paginate.util';
import { In, Repository } from 'typeorm';
import { Notification, NotificationType } from '../entities/Notifaction.entity';
import { QueryOptions } from 'src/utils/queryOption.util';
import { PublisherService } from './RabbitPublish.service';
@Injectable()
export class NotificationService {
  private readonly paginationService: PaginationService<Notification>;
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private rabbitPublishService: PublisherService,
  ) {
    this.paginationService = new PaginationService<Notification>(
      this.notificationRepository,
    );
  }

  async create(notificationData: {
    user_id: string;
    title: string;
    message: string;
    type: NotificationType;
    target?:'email'|'push',
    email?:string
  }): Promise<boolean> {
    console.log('notificationData', notificationData);
    return await this.rabbitPublishService.publishNotificationEvent({
      userId: notificationData.user_id,
      notificationType: notificationData.type,
      title: notificationData.title,
      displayName: 'Leyu',
      message: notificationData.message,
      payload: { title: notificationData.title },
      target:notificationData.target??'push',
      email:notificationData.email
    });
  }

  async findPaginate(
    queryOption: QueryOptions<Notification>,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Notification>> {
    const newNotifications =
      await this.paginationService.paginateWithOptionQuery(
        paginationDto,
        'notification',
        queryOption,
      );
    const notifies = newNotifications.result;
    await this.updateToRead(notifies.map((n) => n.id));
    return newNotifications;
  }

  async countNewNotifications(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { user_id: userId, is_read: false },
    });
  }
  async updateToRead(notificationIds: string[]) {
    await this.notificationRepository.update(
      { id: In(notificationIds) },
      { is_read: true },
    );
  }
}
