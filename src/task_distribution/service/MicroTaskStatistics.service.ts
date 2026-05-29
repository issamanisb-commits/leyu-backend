import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { MicroTaskStatistics } from '../enitities/MicroTaskStatistics.entity';
import { QueryOptions } from 'src/utils/queryOption.util';
import { Task } from 'src/project/entities/Task.entity';
import { MicroTask } from 'src/data_set/entities/MicroTask.entity';
import { PaginationDto } from 'src/common/dto/Pagination.dto';
import { paginate, PaginatedResult } from 'src/utils/paginate.util';

export interface MicroTaskStatisticsRto extends MicroTaskStatistics {
  task: Task;
  microTask: MicroTask;
}
export interface MicroTaskStatisiticsByStatus {
  NOT_ASSIGNED: number;
  PARTILALLY_ASSIGNED: number;
  ASSIGNED: number;
}
@Injectable()
export class MicroTaskStatisticsService {
  constructor(
    @InjectRepository(MicroTaskStatistics)
    private readonly microTaskStatisticsRepository: Repository<MicroTaskStatistics>,
  ) {}

  async create(
    statisticsData: Partial<MicroTaskStatistics>,
  ): Promise<MicroTaskStatistics> {
    const statistics =
      this.microTaskStatisticsRepository.create(statisticsData);
    return this.microTaskStatisticsRepository.save(statistics);
  }
  async createMany(
    statisticsData: Partial<MicroTaskStatistics>[],
    queryRunner: QueryRunner,
  ): Promise<MicroTaskStatistics[]> {
    const manager = queryRunner.manager;
    const statistics = statisticsData.map((data) =>
      manager.create(MicroTaskStatistics, { ...data }),
    );
    return manager.save(MicroTaskStatistics, statistics);
  }
  async upsertMany(
    statisticsData: Partial<MicroTaskStatistics>[],
    queryRunner: QueryRunner,
  ): Promise<MicroTaskStatistics[]> {
    const manager = queryRunner.manager;
    return manager.save(MicroTaskStatistics, statisticsData);
  }
  async findStatisticsById(id: string): Promise<MicroTaskStatistics | null> {
    return this.microTaskStatisticsRepository.findOne({ where: { id } });
  }

  async update(
    id: string,
    statisticsData: Partial<MicroTaskStatistics>,
  ): Promise<MicroTaskStatistics | null> {
    await this.microTaskStatisticsRepository.update(id, statisticsData);
    return this.microTaskStatisticsRepository.findOne({ where: { id } });
  }

  async delete(id: string): Promise<void> {
    await this.microTaskStatisticsRepository.delete(id);
  }
  async findAll(
    queryOption: QueryOptions<MicroTaskStatistics>,
  ): Promise<MicroTaskStatistics[]> {
    return this.microTaskStatisticsRepository.find({
      where: queryOption.where,
      relations: queryOption.relations || [],
    });
  }

  /**
   * This method will return the grouped statistics of contributors for a task.
   * It will return an object with the count of contributors for each status.
   * The count of contributors for each status can be accessed with the 'NOT_ASSIGNED' and 'ASSIGNED' properties.
   * @param task_id The id of the task.
   * @return A promise that resolves to an object with the count of contributors for each status.
   */
  async getGroupedMicroTaskStatisticsByNumberOfContributors(
    task_id: string,
  ): Promise<MicroTaskStatisiticsByStatus> {
    const statistics = await this.microTaskStatisticsRepository.find({
      where: { task_id },
      select: ['no_of_contributors', 'expected_no_of_contributors'],
    });
    const groupedStatistics: MicroTaskStatisiticsByStatus = {
      NOT_ASSIGNED: 0,
      PARTILALLY_ASSIGNED: 0,
      ASSIGNED: 0
    };
    statistics.forEach((stat) => {
      if (stat.no_of_contributors === 0) {
        groupedStatistics.NOT_ASSIGNED += 1;
      } else if (stat.no_of_contributors < stat.expected_no_of_contributors) {
        groupedStatistics.PARTILALLY_ASSIGNED += 1;
      } else {
        groupedStatistics.ASSIGNED += 1;
      }
    });
    return groupedStatistics;
  }
  /**
   * Retrieves the statistics of contributors for a task.
   * @param task_id The id of the task
   * @param paginationDto Pagination parameters
   * @return A promise that resolves to a paginated result of contributor statistics
   */
  async getMicroTaskStatisticsByTaskId(
    task_id: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<any>> {
    const page = paginationDto.page || 1;
    const limit = paginationDto.limit || 10;
    const offset = (page - 1) * limit;
    const [microTaskStatistics, count] =
      await this.microTaskStatisticsRepository
        .createQueryBuilder('mts')
        .leftJoinAndMapOne(
          'mts.microTask',
          MicroTask,
          'microTask',
          'CAST(microTask.id AS TEXT) = mts.micro_task_id',
        )
        .where('mts.task_id = :task_id', { task_id })
        .skip(offset)
        .take(limit)
        .getManyAndCount();
    return paginate(microTaskStatistics, count, page, limit);
  }
  async reduceAssignmentForExpiredTasks(
  removeables: { 
    micro_task_id: string; 
    no_of_assignments: number,
    no_of_male: number | undefined,
    no_of_female: number | undefined
  }[],
): Promise<void> {
  if (removeables.length === 0) return;

  const ids = removeables.map((item) => `'${item.micro_task_id}'`).join(', ');

  const contributorCases = removeables
    .map(
      (item) =>
        `WHEN micro_task_id = '${item.micro_task_id}' THEN GREATEST(no_of_contributors - ${item.no_of_assignments}, 0)`,
    )
    .join(' ');

  const maleCases = removeables
    .filter((item) => item.no_of_male !== undefined)
    .map(
      (item) =>
        `WHEN micro_task_id = '${item.micro_task_id}' THEN GREATEST(COALESCE(total_male, 0) - ${item.no_of_male}, 0)`,
    )
    .join(' ');

  const femaleCases = removeables
    .filter((item) => item.no_of_female !== undefined)
    .map(
      (item) =>
        `WHEN micro_task_id = '${item.micro_task_id}' THEN GREATEST(COALESCE(total_female, 0) - ${item.no_of_female}, 0)`,
    )
    .join(' ');

  await this.microTaskStatisticsRepository
    .createQueryBuilder()
    .update(MicroTaskStatistics)
    .set({
      no_of_contributors: () => `CASE ${contributorCases} ELSE no_of_contributors END`,
      ...(maleCases && {
        total_male: () => `CASE ${maleCases} ELSE total_male END`,
      }),
      ...(femaleCases && {
        total_female: () => `CASE ${femaleCases} ELSE total_female END`,
      }),
    })
    .where(`micro_task_id IN (${ids})`)
    .execute();
}
}
