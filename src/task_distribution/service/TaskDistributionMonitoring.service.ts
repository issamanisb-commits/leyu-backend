import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { MicroTaskStatisticsService } from './MicroTaskStatistics.service';
import { ContributorMicroTaskService } from './ContributorMicroTask.service';
import { PaginationDto } from 'src/common/dto/Pagination.dto';
import { DataSetService } from 'src/data_set/service/DataSet.service';
import { ReviewerTaskService } from './ReviewerTasks.service';
import { UserTaskService } from 'src/project/service/UserTask.service';
import { TaskDataSetReviewerDistributionRto } from '../rto/TaskMonitoring.rto';
import { ContributorTaskProgressRto } from '../rto/Task.rto';
import { ContributorMicroTasksConstantStatus } from 'src/utils/constants/ContributorMicroTasks.constant';
import { Task } from 'src/project/entities/Task.entity';
import { NotificationService } from 'src/common/service/Notification.service';
import { I18nService } from 'nestjs-i18n';
import { UserService } from 'src/auth/service/User.service';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface ContributorMicroTaskResponse {
  id: string;
  contributor_id: string;
  gender: string | null;
  task_id: string;

  micro_task_ids: string[];

  status: 'New' | 'InProgress' | 'Completed' | 'Expired';

  expected_micro_task_for_contributor: number;

  batch: number | null;

  current_batch: number;

  total_micro_tasks: number;

  dead_line: Date;

  updated_date: Date;

  created_date: Date;

  contributor: ContributorInfo;

  task: TaskInfo;
}

export interface ContributorInfo {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  preferred_language:string;
}

export interface TaskInfo {
  id: string;
  name: string;
}
@Injectable()
export class TaskDistributionMonitoringService {
  constructor(
    private readonly microTaskStatisticsService: MicroTaskStatisticsService,
    private readonly contributorMicroTaskService: ContributorMicroTaskService,
    private readonly dataSetService: DataSetService,
    private readonly i18n: I18nService,
    private readonly reviewerTaskService: ReviewerTaskService,
    private readonly notificationService:NotificationService,
    private readonly dataSource: DataSource,
  ) {}
  async getTaskDistributionStatistics(task_id: string) {
    // get total contributor microtask grouped by their status
    const contributorMicroTasksGroupedByStatus =
      await this.contributorMicroTaskService.getTotalContributorsGroupedByStatus(
        task_id,
      );

    // get language statistics and dialect statistics
    const languageStatistics =
      await this.contributorMicroTaskService.getContributorLanguageAndDialectDistributionStatistics(
        task_id,
      );
    // get gender statistics
    const genderStatistics =
      await this.contributorMicroTaskService.getContributorGenderDistributionStatistics(
        task_id,
      );
    // get total distributed and undestributed microtasks
    const microTaskGroupedStatistics =
      await this.microTaskStatisticsService.getGroupedMicroTaskStatisticsByNumberOfContributors(
        task_id,
      );
    return {
      total_contributor_micro_tasks: contributorMicroTasksGroupedByStatus,
      total_micro_tasks: microTaskGroupedStatistics,
      language_statistics: languageStatistics,
      gender_statistics: genderStatistics,
    };
  }
  async getTaskAssignedContributors(
    task_id: string,
    paginationDto: PaginationDto,
  ) {
    const page = paginationDto.page || 1;
    const limit = paginationDto.limit || 10;
    const offset = (page - 1) * limit;
    return this.contributorMicroTaskService.getTaskContributors(
      task_id,
      paginationDto,
    );
  }
  async getMicroTaskStatisticsByTaskId(
    task_id: string,
    paginationDto: PaginationDto,
  ) {
    return this.microTaskStatisticsService.getMicroTaskStatisticsByTaskId(
      task_id,
      paginationDto,
    );
  }
  /**
   * Retrieves the distribution status of a task's data sets for reviewers.
   * This method returns the total number of data sets assigned to reviewers,
   * the total number of data sets reviewed by reviewers, and the total number
   * of data sets remaining to be assigned to reviewers.
   * @param {string} task_id - Unique identifier of the task.
   * @returns {Promise<TaskDataSetReviewerDistributionRto>} - Task data set distribution status for reviewers.
   */
  async getTaskDataSetDistributionStatusForReviewers(
    task_id: string,
  ): Promise<TaskDataSetReviewerDistributionRto> {
    return this.reviewerTaskService.getTaskDataSetReviewStats(task_id);
  }

