import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScoreLog } from './enitities/ScoreLog.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskDistributionService } from './service/TaskDistribution.service';
import { ContributorMicroTaskService } from './service/ContributorMicroTask.service';
import { MicroTaskStatisticsService } from './service/MicroTaskStatistics.service';
import { ContributorMicroTasks } from './enitities/ContributorMicroTasks.entity';
import { MicroTaskStatistics } from './enitities/MicroTaskStatistics.entity';
import { ProjectModule } from 'src/project/project.module';
import { DataSetModule } from 'src/data_set/data_set.module';
import { TaskDistributionController } from './controllers/TaskDistribution.controller';
import { TaskDistributionMonitoringService } from './service/TaskDistributionMonitoring.service';
import { TaskDistributionMonitoringController } from './controllers/TaskDistributionMonitoring.controller';
import { ReviewerTaskService } from './service/ReviewerTasks.service';
import { GetTasksService } from './service/GetTask.service';
import { TaskRedistributionService } from './service/TaskRedistribution.service';
import { TaskSubmissionService } from './service/TaskSubmission.service';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from 'src/cache/cache.module';
import { ReviewerTaskDistributionsService } from './service/ReviewerTaskDistribution.service';
import { DataSetReview } from './enitities/DataSetReview.entity';
import { ReviewerTaskDistributionController } from './controllers/ReviewerTask.controller';
import { BaseDataModule } from 'src/base_data/base_data.module';
import { YcI18nModule } from 'src/yc-i18n/yc-i18n.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScoreLog,
      ContributorMicroTasks,
      MicroTaskStatistics,
      DataSetReview,
    ]),
    CacheModule,
    ProjectModule,
    forwardRef(() => DataSetModule),
    BullModule.registerQueue({
      name: 'file-upload',
      // redis options if not using forRoot globally
    }),
    AuthModule,
    BaseDataModule,
    YcI18nModule,
  ],
  exports: [
    TaskDistributionService,
    TaskDistributionMonitoringService,
    ReviewerTaskService,
  ],
  providers: [
    TaskDistributionService,
    ReviewerTaskDistributionsService,
    ContributorMicroTaskService,
    GetTasksService,
    MicroTaskStatisticsService,
    TaskDistributionMonitoringService,
    ReviewerTaskService,
    TaskRedistributionService,
    TaskSubmissionService,
  ],
  controllers: [
    TaskDistributionController,
    TaskDistributionMonitoringController,
    ReviewerTaskDistributionController,
  ],
})
export class TaskDistributionModule {}
