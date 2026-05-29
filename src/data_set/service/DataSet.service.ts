import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Not, QueryRunner, Repository } from 'typeorm';
import { PaginationService } from 'src/common/service/pagination.service';
import { QueryOptions } from 'src/utils/queryOption.util';
import { PaginationDto } from 'src/common/dto/Pagination.dto';
import { DataSet } from '../entities/DataSet.entity';
import { MicroTaskService } from './MicroTask.service';
import { TaskService } from 'src/project/service/Task.service';
import { Task } from 'src/project/entities/Task.entity';
import { RejectionReasonService } from './RejectionReason.service';
import { paginate, PaginatedResult } from 'src/utils/paginate.util';
import { FileService } from 'src/common/service/File.service';
import { DataSetStatus } from 'src/utils/constants/DataSetStatus.constant';
import { DataSetType, taskTypes } from 'src/utils/constants/Task.constant';
import { TaskRequirement } from 'src/project/entities/TaskRequirement.entity';
import { User } from 'src/auth/entities/User.entity';
import { startOfDay, startOfYear, subDays } from 'date-fns';
import { DataSetAnnotationService } from 'src/base_data/service/DataSetAnnotation.service';
import { DataSetSanitize, MicroTaskSanitize } from '../sanitize';
import { TaskSubmissionsDto } from '../dto/DataSet.dto';
import { CacheService } from 'src/cache/CacheService.service';
import { TaskDataSetReviewerDistributionRto } from 'src/task_distribution/rto/TaskMonitoring.rto';
import { DataSetDetailRto } from '../rto/DataSet.rto';
import { GetQAMicroTasksDto } from 'src/task_distribution/dto/Task.dto';

export interface GroupedContributorDataSets {
  contributor_id: string;
  contributor: User;
  data_sets: DataSet[];
}
export interface ContributorMicroTaskRto extends MicroTaskSanitize {
  dataSets: DataSetSanitize[];
  current_retry: number;
  allowed_retry: number;
  can_retry: boolean;
}
@Injectable()
export class DataSetService {
  constructor(
    @InjectRepository(DataSet)
    private readonly dataSetRepository: Repository<DataSet>,
    private readonly microTaskService: MicroTaskService,
    private readonly taskService: TaskService,
    private readonly paginateService: PaginationService<DataSet>,
    private readonly rejectionReasonService: RejectionReasonService,
    private readonly fileService: FileService,
    private readonly dataSetAnnotationService: DataSetAnnotationService,

    private readonly cacheService: CacheService,
  ) {
    this.paginateService = new PaginationService<DataSet>(
      this.dataSetRepository,
    );
  }
  /**
   * Creates a new data set in the database.
   * If a query runner is provided, it will be used to create the data set.
   * Otherwise, a new query runner will be created.
   * @param dataSet The partial data set to create.
   * @param queryRunner The query runner to use for the query.
   * @returns A promise resolving to the created data set.
   */
  async create(
    dataSet: Partial<DataSet>,
    queryRunner?: QueryRunner,
  ): Promise<DataSet> {
    // get the data set code
    dataSet.code = 'DAT-' + crypto.randomUUID().slice(0, 8);
    if (queryRunner) {
      const manager = queryRunner.manager;
      const data = manager.create(DataSet, dataSet);
      return await manager.save(DataSet, data);
    } else {
      const manager = this.dataSetRepository;
      const data = manager.create(dataSet);
      return await manager.save(data);
    }
  }