  async getContributorTaskProgress(
    task_id: string,
    contributor_id: string,
  ): Promise<ContributorTaskProgressRto> {
    const contributorMicroTasks =
      await this.contributorMicroTaskService.findAll({
        contributor_id,
        task_id,
      });
    const totalAssignedMicroTasks = contributorMicroTasks
      .map((cmt) => cmt.micro_task_ids.length)
      .reduce((a, b) => a + b, 0);
    let completedMicroTasks = contributorMicroTasks
      .filter(
        (cmt) => cmt.status === ContributorMicroTasksConstantStatus.COMPLETED,
      )
      .map((cmt) => cmt.micro_task_ids.length)
      .reduce((a, b) => a + b, 0);
    let pendingMicroTasks = contributorMicroTasks
      .filter((cmt) => cmt.status === ContributorMicroTasksConstantStatus.NEW)
      .map((cmt) => cmt.micro_task_ids.length)
      .reduce((a, b) => a + b, 0);
    const undoneInProgressMicroTasks = contributorMicroTasks
      .filter(
        (cmt) => cmt.status === ContributorMicroTasksConstantStatus.IN_PROGRESS,
      )
      .map((cmt) => cmt.micro_task_ids.length - cmt.current_batch)
      .reduce((a, b) => a + b, 0);
    pendingMicroTasks += undoneInProgressMicroTasks;
    const totalExpiredMicroTasks = contributorMicroTasks
      .filter(
        (cmt) => cmt.status === ContributorMicroTasksConstantStatus.EXPIRED,
      )
      .map((cmt) => cmt.micro_task_ids.length - cmt.current_batch)
      .reduce((a, b) => a + b, 0);
    const rejectedDataSets = await this.dataSetService.findAll({
      where: {
        microTask: {
          task_id,
        },
        status: 'Rejected',
        contributor_id,
      },
    });
    const doneAssignments = contributorMicroTasks
      .filter(
        (cmt) => cmt.status === ContributorMicroTasksConstantStatus.IN_PROGRESS,
      )
      .map((cmt) => cmt.current_batch)
      .reduce((a, b) => a + b, 0);
    console.log('doneAssignments', doneAssignments);
    completedMicroTasks += doneAssignments;
    const totalRejectedDataSets = rejectedDataSets.length;
    const task = await this.dataSource.getRepository(Task).findOne({
      where: {
        id: task_id,
      },
      relations: {
        taskType: true,
      },
    });
    const dataSets = await this.dataSetService.findAll({
      where: {
        microTask: {
          task_id,
        },
        contributor_id,
      },
    });
    let totalSubmittedSeconds = 0;
    if (
      task &&
      ['text-audio', 'image-audio'].includes(task.taskType.task_type)
    ) {
      totalSubmittedSeconds = dataSets.reduce((total, dataSet) => {
        dataSet.audio_duration && (total += dataSet.audio_duration);
        return total;
      }, 0);
    }
    const totalSubmittedHrs= totalSubmittedSeconds / 3600;
    const underReviewDataSets = dataSets.filter(
      (dataSet) => dataSet.status === 'Pending',
    ).length;
    return {
      pending_micro_tasks: pendingMicroTasks,
      completed_micro_tasks: completedMicroTasks,
      rejected_datasets: totalRejectedDataSets,
      under_review_datasets: underReviewDataSets,
      total_submitted_hrs: totalSubmittedHrs,
      total_expired_micro_tasks: totalExpiredMicroTasks,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_NOON)
  async  notifyContributorsAndReviewersOnTheirProgress():Promise<void>{
    await this.notifyContributorsOnTheirProgress()
    await this.notifyReveiwersOnTheirProgress()
    
  }

  async notifyContributorsOnTheirProgress(): Promise<void> {
    try{
    const now = new Date();

    const activeTasks: ContributorMicroTaskResponse[]= await this.contributorMicroTaskService.getContributorsPendingAndInProgressTasks();
    let missedContributorsNotificationsSent:string[]=[];
    for (const task of activeTasks) {
      if (!task.dead_line) continue;

      const totalDuration  = task.dead_line.getTime() - task.created_date.getTime();
      const elapsed        = now.getTime()            - task.created_date.getTime();

      // Skip tasks whose deadline has already passed
      if (elapsed >= totalDuration) continue;

      const timeRatio     = elapsed / totalDuration;                      // 0 → 1
      const progressRatio = task.current_batch / task.total_micro_tasks;  // 0 → 1

      // ── 1. HALF REMINDER ────────────────────────────────────────────────
      //    OR:  50 % of time elapsed  ||  50 % of tasks done
      const halfByTime     = timeRatio     >= 0.5 && timeRatio     < 0.9;
      const halfByProgress = progressRatio >= 0.5 && progressRatio < 0.9;

      if (halfByTime || halfByProgress) {
        // const alreadySent = await this.wasNotificationSent(
        //   task.id,
        //   NotificationType.HALF_REMINDER,
        // );
        // if (!alreadySent) {
        const title =
          this.i18n.t('common.halfway_reminder_notification_title', {
            lang:task.contributor.preferred_language||'en',
            args: { taskTitle: task.task.name },
          }) || '';

        const message =
          this.i18n.t('common.halfway_reminder_notification_message', {
             lang:task.contributor.preferred_language||'en',
            args: { taskTitle: task.task.name },
          }) || '';
        await this.notificationService.create({
          user_id: task.contributor_id  ,
          title: title,
          message: message,
          type: 'task-progress-reminder'
        }
        )
          // await this.sendPushNotification(task.contributor_id, {
          //   title: '⏳ You're Halfway There',
          //   body:
          //     `Time elapsed: ${Math.round(timeRatio * 100)}%  ` +
          //     `Tasks completed: ${Math.round(progressRatio * 100)}%. ` +
          //     `Stay on track to meet your deadline!`,
          //   data: { taskId: task.id, type: NotificationType.HALF_REMINDER },
          // });
          // await this.logNotification(task.id, NotificationType.HALF_REMINDER);
        // }
        // continue;
      }

      // ── 2. FINAL WARNING ────────────────────────────────────────────────
      //    OR:  90 % of time elapsed  ||  90 % of tasks done
      const finalByTime     = timeRatio     >= 0.9;
      const finalByProgress = progressRatio >= 0.9;

      if (finalByTime || finalByProgress) {
        // const alreadySent = await this.wasNotificationSent(
        //   task.id,
        //   NotificationType.FINAL_WARNING,
        // );
        // if (!alreadySent) {
          // const remaining = task.total_micro_tasks - task.current_batch;
        const title =
          this.i18n.t('common.final_warning_notification_title', {
            lang:task.contributor.preferred_language||'en',
            args: { taskTitle: task.task.name },
          }) || '';

        const message =
          this.i18n.t('common.final_warning_notification_message', {
             lang:task.contributor.preferred_language||'en',
            args: { taskTitle: task.task.name },
          }) || '';
        await this.notificationService.create({
          user_id: task.contributor_id  ,
          title: title,
          message: message,
          type: 'task-progress-reminder'
        })

          
          // await this.sendPushNotification(task.contributor_id, {
          //   title: '🚨 Almost Done  Final Push!',
          //   body:
          //     `You have ${remaining} task(s) left and your deadline is ` +
          //     `${task.dead_line.toLocaleDateString()}. Finish strong!`,
          //   data: { taskId: task.id, type: NotificationType.FINAL_WARNING },
          // });
          // await this.logNotification(task.id, NotificationType.FINAL_WARNING);
        //}
        // continue;
      }

      // ── 3. DAILY INACTIVITY ─────────────────────────────────────────────
      //    current_batch hasn't changed (updated_date) in over 24 h
      const hoursSinceUpdate =
        (now.getTime() - task.updated_date.getTime()) / (1_000 * 60 * 60);
      
      if (hoursSinceUpdate >= 24) {
        if (missedContributorsNotificationsSent.includes(task.contributor_id)){
          continue;
        }
        missedContributorsNotificationsSent.push(task.contributor_id);
        const title =
          this.i18n.t('common.re_engagement_notification_title', {
            lang:task.contributor.preferred_language||'en',
            args: { taskTitle: task.task.name },
          }) || '';

        const message =
          this.i18n.t('common.re_engagement_notification_message', {
             lang:task.contributor.preferred_language||'en',
            args: { taskTitle: task.task.name },
          }) || '';
        await this.notificationService.create({
          user_id: task.contributor_id  ,
          title: title,
          message: message,
          type: 'task-progress-reminder'
        })
          // await this.sendPushNotification(task.contributor_id, {
          //   title: '😴 No Progress in 24 Hours',
          //   body:
          //     `You haven't completed any tasks since ` +
          //     `${task.updated_date.toLocaleDateString()}. ` +
          //     `Your deadline is ${task.dead_line.toLocaleDateString()}  don't fall behind!`,
          //   data: { taskId: task.id, type: NotificationType.DAILY_INACTIVITY },
          // });
          // await this.logNotification(task.id, NotificationType.DAILY_INACTIVITY);

      }
    }
  }
   catch(error:any){
    console.error("Error  In notifying contributors ",error)
  }
  }
  async notifyReveiwersOnTheirProgress():Promise<void>{
    try{
    const reviewerTasks=await this.reviewerTaskService.getOverloadedReviewers()
    await Promise.all(reviewerTasks.map(r=>{
      const title =
          this.i18n.t('common.reviewer_queue_limit_notification_title', {
            lang:r.preferred_language||'en'
          }) || '';

      const message =
        this.i18n.t('common.reviewer_queue_limit_notification_message', {
            lang:r.preferred_language||'en',
          args: { count: r.queue_count},
        }) || '';
      return this.notificationService.create({
        user_id: r.reviewer_id ,
        title: title,
        message: message,
        type: 'reviewer-queue-alert',
        target:'email',
        email:r.email
      })
    }))
  }catch(error:any){
    console.error("Error  In notifying reviewers",error)
  }
  }
}
