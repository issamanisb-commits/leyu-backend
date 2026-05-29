import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, IsNull, LessThan, Not, QueryRunner, Repository } from 'typeorm';
import { ContributorMicroTasks } from '../enitities/ContributorMicroTasks.entity';
import { PaginationService } from 'src/common/service/pagination.service';
import { QueryOptions } from 'src/utils/queryOption.util';
import { ContributorMicroTasksConstantStatus } from 'src/utils/constants/ContributorMicroTasks.constant';
import { UserService } from 'src/auth/service/User.service';
import { PaginationDto } from 'src/common/dto/Pagination.dto';
import { User } from 'src/auth/entities/User.entity';
import { paginate, PaginatedResult } from 'src/utils/paginate.util';
import { Task } from 'src/project/entities/Task.entity';
import { Cron ,CronExpression} from '@nestjs/schedule';
import { MicroTaskStatisticsService } from './MicroTaskStatistics.service';
import { UserScoreService } from 'src/auth/service/UserScore.service';

@Injectable()
export class ContributorMicroTaskService {
  constructor(
    @InjectRepository(ContributorMicroTasks)
    private readonly contributorMicroTaskRepository: Repository<ContributorMicroTasks>,
    private readonly microTaskStatisticsService : MicroTaskStatisticsService,
    private readonly userService: UserService,
    private readonly userScoreService: UserScoreService,
  ) {}

  // async onModuleInit() {
  //   await this.cronToExpireAssignedTasks(); 
  // } 

  async findAllUnExpiredAssignments(
    queryOption: QueryOptions<ContributorMicroTasks>,
  ): Promise<ContributorMicroTasks[]> {
    return this.contributorMicroTaskRepository.find({
      // STATUS UNEQUAL TO EXPIRED
      where: {
        ...queryOption.where,
        status: Not(ContributorMicroTasksConstantStatus.EXPIRED),
      },
      relations: queryOption.relations || [],
    });
  }

  /**
   * @brief Returns a promise that resolves to the completed contributors with limited number of microtask.
   * @param task_id - The task id.
   * @returns Promise<ContributorMicrotasks[]>
   * @param contributorMicrotasks - The tasks with limited number of microtask.
   */
  async findCompletedContributorsWithLimitedNoOfMicroTask(
    task_id: string,
  ): Promise<ContributorMicroTasks[]> {
    const contributorMicroTasks: ContributorMicroTasks[] =
      await this.contributorMicroTaskRepository.find({
        where: {
          task_id,
          status: Not(ContributorMicroTasksConstantStatus.EXPIRED),
        },
      });
    return contributorMicroTasks.filter(
      (contributorTask) =>
        contributorTask.total_micro_tasks <
        contributorTask.expected_micro_task_for_contributor,
    );
  }
  async findOne(
    query: QueryOptions<ContributorMicroTasks>,
  ): Promise<ContributorMicroTasks | null> {
   
    return this.contributorMicroTaskRepository.findOne(query);
  }

  async create(
    contributorMicroTask: Partial<ContributorMicroTasks>,
    queryRunner?: QueryRunner,
  ): Promise<ContributorMicroTasks> {
    if (queryRunner) {
      return queryRunner.manager.save(
        ContributorMicroTasks,
        contributorMicroTask,
      );
    }
    return this.contributorMicroTaskRepository.save(contributorMicroTask);
  }
  async createMany(
    contributorMicroTasks: {
      contributor_id: string;
      micro_task_ids: string[];
      status: string;
      expected_micro_task_for_contributor: number;
      gender?: 'Male' | 'Female';
    }[],
    task_id: string,
    batch: number,
    queryRunner: QueryRunner, // Adjust type as needed, e.g., QueryRunner if using TypeORM
    dead_line?: Date,
  ) {
    const manager = queryRunner.manager;
    const createMultiple = contributorMicroTasks.map((contributorMicroTask) =>
      manager.create(ContributorMicroTasks, {
        contributor_id: contributorMicroTask.contributor_id,
        micro_task_ids: contributorMicroTask.micro_task_ids,
        status: contributorMicroTask.status,
        expected_micro_task_for_contributor:
          contributorMicroTask.expected_micro_task_for_contributor,
        gender: contributorMicroTask.gender,
        batch,
        total_micro_tasks: contributorMicroTask.micro_task_ids?.length,
        task_id: task_id,
        dead_line,
      }),
    );
    return manager.save(ContributorMicroTasks, createMultiple);
  }

  async upsertMany(
    contributorMicroTasks: Partial<ContributorMicroTasks>[],
    queryRunner: QueryRunner,
  ): Promise<ContributorMicroTasks[]> {
    const manager = queryRunner.manager;
    return manager.save(ContributorMicroTasks, contributorMicroTasks);
  }

