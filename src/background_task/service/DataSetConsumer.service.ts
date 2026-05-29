// dataset.consumer.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { DataSource, QueryRunner } from 'typeorm';
import { UserTaskService } from 'src/project/service/UserTask.service';
import { CacheService } from 'src/cache/CacheService.service';
import { WalletService } from 'src/finance/service/Wallet.service';
import { NotificationService } from 'src/common/service/Notification.service';
import { ScoreValueService } from 'src/finance/service/ScoreValue.service';
import { UserScoreService } from 'src/auth/service/UserScore.service';
import { MicroTaskService } from 'src/data_set/service/MicroTask.service';
import { TaskService } from 'src/project/service/Task.service';
import { UserTask } from 'src/project/entities/UserTask.entity';
import { MicroTask } from 'src/data_set/entities/MicroTask.entity';
import { checkIfMicroTasIskRejectedAndTotalAttempts } from 'src/utils/MicroTask.util';
import { DataSetReview } from 'src/task_distribution/enitities/DataSetReview.entity';
import { DataSetStatus } from 'src/utils/constants/DataSetStatus.constant';
import { Task } from 'src/project/entities/Task.entity';
import { DataSet } from 'src/data_set/entities/DataSet.entity';
@Injectable()
export class DatasetConsumer {
  private readonly logger = new Logger(DatasetConsumer.name);

  constructor(
    // Inject necessary services here
    private readonly dataSource: DataSource,
    private readonly userTaskService: UserTaskService,
    private readonly cacheService: CacheService,
    private readonly scoreService: ScoreValueService,
    private readonly walletService: WalletService,
    private readonly notificationService: NotificationService,
    private readonly taskService: TaskService,
    private readonly microTaskService: MicroTaskService,
    private readonly userScoreService: UserScoreService,
    // private readonly i18n: I18nService,
  ) {}
  @RabbitSubscribe({
    exchange: process.env.DATASET_RABBITMQ_EXCHANGE_NAME || 'dataset.exchange',
    routingKey: process.env.DATASET_RABBITMQ_ROUTING_KEY || 'dataset.action',
    queue: process.env.DATASET_RABBITMQ_QUEUE_NAME || 'dataset.queue',
    queueOptions: {
      durable: true,
      deadLetterRoutingKey:'dataset.dead',
      deadLetterExchange:'dataset.dlx',
    },
    errorHandler:(channel, message, error) => {
      channel.nack(message, false, false);
    }
  })
  async handleDatasetAction(message: {
    datasetReviewId: string;
    action: 'APPROVED' | 'REJECTED';
    actorId: string;
    timestamp: string;
  }): Promise<void | Nack> {
    try {
      this.logger.log(`Processing dataset ${message.datasetReviewId}`);
      if (message.action === 'REJECTED') {
        await this.handleRejected(message.datasetReviewId);
      } else if (message.action === 'APPROVED') {
        await this.handleApproved(message.datasetReviewId);
      }
    } catch (e) {
      this.logger.error(e);
      throw e;
    }
  }