  /**
   * Creates multiple text data sets in the database.
   * If a query runner is provided, it will be used to create the data sets.
   * Otherwise, a new query runner will be created.
   * @param dataSets The partial data sets to create.
   * @param contributor_id The id of the contributor who is submitting the data sets.
   * @param queryRunner The query runner to use for the query.
   * @returns A promise resolving to void.
   */
  async createMultipleTextDataSet(
    dataSets: {
      micro_task_id: string;
      text_data_set: string;
      dialect_id: string;
      language_id: string;
      is_test: boolean;
    }[],
    contributor_id: string,
    queryRunner: QueryRunner,
  ): Promise<DataSet[]> {
    if (dataSets.length === 0) {
      return [];
    }
    const entities = dataSets.map((item, index) => ({
      micro_task_id: item.micro_task_id,
      text_data_set: item.text_data_set,
      dialect_id: item.dialect_id,
      language_id: item.language_id,
      is_test: item.is_test,
      contributor_id: contributor_id,
      type: DataSetType.TEXT,
      code: 'DAT-' + crypto.randomUUID().slice(0, 8),
    }));
    return await queryRunner.manager.save(DataSet, entities);
  }
  /**
   * Creates multiple audio data sets in the database.
   * If a query runner is provided, it will be used to create the data sets.
   * Otherwise, a new query runner will be created.
   * @param dataSets The partial data sets to create.
   * @param contributor_id The id of the contributor who is submitting the data sets.
   * @param queryRunner The query runner to use for the query.
   * @returns A promise resolving to the created data sets.
   */
  async createMultipleAudioDataSet(
    dataSets: {
      micro_task_id: string;
      file_path: string;
      dialect_id: string;
      language_id: string;
      is_test: boolean;
      audio_duration: number;
    }[],
    contributor_id: string,
    queryRunner: QueryRunner,
  ): Promise<DataSet[]> {
    const dataSetsMetaData = dataSets.map((item) => {
      const code = 'DAT-' + crypto.randomUUID().slice(0, 8);
      return this.dataSetRepository.create({
        ...item,
        code,
        contributor_id,
        type: DataSetType.AUDIO,
        queue_status: 'pending',
        audio_duration: item.audio_duration,
      });
    });
    return await queryRunner.manager.save(DataSet, dataSetsMetaData);
  }
  /**
   * Creates a new audio data set in the database.
   * If a query runner is provided, it will be used to create the data set.
   * Otherwise, a new query runner will be created.
   * @param dataSet The partial data set to create.
   * @param contributor_id The id of the contributor who is submitting the data set.
   * @param queryRunner The query runner to use for the query.
   * @returns A promise resolving to the created data set.
   */
  async createAudioDataSet(
    dataSet: {
      micro_task_id: string;
      file_path: string;
      audio_duration?: number;
      dialect_id: string;
      language_id: string;
      is_test: boolean;
    },
    contributor_id: string,
    queryRunner: QueryRunner,
  ): Promise<DataSet> {
    const code = 'DAT-' + crypto.randomUUID().slice(0, 8);
    const manager = queryRunner.manager;
    const data = manager.create(DataSet, {
      micro_task_id: dataSet.micro_task_id,
      file_path: dataSet.file_path,
      audio_duration: dataSet.audio_duration,
      contributor_id: contributor_id,
      dialect_id: dataSet.dialect_id,
      type: DataSetType.AUDIO,
      is_test: dataSet.is_test ? true : false,
      code: code,
    });
    return await manager.save(DataSet, data);
  }
  /**
   * Validate the submission of a contributor, ensuring that the contributor has not already
   * contributed to the micro task and that the contributor has not exceeded the maximum retry
   * amount for the micro task.
   * @param contributorSubmittedDataSets The data sets submitted by the contributor.
   * @param contributorId The id of the contributor.
   * @param maxRetryPerTask The maximum amount of retries allowed for the contributor to submit
   * data sets for the micro task.
   * @throws BadRequestException If the contributor has already contributed to the micro task or has
   * exceeded the maximum retry amount.
   */
  async validateSubmission(
    contributorMicroTaskSubmittedDataSets: DataSet[],
    maxRetryPerTask: number,
  ): Promise<void> {
    const unRejected = contributorMicroTaskSubmittedDataSets.filter(
      (d) =>
        d.status !== DataSetStatus.REJECTED &&
        d.status !== DataSetStatus.Flagged,
    );

    const rejected = contributorMicroTaskSubmittedDataSets.filter(
      (d) =>
        d.status === DataSetStatus.REJECTED ||
        d.status === DataSetStatus.Flagged,
    );
    console.log(rejected);
    console.log('Max Retry ', maxRetryPerTask);

    if (unRejected.length > 0) {
      throw new BadRequestException(
        `You already have contributed to this micro task`,
      );
    }

    if (rejected.length >= maxRetryPerTask + 1) {
      throw new BadRequestException(`Maximum retry amount reached!`);
    }
  }
  /**
   * Finds all data sets that match the given options.
   * @param queryOption - The options to filter data sets.
   * @param queryRunner - The query runner to use.
   * @returns - A promise that resolves to an array of data sets.
   */
  async findAll(
    queryOption: QueryOptions<DataSet>,
    queryRunner?: QueryRunner,
  ): Promise<DataSet[]> {
    const options: any = {
      where: queryOption.where,
      order: queryOption.order || {},
      relations: queryOption.relations || [],
    };
    if (queryOption.select) {
      options.select = queryOption.select;
    }
    const manager = queryRunner ? queryRunner.manager : this.dataSetRepository;
    return await manager.find(options);
  }