  async update(
    id: string,
    contributorMicroTask: Partial<ContributorMicroTasks>,
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (queryRunner) {
      await queryRunner.manager.update(
        ContributorMicroTasks,
        id,
        contributorMicroTask,
      );
    } else {
      await this.contributorMicroTaskRepository.update(
        id,
        contributorMicroTask,
      );
    }
  }

  async expireAll(
    deleteOption: { contributor_id: string; task_id: string }[],
    queryRunner: QueryRunner,
  ): Promise<void> {
    const manager = queryRunner.manager;
    for (const option of deleteOption) {
      await manager.update(
        ContributorMicroTasks,
        {
          contributor_id: option.contributor_id,
          task_id: option.task_id,
        },
        {
          status: ContributorMicroTasksConstantStatus.EXPIRED,
        },
      );
    }
  }
  @Cron(CronExpression.EVERY_6_HOURS)
  async cronToExpireAssignedTasks(){
    const expiredTasks = await this.contributorMicroTaskRepository.find({
      where: {
        status: Not(In([
          ContributorMicroTasksConstantStatus.EXPIRED,
          ContributorMicroTasksConstantStatus.COMPLETED
        ])),
        dead_line: LessThan(new Date())
      }
    });
    // update the microtask statistics
    let microTasksToBeRemoved:{
      micro_task_id:string,
      no_of_assignments:number,
      no_of_male:number,
      no_of_female:number

    }[]=[];
    for (const task of expiredTasks) {
      const expiredMicroTasks=task.micro_task_ids.slice(task.current_batch,task.micro_task_ids.length)
      console.log("gender",task.gender)
      const genderIsFemale=task.gender === 'Female';
      const genderIsMale=task.gender === 'Male';
      // console.log("genderIsMale",genderIsMale)
      // console.log("genderIsFemale",genderIsFemale)
      for (const microtask of expiredMicroTasks) {
          const mE=microTasksToBeRemoved.find((m) => m.micro_task_id === microtask);
          if(mE){
            mE.no_of_assignments++;
            if (genderIsMale) {
              mE.no_of_male++;
            }
             if (genderIsFemale) {
             mE.no_of_female++;
            }
          }else{
          microTasksToBeRemoved.push({
            micro_task_id:microtask,no_of_assignments:1,
            no_of_male:task.gender === 'Male'?1:0,
            no_of_female:task.gender === 'Female'?1:0,
          });
          }
      }
    }
    console.log("MicroTasks To Be Removed",microTasksToBeRemoved.slice(0,10));
    await this.microTaskStatisticsService.reduceAssignmentForExpiredTasks(microTasksToBeRemoved);
    for (const task of expiredTasks) {
      await this.contributorMicroTaskRepository.update(
        task.id,
        {
          status: ContributorMicroTasksConstantStatus.EXPIRED,
        },
      );
      await this.userScoreService.reduceNoneSubmitScore([task.contributor_id]);
    }

  }
  /**
   * This method will get the distribution statistics of contributors for a task.
   * It will return the count of contributors for each language and dialect.
   * @param task_id The id of the task
   * @returns a promise that resolves to an object with language and dialect as keys and the count of contributors as values.
   */
  async getContributorLanguageAndDialectDistributionStatistics(
    task_id: string,
  ): Promise<any> {
    const contributorMicroTaskStatistics =
      await this.contributorMicroTaskRepository.find({
        where: {
          task_id,
          status: Not(ContributorMicroTasksConstantStatus.EXPIRED),
        },
      });
    const contributor_ids = contributorMicroTaskStatistics.map(
      (cmt) => cmt.contributor_id,
    );
    const languageStatistics =
      await this.userService.getUserGroupByLanguageAndDialect(contributor_ids);
    return languageStatistics;
  }
  /**
   * This method will get the distribution statistics of contributors for a task by gender.
   * It will return the count of contributors for each gender.
   * @param task_id The id of the task
   * @returns a promise that resolves to an object with gender as keys and the count of contributors as values.
   */
  async getContributorGenderDistributionStatistics(
    task_id: string,
  ): Promise<any> {
    const contributorMicroTaskStatistics =
      await this.contributorMicroTaskRepository.find({
        where: {
          task_id,
          status: Not(ContributorMicroTasksConstantStatus.EXPIRED),
        },
      });
    const contributor_ids = contributorMicroTaskStatistics.map(
      (cmt) => cmt.contributor_id,
    );
    const genderStatistics =
      await this.userService.getUserGroupByGender(contributor_ids);
    return genderStatistics;
  }