  private async handleRejected(datasetReviewId: string): Promise<void> {
    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      //  Get the dataset

      const dataSetReview = await queryRunner.manager.findOne(DataSetReview, {
        where: { id: datasetReviewId },
        relations: {
          dataSet: {
            microTask: true,
            contributor: true,
          },
          reviewer: true,
        },
      });
      if (dataSetReview === null) {
        throw new BadRequestException('Data set already approved');
      }
      const task = await this.taskService.findOne({
        where: { id: dataSetReview.dataSet.microTask.task_id },
        relations: { payment: true, taskRequirement: true },
      });
      if (task === null) {
        throw new BadRequestException('Task not found');
      }
      const reviews = await queryRunner.manager.find(DataSetReview, {
        where: { data_set_id: dataSetReview.dataSet.id },
      });
      const taskPayment = task.payment;
      const maxReviewerPerDataSet =
        task.taskRequirement.max_reviewer_per_dataset;
      // total rejects before adding this one
      const totalRejectedReviews = reviews.filter(
        (review) => review.status === 'rejected',
      ).length;
      const totalFlaggedReviews = reviews.filter(
        (review) => review.is_flagged,
      ).length;
      const finalDataSetStatus =
        totalRejectedReviews >= 0.5 * maxReviewerPerDataSet
          ? DataSetStatus.REJECTED
          : dataSetReview.dataSet.status;
      const is_flagged =
        totalFlaggedReviews >= 0.5 * totalRejectedReviews ? true : false;
      const dataSetStatusBefore = dataSetReview.dataSet.status;
      if (
        task.require_contributor_test &&
        dataSetReview.dataSet.microTask.is_test &&
        dataSetStatusBefore !== finalDataSetStatus
      ) {
        // set user Task to rejected
        await this.userTaskService.rejectUserTask(
          {
            user_id: dataSetReview.dataSet.contributor_id,
            task_id: task.id,
          },
          queryRunner,
        );
        // Update contributor cache
        await this.cacheService.clearContributorTaskCache(
          dataSetReview.dataSet.contributor_id,
          dataSetReview.dataSet.microTask.task_id,
        );
      }

      // Credit user wallet
      const scoreValue = await this.scoreService.get();
      const score = scoreValue.value_in_birr;
      await this.walletService.addFunds(
        dataSetReview.reviewer_id,
        taskPayment.reviewer_credit_per_microtask * score,
        {
          data_set_review_id: dataSetReview.id,
          code: dataSetReview.dataSet.code,
        },
        queryRunner,
      );
      // Send Notification to the user
      if (dataSetStatusBefore !== finalDataSetStatus) {
        await this.cacheService.updateDataSetStatus(
          dataSetReview.dataSet.contributor_id,
          dataSetReview.dataSet.microTask.task_id,
          dataSetReview.dataSet.micro_task_id,
          'Rejected',
        );
        await queryRunner.manager.update(DataSet, dataSetReview.dataSet.id, {
          status: 'Rejected',
          is_flagged: is_flagged ? true : false,
        });
        const title = 'Task Rejected';
        const message =
          'Your task with code ' +
          dataSetReview.dataSet.code +
          ' on task ' +
          task.name +
          'has been rejected. Please try again.';
        await this.notificationService.create({
          user_id: dataSetReview.dataSet.contributor_id,
          title,
          message,
          type: 'task-rejected',
        });
        await this.userScoreService.reduceContributorScoreForRejectedDataSet(
          dataSetReview.dataSet.contributor_id,
          queryRunner,
        );
      }
      await queryRunner.commitTransaction();
    } catch (err: any) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(
        `Error processing rejected dataset  ${datasetReviewId}: ${err.message}`,
      );
      throw err;
    } finally {
      if (queryRunner.isReleased === false) {
        await queryRunner.release();
      }
    }
  }

  private async handleApproved(datasetReviewId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // get data sets
      const dataSetReview = await queryRunner.manager.findOne(DataSetReview, {
        where: { id: datasetReviewId },
        relations: {
          dataSet: {
            microTask: true,
            contributor: true,
          },
          reviewer: true,
        },
      });
      if (dataSetReview === null) {
        throw new BadRequestException('Data set already approved');
      }
      const task = await queryRunner.manager.findOne(Task, {
        where: { id: dataSetReview.dataSet.microTask.task_id },
        relations: { payment: true, taskRequirement: true },
      });
      if (task === null) {
        throw new BadRequestException('Task not found');
      }
      const reviews = await queryRunner.manager.find(DataSetReview, {
        where: { data_set_id: dataSetReview.dataSet.id },
      });
      const taskPayment = task.payment;
      const memberContributor: UserTask | null =
        await this.userTaskService.findOne({
          where: {
            user_id: dataSetReview.dataSet.contributor_id,
            task_id: dataSetReview.dataSet.microTask.task_id,
          },
        });
      const create = {
        task_id: task.id,
        user_id: dataSetReview.dataSet.contributor_id,
      };
      const maxReviewerPerDataSet =
        task.taskRequirement.max_reviewer_per_dataset || 1;
      // total rejects before adding this one
      const totalApprovedReviews = reviews.filter(
        (review) => review.status === 'approved',
      ).length;
      const finalDataSetStatus =
        totalApprovedReviews > 0.5 * maxReviewerPerDataSet
          ? DataSetStatus.APPROVED
          : dataSetReview.dataSet.status;
      const dataSetStatusBefore = dataSetReview.dataSet.status;
      //  activate contributor task
      //  clear contributor task cache
      if (
        !memberContributor &&
        !task.require_contributor_test &&
        finalDataSetStatus !== dataSetStatusBefore
      ) {
        await this.taskService.activateContributorToTask(create, queryRunner);
        await this.cacheService.clearContributorTaskCache(
          dataSetReview.dataSet.contributor_id,
        );
      } else if (
        task.require_contributor_test &&
        dataSetReview.dataSet.microTask.is_test &&
        finalDataSetStatus !== dataSetStatusBefore
      ) {
        // check if all the test micro tasks are approved
        const contributorTestMicroTasks: MicroTask[] =
          await this.microTaskService.findAllTestMicroTasks({
            where: {
              task_id: task.id,
              is_test: true,
              dataSets: {
                contributor_id: dataSetReview.dataSet.contributor_id,
              },
            },
            relations: {
              dataSets: true,
            },
          });
        if (contributorTestMicroTasks.length == 1) {
          await this.taskService.activateContributorToTask(create, queryRunner);
        } else {
          let has_pending = false;
          let has_rejected = false;
          for (const task of contributorTestMicroTasks) {
            const statusOfMicroTask =
              checkIfMicroTasIskRejectedAndTotalAttempts(task, 3);
            if (task.id == dataSetReview.dataSet.micro_task_id) {
              continue;
            }
            if (
              statusOfMicroTask.acceptanceStatus === 'PENDING' ||
              statusOfMicroTask.acceptanceStatus === 'NOT_STARTED'
            ) {
              has_pending = true;
              break;
            }
            if (statusOfMicroTask.acceptanceStatus === 'REJECTED') {
              has_rejected = true;
              break;
            }
            // break;
          }
          if (!has_rejected && !has_pending) {
            await this.taskService.activateContributorToTask(
              create,
              queryRunner,
            );
            await this.cacheService.clearContributorTaskCache(
              dataSetReview.dataSet.contributor_id,
              dataSetReview.dataSet.microTask.task_id,
            );
          }
        }
      }

      // credit contributor and reviewer wallet
      const score = await this.scoreService.get();
      const scoreValueInBIRR = score.value_in_birr;
      await this.walletService.addFunds(
        dataSetReview.dataSet.contributor_id,
        taskPayment.contributor_credit_per_microtask * scoreValueInBIRR,
        {
          data_set_id: dataSetReview.dataSet.id,
          code: dataSetReview.dataSet.code,
        },
        queryRunner,
      );

      await this.walletService.addFunds(
        dataSetReview.reviewer_id,
        taskPayment.reviewer_credit_per_microtask * scoreValueInBIRR,
        {
          data_set_review_id: dataSetReview.id,
          code: dataSetReview.dataSet.code,
        },
        queryRunner,
      );

      console.error('Final data set status', finalDataSetStatus);
      console.error('Before data set status', dataSetStatusBefore);
      if (finalDataSetStatus !== dataSetStatusBefore) {
        await this.cacheService.updateDataSetStatus(
          dataSetReview.dataSet.contributor_id,
          task.id,
          dataSetReview.dataSet.micro_task_id,
          'Approved',
        );
        await queryRunner.manager.update(DataSet, dataSetReview.dataSet.id, {
          status: finalDataSetStatus,
        });
        await this.notificationService.create({
          user_id: dataSetReview.dataSet.contributor_id,
          title: 'Task Approved',
          message:
            'Your task with code ' +
            dataSetReview.dataSet.code +
            ' on task ' +
            task.name +
            ' has been approved.',
          type: 'task-approved',
        });
      }
      await queryRunner.commitTransaction();
    } catch (error: any) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error(
        `Error processing approved dataset  ${datasetReviewId}: ${error?.message}`,
      );
    } finally {
      if (queryRunner.isReleased === false) {
        await queryRunner.release();
      }
    }
  }
}
