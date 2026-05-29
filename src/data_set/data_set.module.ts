import { forwardRef, Module } from '@nestjs/common';
import { DataSet } from './entities/DataSet.entity';
import { MicroTask } from './entities/MicroTask.entity';
import { RejectionReason } from './entities/RejectionReason.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaseDataModule } from 'src/base_data/base_data.module';
import { ProjectModule } from 'src/project/project.module';
import { DataSetService } from './service/DataSet.service';
import { MicroTaskService } from './service/MicroTask.service';
import { RejectionReasonService } from './service/RejectionReason.service';
import { DataSetController } from './controller/DataSet.controller';
import { MicroTaskController } from './controller/MicroTask.controller';
// import { RejectionReasonController } from './controller/RejectionReason.controller';
import { AuthModule } from 'src/auth/auth.module';
import { FlagReasonService } from './service/FlagReason.service';
import { FlagReason } from './entities/FlagReason.entity';
import { FinanceModule } from 'src/finance/finance.module';
import { TaskDistributionModule } from 'src/task_distribution/task_distribution.module';
import { CacheModule } from 'src/cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DataSet, MicroTask, RejectionReason, FlagReason]),
    ProjectModule,
    BaseDataModule,
    AuthModule,
    FinanceModule,

    forwardRef(() => TaskDistributionModule),
    forwardRef(() => CacheModule),
    // TaskDistributionModule,
  ],
  providers: [
    DataSetService,
    MicroTaskService,
    RejectionReasonService,
    FlagReasonService,
  ],
  controllers: [
    DataSetController,
    MicroTaskController,
    // RejectionReasonController,
  ],
  exports: [MicroTaskService, DataSetService, RejectionReasonService,FlagReasonService],
})
export class DataSetModule {}