  /**
 * Finds data sets with pagination.
 * @param queryOption - The options to filter data sets.
 * @param paginationDto - The pagination options.
 * @returns - A promise that resolves to a paginated result of data sets.
 * @remarks - If the data set type is 'audio', the file path will be replaced with a pre signed url.

 */
  async findPaginate(
    queryOption: QueryOptions<DataSet>,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<DataSet>> {
    const options: any = {
      where: queryOption.where,
      order: queryOption.order || {},
      relations: queryOption.relations || [],
    };
    if (queryOption.select) {
      options.select = queryOption.select;
    }
    const datasets: PaginatedResult<DataSet> =
      await this.paginateService.paginateWithOptionQuery(
        paginationDto,
        'data_set',
        queryOption,
      );
    for (const d of datasets.result) {
      if (d.type == 'audio') {
        d.file_path = await this.fileService.getPreSignedUrl(d.file_path);
      }
    }
    datasets.result = await this.fileService.getPreSignedDatasets(
      datasets.result,
    );
    return datasets;
  }

  /**
   * Finds one data set by the given options.
   * If a query runner is provided, it will be used to find the data set.
   * Otherwise, a new query runner will be created.
   * If the data set type is 'audio', the file path will be replaced with a pre signed url.
   * @param queryOption - The options to filter data sets.
   * @param queryRunner - The query runner to use.
   * @returns - A promise that resolves to the found data set or null if not found.
   */
  async findOne(
    queryOption: QueryOptions<DataSet>,
    queryRunner?: QueryRunner,
  ): Promise<DataSet | null> {
    const options: any = {
      where: queryOption.where,
      order: queryOption.order || {},
      relations: queryOption.relations || [],
    };
    if (queryOption.select) {
      options.select = queryOption.select;
    }

    if (queryRunner) {
      const manager = queryRunner.manager;
      return await manager.findOne(DataSet, options);
    }
    const manager = this.dataSetRepository;
    const dataSet: DataSet | null = await manager.findOne(options);
    if (dataSet && dataSet.type == 'audio') {
      dataSet.file_path = await this.fileService.getPreSignedUrl(
        dataSet.file_path,
      );
    }
    return dataSet;
  }

  async getDetails(dataSetId: string): Promise<DataSetDetailRto> {
    const dataSet = await this.dataSetRepository.findOne({
      where: { id: dataSetId },
      relations: {
        microTask: true,
        dataSetReviews: {
          reviewer: { score: true },
          rejectionReasons: { rejectionType: true },
          flagReasons: { flagType: true },
          annotations: true,
        },
      },
    });

    if (!dataSet) {
      throw new NotFoundException('Data set not found');
    }
    const task = await this.taskService.findOne({
      where: { id: dataSet.microTask.task_id },
      relations: { taskRequirement: true },
    });

    if (dataSet.type == 'audio') {
      dataSet.file_path = await this.fileService.getPreSignedUrl(
        dataSet.file_path,
      );
    }
    const expectedReviews = task?.taskRequirement.max_reviewer_per_dataset || 1;
    const totalReviews = dataSet.dataSetReviews.length;
    return DataSetDetailRto.from(dataSet, totalReviews, expectedReviews);
  }

  /**
   * Updates a data set in the database.
   * If a query runner is provided, it will be used to update the data set.
   * Otherwise, a new query runner will be created.
   * @param id The id of the data set to update.
   * @param dataSet The partial data set to update.
   * @param queryRunner The query runner to use.
   * @returns A promise resolving to the updated data set if found, or null.
   */
  async update(
    id: string,
    dataSet: Partial<DataSet>,
    queryRunner?: QueryRunner,
  ): Promise<DataSet | null> {
    if (queryRunner) {
      const manager = queryRunner.manager;
      await manager.update(DataSet, id, dataSet);
      return await manager.findOne(DataSet, { where: { id } });
    } else {
      const manager = this.dataSetRepository;
      await manager.update(id, dataSet);
      return await manager.findOne({ where: { id } });
    }
  }

  /**
   * Removes a data set from the database.
   * @param id The id of the data set to remove.
   * @returns A promise resolving to void when the removal is successful.
   */
  async remove(id: string): Promise<void> {
    await this.dataSetRepository.delete(id);
    return;
  }
  // async generateCode(): Promise<string> {
  //   const randomNumber = Math.floor(Math.random() * 1000000) + 1;
  //   // Format as DAT-XXXXX (pad with zeros)
  //   const code = `DAT-${String(randomNumber).padStart(8, '0')}`;
  //   let dataset = await this.dataSetRepository.findOne({
  //     where: { code: code },
  //   });
  //   if (dataset) {
  //     return this.generateCode();
  //   }
  //   return code;
  // }
  async generateCodes(amount: number): Promise<string[]> {
    const codes: string[] = [];
    for (let i = 0; i < amount; i++) {
      const code = 'DAT-' + crypto.randomUUID().slice(0, 8);
      codes.push(code);
    }
    return codes;
  }
  /**
   * Checks if a microtask is open for a contributor to submit a dataset.
   * It checks if the number of submitted datasets for the microtask is less than the max allowed.
   * If no task requirement is provided, it will assume that the microtask is open.
   * @param micro_task_id The id of the microtask to check.
   * @param taskRequirement The task requirement to check against.
   * @returns A promise that resolves to a boolean indicating if the microtask is open.
   */
  async checkMicroTaskOpenForDataSet(
    micro_task_id: string,
    taskRequirement?: TaskRequirement,
  ): Promise<boolean> {
    if (!taskRequirement) {
      return true; // If no task requirement is provided, assume it's open
    }
    const data_sets: DataSet[] = await this.findAll({
      where: {
        micro_task_id: micro_task_id,
        status: Not(DataSetStatus.REJECTED),
      },
    });
    if (data_sets.length >= taskRequirement.max_contributor_per_micro_task) {
      return false;
    }
    return true;
  }
  /**
   * Get the count of datasets per day/month/year
   * @param {string} view_type - 'WEEKLY', 'MONTHLY', or 'YEARLY'
   * @returns {Promise<any[]>} - An array of objects containing the date and count of datasets
   */
  async count(
    view_type: 'WEEKLY' | 'MONTHLY' | 'YEARLY' = 'WEEKLY',
  ): Promise<any[]> {
    if (view_type == 'WEEKLY') {
      const sevenDaysAgo: Date = startOfDay(subDays(new Date(), 6)); // Includes today
      const seven_days_ago = sevenDaysAgo.toISOString();
      const result = await this.dataSetRepository
        .createQueryBuilder('dataset')
        .select("DATE_TRUNC('day', dataset.created_date)", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('dataset.created_date >= :seven_days_ago', { seven_days_ago })
        .groupBy("DATE_TRUNC('day', dataset.created_date)")
        .orderBy("DATE_TRUNC('day', dataset.created_date)", 'ASC')
        .getRawMany();
      return result.map((r) => ({
        date: new Date(r.date).getDay(), // formatInTimeZone(new Date(r.date), 'Africa/Addis_Ababa', 'yyyy-MM-dd'),
        count: r.count,
      }));
    } else if (view_type == 'MONTHLY') {
      const start_date_year = startOfYear(new Date());
      const first_month = start_date_year.toISOString();
      const result = await this.dataSetRepository
        .createQueryBuilder('dataset')
        .select("DATE_TRUNC('month', dataset.created_date)", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('dataset.created_date >= :first_month', { first_month })
        .groupBy("DATE_TRUNC('month', dataset.created_date)")
        .orderBy("DATE_TRUNC('month', dataset.created_date)", 'ASC')
        .getRawMany();
      return result.map((r) => ({
        date: new Date(r.date).getMonth(), // formatInTimeZone(new Date(r.date), 'Africa/Addis_Ababa', 'yyyy-MM-dd'),
        count: r.count,
      }));
    } else if (view_type == 'YEARLY') {
      const result = await this.dataSetRepository
        .createQueryBuilder('dataset')
        .select("DATE_TRUNC('year', dataset.created_date)", 'date')
        .addSelect('COUNT(*)', 'count')
        .groupBy("DATE_TRUNC('year', dataset.created_date)")
        // .addGroupBy('dataset.status')
        .orderBy("DATE_TRUNC('year', dataset.created_date)", 'ASC')
        .getRawMany();
      return result.map((r) => ({
        date: new Date(r.date).getFullYear(), // formatInTimeZone(new Date(r.date), 'Africa/Addis_Ababa', 'yyyy-MM-dd'),
        count: r.count,
      }));
    } else {
      return [];
    }
  }
  /**
   * Counts the total number of datasets matching the given query.
   * @param query - The query options to filter the count.
   * @returns A promise resolving to the count of datasets.
   */
  async countAll(query: FindOptionsWhere<DataSet>): Promise<number> {
    return await this.dataSetRepository.count({ where: query });
  }
  /**
   * Get the count of datasets per day/month/year for a given task.
   * @param {string} view_type - 'WEEKLY', 'MONTHLY', or 'YEARLY'
   * @param {string} task_id - The ID of the task
   * @returns {Promise<any[]>} - An array of objects containing the date and count of datasets
   * @example
   * const task_id = '12345678-1234-5678-9012-3456789012';
   * const result = await dataSetService.countByTasks('MONTHLY', task_id);
   * console.log(result.map(r => ({date: r.date, count: r.count})));
   */
  async countByTasks(
    view_type: 'WEEKLY' | 'MONTHLY' | 'YEARLY' = 'WEEKLY',
    task_id: string,
  ): Promise<any[]> {
    const micro_tasks = await this.microTaskService.findAll({
      where: { task_id: task_id },
    });
    const micro_task_ids = micro_tasks.map((m) => m.id);
    if (view_type == 'WEEKLY') {
      const sevenDaysAgo: Date = startOfDay(subDays(new Date(), 6)); // Includes today
      const seven_days_ago = sevenDaysAgo.toISOString();
      const result = await this.dataSetRepository
        .createQueryBuilder('dataset')
        .select("DATE_TRUNC('day', dataset.created_date)", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('dataset.created_date >= :seven_days_ago', { seven_days_ago })
        .andWhere('dataset.micro_task_id IN (:...micro_task_ids)', {
          micro_task_ids,
        })
        .groupBy("DATE_TRUNC('day', dataset.created_date)")
        .orderBy("DATE_TRUNC('day', dataset.created_date)", 'ASC')
        .getRawMany();
      return result.map((r) => ({
        date: new Date(r.date).getDay(), // formatInTimeZone(new Date(r.date), 'Africa/Addis_Ababa', 'yyyy-MM-dd'),
        count: r.count,
      }));
    } else if (view_type == 'MONTHLY') {
      const start_date_year = startOfYear(new Date());
      const first_month = start_date_year.toISOString();
      const result = await this.dataSetRepository
        .createQueryBuilder('dataset')
        .select("DATE_TRUNC('month', dataset.created_date)", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('dataset.created_date >= :first_month', { first_month })
        .andWhere('dataset.micro_task_id IN (:...micro_task_ids)', {
          micro_task_ids,
        })
        .groupBy("DATE_TRUNC('month', dataset.created_date)")
        .orderBy("DATE_TRUNC('month', dataset.created_date)", 'ASC')
        .getRawMany();
      return result.map((r) => ({
        date: new Date(r.date).getMonth(), // formatInTimeZone(new Date(r.date), 'Africa/Addis_Ababa', 'yyyy-MM-dd'),
        count: r.count,
      }));
    } else if (view_type == 'YEARLY') {
      const result = await this.dataSetRepository
        .createQueryBuilder('dataset')
        .select("DATE_TRUNC('year', dataset.created_date)", 'date')
        .addSelect('COUNT(*)', 'count')
        .andWhere('dataset.micro_task_id IN (:...micro_task_ids)', {
          micro_task_ids,
        })
        .groupBy("DATE_TRUNC('year', dataset.created_date)")
        .orderBy("DATE_TRUNC('year', dataset.created_date)", 'ASC')
        .getRawMany();
      return result.map((r) => ({
        date: new Date(r.date).getFullYear(), // formatInTimeZone(new Date(r.date), 'Africa/Addis_Ababa', 'yyyy-MM-dd'),
        count: r.count,
      }));
    } else {
      return [];
    }
  }
  /**
   * Returns data set statistics grouped by the specified view type.
   * @param {string} view_type - The view type, either 'WEEKLY', 'MONTHLY' or 'YEARLY'.
   * @param {string[]} micro_task_ids - The IDs of the micro tasks to filter the data set statistics by.
   * @returns {Promise<any[]>} - A promise that resolves to an array of objects containing the date and count of the data set statistics.
   */
  async countByMicroTasks(
    view_type: 'WEEKLY' | 'MONTHLY' | 'YEARLY',
    micro_task_ids: string[],
  ): Promise<any[]> {
    if (view_type == 'WEEKLY') {
      const sevenDaysAgo: Date = startOfDay(subDays(new Date(), 6)); // Includes today
      const seven_days_ago = sevenDaysAgo.toISOString();
      const result = await this.dataSetRepository
        .createQueryBuilder('dataset')
        .select("DATE_TRUNC('day', dataset.created_date)", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('dataset.created_date >= :seven_days_ago', { seven_days_ago })
        .andWhere('dataset.micro_task_id IN (:...micro_task_ids)', {
          micro_task_ids,
        })
        .groupBy("DATE_TRUNC('day', dataset.created_date)")
        .orderBy("DATE_TRUNC('day', dataset.created_date)", 'ASC')
        .getRawMany();
      return result.map((r) => ({
        date: new Date(r.date).getDay(), // formatInTimeZone(new Date(r.date), 'Africa/Addis_Ababa', 'yyyy-MM-dd'),
        count: r.count,
      }));
    } else if (view_type == 'MONTHLY') {
      const start_date_year = startOfYear(new Date());
      const first_month = start_date_year.toISOString();
      const result = await this.dataSetRepository
        .createQueryBuilder('dataset')
        .select("DATE_TRUNC('month', dataset.created_date)", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('dataset.created_date >= :first_month', { first_month })
        .andWhere('dataset.micro_task_id IN (:...micro_task_ids)', {
          micro_task_ids,
        })
        .groupBy("DATE_TRUNC('month', dataset.created_date)")
        .orderBy("DATE_TRUNC('month', dataset.created_date)", 'ASC')
        .getRawMany();
      return result.map((r) => ({
        date: new Date(r.date).getMonth(), // formatInTimeZone(new Date(r.date), 'Africa/Addis_Ababa', 'yyyy-MM-dd'),
        count: r.count,
      }));
    } else if (view_type == 'YEARLY') {
      const result = await this.dataSetRepository
        .createQueryBuilder('dataset')
        .select("DATE_TRUNC('year', dataset.created_date)", 'date')
        .addSelect('COUNT(*)', 'count')
        .andWhere('dataset.micro_task_id IN (:...micro_task_ids)', {
          micro_task_ids,
        })
        .groupBy("DATE_TRUNC('year', dataset.created_date)")
        .orderBy("DATE_TRUNC('year', dataset.created_date)", 'ASC')
        .getRawMany();
      return result.map((r) => ({
        date: new Date(r.date).getFullYear(), // formatInTimeZone(new Date(r.date), 'Africa/Addis_Ababa', 'yyyy-MM-dd'),
        count: r.count,
      }));
    } else {
      return [];
    }
  }
  /**
   * Retrieve the data sets for a given task.
   *
   * @param {string} task_id - The ID of the task.
   * @param {TaskSubmissionsDto} taskSubmissionDto - The pagination and filtering options.
   * @returns {Promise<PaginatedResult<DataSet>>} - A promise that resolves to a paginated result of data sets.
   */
  async getTaskDataSetsSubmissions(
    task_id: string,
    taskSubmissionDto: TaskSubmissionsDto,
  ): Promise<PaginatedResult<DataSet>> {
    const page = taskSubmissionDto.page || 1;
    const limit = taskSubmissionDto.limit || 10;
    const offset = (page - 1) * limit;
    const task: Task | null = await this.taskService.findOne({
      where: { id: task_id },
      relations: { taskType: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    const query: FindOptionsWhere<DataSet> = {
      microTask: {
        task: {
          id: task_id,
        },
      },
    };
    if (taskSubmissionDto.contributor_id) {
      query.contributor = {
        id: taskSubmissionDto.contributor_id,
      };
    }
    if (taskSubmissionDto.status) {
      query.status = taskSubmissionDto.status;
    }
    const [dataSets, totalCount] = await this.dataSetRepository.findAndCount({
      where: query,
      relations: {
        contributor: true,
        rejectionReasons: {
          rejectionType: true,
        },
        flagReason: {
          flagType: true,
        },
        microTask: true,
        // reviewer: true,
      },
      skip: offset,
      take: limit,
    });
    let signedDataSets = dataSets;
    if (
      [taskTypes.TEXT_TO_AUDIO, taskTypes.IMAGE_TO_AUDIO].indexOf(
        task?.taskType?.task_type || '',
      ) !== -1
    ) {
      signedDataSets = await this.fileService.getPreSignedDatasets(dataSets);
    }
    if (
      [
        taskTypes.AUDIO_TO_TEXT,
        taskTypes.IMAGE_TO_AUDIO,
        taskTypes.IMAGE_TO_TEXT,
      ].indexOf(task?.taskType?.task_type || '') !== -1
    ) {
      for (const dataset of signedDataSets) {
        await this.fileService.setPreSignedMicroTask(dataset.microTask);
      }
    }
    return paginate(signedDataSets, totalCount, page, limit);
  }
  /**
   * Retrieves data sets for a given task and contributor.
   * @param {string} task_id - id of the task
   * @param {string} contributor_id - id of the contributor
   * @param {PaginationDto} paginationDto - pagination info
   * @returns {Promise<PaginatedResult<DataSet>>} - paginated result containing data sets
   * @throws {NotFoundException} - task is not found
   */
  async getTaskDataSetsSubmissionsPerContributor(
    task_id: string,
    contributor_id: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<DataSet>> {
    const page = paginationDto.page || 1;
    const limit = paginationDto.limit || 10;
    const offset = (page - 1) * limit;
    const task: Task | null = await this.taskService.findOne({
      where: { id: task_id },
      relations: { taskType: true },
    });
    if (!task) {
      throw new NotFoundException('Task is not found !');
    }

    const [dataSets, totalCount] = await this.dataSetRepository.findAndCount({
      where: {
        microTask: {
          task: { id: task_id },
        },
        contributor: { id: contributor_id },
      },
      relations: {
        contributor: true,
        rejectionReasons: {
          rejectionType: true,
        },
        flagReason: {
          flagType: true,
        },
        microTask: true,
        // reviewer: true,

        // TO DO
      },
      skip: offset,
      take: limit,
    });
    if (
      [taskTypes.TEXT_TO_AUDIO, taskTypes.IMAGE_TO_AUDIO].includes(
        task.taskType.task_type,
      )
    ) {
      for (const dataSet of dataSets) {
        await this.fileService.setPreSignedDatasets(dataSet);
      }
    } else if (
      [taskTypes.AUDIO_TO_TEXT, taskTypes.IMAGE_TO_AUDIO].includes(
        task.taskType.task_type,
      )
    ) {
      for (const dataSet of dataSets) {
        await this.fileService.setPreSignedMicroTask(dataSet.microTask);
      }
    }

    return {
      result: dataSets,
      total: totalCount,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }
  /**
   * Retrieves a list of data sets grouped by dialect and the count of each dialect.
   * @param {string[]} microTaskIds - optional list of micro task ids to filter by
   * @returns {Promise<any[]>} - list of objects containing dialect id, dialect name, and count
   */
  async getDatasetCountsByDialect(microTaskIds?: string[]) {
    const queryBuilder = this.dataSetRepository.createQueryBuilder('dataset');
    if (microTaskIds) {
      queryBuilder.where('dataset.micro_task_id IN (:...microTaskIds)', {
        microTaskIds,
      });
    }
    return await queryBuilder
      .select('dataset.dialect_id', 'dialect_id')
      .addSelect('dialect.name', 'dialect_name')
      .addSelect('COUNT(dataset.id)', 'count')
      .leftJoin('dataset.dialect', 'dialect')
      .groupBy('dataset.dialect_id')
      .addGroupBy('dialect.name')
      .orderBy('count', 'DESC')
      .getRawMany();
  }
  async getDatasetCountsByLanguage(microTaskIds?: string[]) {
    const queryBuilder = this.dataSetRepository.createQueryBuilder('dataset');
    if (microTaskIds) {
      queryBuilder.where('dataset.micro_task_id IN (:...microTaskIds)', {
        microTaskIds,
      });
    }
    return await queryBuilder
      .select('dataset.language_id', 'language_id')
      .addSelect('language.name', 'language_name')
      .addSelect('COUNT(dataset.id)', 'count')
      .leftJoin('dataset.language', 'language')
      .groupBy('dataset.language_id')
      .addGroupBy('language.name')
      .orderBy('count', 'DESC')
      .getRawMany();
  }
  async countByOptions(
    options: FindOptionsWhere<DataSet> | FindOptionsWhere<DataSet>[],
  ): Promise<number> {
    return await this.dataSetRepository.count({ where: options });
  }
  /**
   * Returns the microtask and its associated dataSets for the given contributor
   *
   * @param microTaskId - the id of the microtask
   * @param contributorId - the id of the contributor
   * @returns an object containing the microtask and its associated dataSets
   * @throws NotFoundException if the microtask is not found
   */
  async contributorSubmission(
    microTaskId: string,
    contributorId: string,
  ): Promise<ContributorMicroTaskRto> {
    const microTask = await this.microTaskService.findOne({
      where: {
        id: microTaskId,
        dataSets: {
          contributor_id: contributorId,
        },
      },
      relations: {
        task: { taskRequirement: true, taskType: true },
        dataSets: {
          rejectionReasons: true,
          flagReason: true,
        },
      },
    });
    if (!microTask) {
      throw new NotFoundException(`MicroTask not found`);
    }
    const hasApprovedOrPendingDatasets = microTask.dataSets.some((dataSet) => {
      return (
        dataSet.status === DataSetStatus.APPROVED ||
        dataSet.status === DataSetStatus.PENDING
      );
    });
    const hasReachedMaxRetry =
      microTask.dataSets.length >=
      microTask.task.taskRequirement.max_retry_per_task;
    if (microTask.task.taskType.task_type == 'text-audio') {
      microTask.dataSets = await this.fileService.getPreSignedDatasets(
        microTask.dataSets,
      );
    }
    return {
      ...MicroTaskSanitize.from(microTask),
      dataSets: microTask.dataSets.map((dataSet) =>
        DataSetSanitize.from(dataSet),
      ),
      current_retry: microTask.dataSets.length,
      allowed_retry: microTask.task.taskRequirement.max_retry_per_task,
      can_retry: hasApprovedOrPendingDatasets ? false : hasReachedMaxRetry,
    };
  }
  async getTaskDataSetReviewStats(
    taskId: string,
    maxReviewerPerDataSet: number,
  ): Promise<TaskDataSetReviewerDistributionRto> {
    const now = new Date();

    const raw = await this.dataSetRepository
      .createQueryBuilder('ds')

      // Ensure dataset belongs to the task
      .innerJoin('ds.microTask', 'mt', 'mt.task_id = :taskId', { taskId })

      // Count only this task's non-expired reviews
      .leftJoin(
        'ds.dataSetReviews',
        'dsr',
        `
      dsr.task_id = :taskId
      AND dsr.expires_at > :now
      `,
        { taskId, now },
      )

      .select('ds.id', 'dataSetId')
      .addSelect('ds.status', 'status')
      .addSelect('COUNT(dsr.id)', 'reviewCount')
      .groupBy('ds.id')
      .addGroupBy('ds.status')
      .getRawMany();

    let totalFullyAssignedDataSets = 0;
    let totalPartiallyAssignedDataSets = 0;
    let totalReviewedDataSets = 0;
    let totalUnAssignedDataSets = 0;

    for (const row of raw) {
      const reviewCount = Number(row.reviewCount);
      const status = row.status;

      // 1️⃣ Reviewed datasets (status != Pending)
      if (status !== 'Pending') {
        totalReviewedDataSets++;
        continue;
      }

      // 2️⃣ Pending datasets
      if (reviewCount === 0) {
        totalUnAssignedDataSets++;
      } else if (reviewCount >= maxReviewerPerDataSet) {
        totalFullyAssignedDataSets++;
      } else {
        totalPartiallyAssignedDataSets++;
      }
    }

    return {
      totalFullyAssignedDataSets,
      totalPartiallyAssignedDataSets,
      totalReviewedDataSets,
      totalUnAssignedDataSets,
    };
  }
  async getReviewDataSetsForQA(
  taskId: string,
  payload: GetQAMicroTasksDto,
): Promise<PaginatedResult<DataSetDetailRto>> {
  const page = payload.page || 1;
  const limit = payload.limit || 10;
  const skip = (page - 1) * limit;

  const dataSetReviewQuery = this.dataSetRepository
    .createQueryBuilder('dataSet')
    .leftJoinAndSelect('dataSet.microTask', 'microTask')
    .leftJoinAndSelect('dataSet.dataSetReviews', 'dataSetReviews')
    .leftJoinAndSelect('dataSetReviews.reviewer', 'reviewer')
    .leftJoinAndSelect('reviewer.score', 'score')
    .leftJoinAndSelect('dataSetReviews.annotations', 'annotations')
    .leftJoinAndSelect('dataSetReviews.rejectionReasons', 'rejectionReasons')
    .leftJoinAndSelect('rejectionReasons.rejectionType', 'rejectionType')

    .leftJoinAndSelect('dataSetReviews.flagReasons', 'flagReasons')
    .leftJoinAndSelect('flagReasons.flagType', 'flagType')
    // ✅ Base condition  always applied first
    .where('dataSetReviews.task_id = :taskId', { taskId });

  // ✅ Fixed: was incorrectly using .where() which overwrote the taskId condition
  if (payload.is_uncertain != null) {
    dataSetReviewQuery.andWhere(
      'dataSetReviews.is_uncertain = :is_uncertain',
      { is_uncertain: payload.is_uncertain },
    )
    .andWhere(
        'dataSet.qa_review_status = :dataSetStatus',
        { dataSetStatus: payload.status },
      );
  }

  if (payload.reviewerIds) {
    if (Array.isArray(payload.reviewerIds) && payload.reviewerIds.length > 0) {
      dataSetReviewQuery.andWhere(
        'dataSetReviews.reviewer_id IN (:...reviewerIds)',
        { reviewerIds: payload.reviewerIds },
      );
    } else if (!Array.isArray(payload.reviewerIds)) {
      dataSetReviewQuery.andWhere(
        'dataSetReviews.reviewer_id = :reviewerId',
        { reviewerId: payload.reviewerIds },
      );
    }
  }

  if (payload.status) {
    if (payload.status === 'Flagged') {
      dataSetReviewQuery.andWhere('dataSet.is_flagged = :is_flagged', {
        is_flagged: true,
      });
    } 
    else {
      dataSetReviewQuery.andWhere(
        'dataSet.qa_review_status = :dataSetStatus',
        { dataSetStatus: payload.status },
      );
    }
  }

  const [dataSetReviews, total] = await dataSetReviewQuery
    .skip(skip)
    .take(limit)
    .getManyAndCount();

  // ✅ Fixed: await inside forEach doesn't work  use Promise.all instead
  if (dataSetReviews.length > 0) {
    const firstType = dataSetReviews[0].type;
    const microTaskType = dataSetReviews[0].microTask?.type;

    if (firstType === 'audio') {
      await Promise.all(
        dataSetReviews.map(async (dataSet) => {
          dataSet.file_path = await this.fileService.getPreSignedUrl(
            dataSet.file_path,
          );
        }),
      );
    }

    if (microTaskType && ['audio', 'image'].includes(microTaskType)) {
      await Promise.all(
        dataSetReviews.map(async (dataSet) => {
          dataSet.microTask.file_path = await this.fileService.getPreSignedUrl(
            dataSet.microTask.file_path,
          );
        }),
      );
    }
  }

  const formattedDataSets = dataSetReviews.map((dataSet) =>
    DataSetDetailRto.from(dataSet, 0, 0),
  );

  return paginate(formattedDataSets, total, page, limit);
}
}