  /**
   * Returns a list of distinct task ids for the given contributor id and status.
   * @param {string} cid - The contributor id to filter by.
   * @param {string | string[]} status - The status to filter by.
   * @returns {Promise<string[]>} - A promise resolving to a list of distinct task ids.
   */
  async getDistinctTaskIdsByContributorId(
    cid: string,
    status?: string | string[],
  ): Promise<string[]> {
    if (Array.isArray(status)) {
      const result = await this.contributorMicroTaskRepository
        .createQueryBuilder('cmt')
        .select('DISTINCT cmt.task_id', 'task_id')
        // FIND WHERE CONTRIBUTOR ID AND STATUS IS NEW OR IN_PROGRESS
        .where('cmt.contributor_id = :cid AND cmt.status IN (:...status)', {
          cid,
          status,
        })
        .getRawMany();
      return result.map((row) => row.task_id);
    } else if (status) {
      const result = await this.contributorMicroTaskRepository
        .createQueryBuilder('cmt')
        .select('DISTINCT cmt.task_id', 'task_id')
        // FIND WHERE CONTRIBUTOR ID AND STATUS IS NEW OR IN_PROGRESS
        .where('cmt.contributor_id = :cid AND cmt.status = :status', {
          cid,
          status,
        })
        .getRawMany();
      return result.map((row) => row.task_id);
    }
    const result = await this.contributorMicroTaskRepository
      .createQueryBuilder('cmt')
      .select('DISTINCT cmt.task_id', 'task_id')
      // FIND WHERE CONTRIBUTOR ID AND STATUS IS NEW OR IN_PROGRESS
      .where('cmt.contributor_id = :cid AND cmt.status IN (:...status)', {
        cid,
        status: [
          ContributorMicroTasksConstantStatus.NEW,
          ContributorMicroTasksConstantStatus.IN_PROGRESS,
        ],
      })
      .getRawMany();

    return result.map((row) => row.task_id);
  }

  /**
   * Returns a promise resolving to a Record of contributor statistics grouped by status.
   * - param: task_id - task id
   * - returns: Promise<Record<string, number>> - a promise resolving to a Record of contributor statistics grouped by status.
   */
  async getTotalContributorsGroupedByStatus(
    task_id: string,
  ): Promise<Record<string, number>> {
    const statistics = await this.contributorMicroTaskRepository
      .createQueryBuilder('cmt')
      .select('cmt.status', 'status')
      .addSelect('COUNT(cmt.id)', 'count')
      .where('cmt.task_id = :task_id', { task_id })
      .groupBy('cmt.status')
      .getRawMany();

    const groupedStatistics: Record<string, number> = {};
    statistics.forEach((stat) => {
      groupedStatistics[stat.status] = parseInt(stat.count, 10);
    });
    return groupedStatistics;
  }
  /**
   * Retrieves a list of contributors associated with a task.
   * The list is paginated with the given options.
   * @param task_id - the id of the task
   * @param paginationDto - pagination options
   * @returns a promise resolving to a paginated result of contributors
   */
  async getTaskContributors(
    task_id: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<any>> {
    const page = paginationDto.page || 1;
    const limit = paginationDto.limit || 10;
    const offset = (page - 1) * limit;
    const [contributorMicroTask, count] =
      await this.contributorMicroTaskRepository
        .createQueryBuilder('cmt')
        .leftJoinAndMapOne(
          'cmt.contributor',
          User,
          'contributor',
          'contributor.id = cmt.contributor_id',
        )
        .where('cmt.task_id = :task_id', { task_id })
        // .andWhere('cmt.status != :status', {
        //   status: ContributorMicroTasksConstantStatus.EXPIRED,
        // })
        .skip(offset)
        .take(limit)
        .getManyAndCount();
    return paginate(contributorMicroTask, count, page, limit);
  }
  async findAll(
    query: FindOptionsWhere<ContributorMicroTasks>,
  ): Promise<ContributorMicroTasks[]> {Cron
    return this.contributorMicroTaskRepository.find({
      where: {
        ...query,
        status: Not(ContributorMicroTasksConstantStatus.EXPIRED),
      },
    });
  }
  async getContributorsPendingAndInProgressTasks():Promise<any> {
    const contributorMicroTasks = await this.contributorMicroTaskRepository
      .createQueryBuilder('cmt')

      // join user table
      .leftJoinAndMapOne(
        'cmt.contributor',
        User,
        'contributor',
        'contributor.id = cmt.contributor_id',
      )
       

      // join task table
      .leftJoinAndMapOne('cmt.task', Task, 'task', 'task.id = cmt.task_id')

      .select([
        'cmt',
        'contributor.id',
        'contributor.first_name',
        'contributor.last_name',
        'contributor.phone_number',
        'contributor.preferred_language',
        'task.id',
        'task.name',
      ])
      .where('cmt.status IN (:...statuses)', {
        statuses: [
          ContributorMicroTasksConstantStatus.NEW,
          ContributorMicroTasksConstantStatus.IN_PROGRESS,
        ],
      })
      .andWhere('task.is_closed = :isClosed', {
        isClosed: false,
      })

      .getMany();
    return contributorMicroTasks;
  }
}
