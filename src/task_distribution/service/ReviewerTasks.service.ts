import { InjectRepository } from '@nestjs/typeorm';
import {
  FindOptionsWhere,
  In,
  MoreThan,
  QueryRunner,
  Repository,
} from 'typeorm';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSet } from 'src/data_set/entities/DataSet.entity';
import { DataSetReview } from '../enitities/DataSetReview.entity';
import { paginate, PaginatedResult } from 'src/utils/paginate.util';
import { FindReviewerDataSetDto } from 'src/data_set/dto/DataSet.dto';
import { DataSetService } from 'src/data_set/service/DataSet.service';
import { TaskService } from 'src/project/service/Task.service';
import { TaskDataSetReviewerDistributionRto } from '../rto/TaskMonitoring.rto';
import { taskTypes, UserTaskStatus } from 'src/utils/constants/Task.constant';
import { UserTaskService } from 'src/project/service/UserTask.service';
import { FileService } from 'src/common/service/File.service';
import { RejectionReasonService } from 'src/data_set/service/RejectionReason.service';
import { FlagReasonService } from 'src/data_set/service/FlagReason.service';
import { DataSetAnnotationService } from 'src/base_data/service/DataSetAnnotation.service';
import { Task } from 'src/project/entities/Task.entity';
import { PaginationDto } from 'src/common/dto/Pagination.dto';
import { ReviewDetailRto } from '../dto/DataSet.dto';
import { GetQAMicroTasksDto } from '../dto/Task.dto';
import { UserScoreService } from 'src/auth/service/UserScore.service';
import { ReviewerScore } from 'src/utils/constants/ActionScore.contant';
import { DataSetDetailRto } from 'src/data_set/rto/DataSet.rto';
export class DataSetWithReviewInfo extends DataSet {
  data_set_review_id: string;
  review_status: string;
  dead_line:Date
}
@Injectable()
export class ReviewerTaskService {
  constructor(
    @InjectRepository(DataSetReview)
    private readonly dataSetReviewRepository: Repository<DataSetReview>,

    private readonly userScoreService: UserScoreService,
    private readonly dataSetService: DataSetService,
    private readonly taskService: TaskService,
    private readonly userTaskService: UserTaskService,
    private readonly fileService: FileService,
    private readonly rejectionService: RejectionReasonService,
    private readonly flagReasonService: FlagReasonService,
    private readonly dataSetAnnotationService: DataSetAnnotationService,
  ) {}
  async getReviewerTaskAssignments(
    taskId: string,
    reviewerId: string,
    query: FindReviewerDataSetDto,
  ): Promise<PaginatedResult<DataSetWithReviewInfo>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;
    let where:
      | FindOptionsWhere<DataSetReview>
      | FindOptionsWhere<DataSetReview>[] = {
      task_id: taskId,
      reviewer_id: reviewerId,
    };
    if (query.status === 'Pending') {
      // Unexpired reviewer tasks (no status filter needed if pending is default)
      where.status = 'pending';
      where.expires_at = MoreThan(new Date());
    } else if (query.status === 'Approved') {
      where.status = 'approved';
    } else if (query.status === 'Rejected') {
      where.status = 'rejected';
    } else if (query.status === 'Flagged') {
      where.status = 'rejected';
      where.is_flagged = true;
    } else {
      where = [
        {
          task_id: taskId,
          reviewer_id: reviewerId,
          status: 'pending',
          expires_at: MoreThan(new Date()),
        },
        {
          task_id: taskId,
          reviewer_id: reviewerId,
          status: 'approved',
        },
        {
          task_id: taskId,
          reviewer_id: reviewerId,
          status: 'rejected',
        },
      ];
    }

    const [tasks, total] = await this.dataSetReviewRepository.findAndCount({
      where: where,
      relations: {
        dataSet: { microTask: true },
      },
      skip: skip,
      take: limit,
    });
    console.log(tasks.map((t) => ({ ...t.dataSet })));
    return paginate<DataSetWithReviewInfo>(
      tasks.map((t) => ({
        ...t.dataSet,
        data_set_review_id: t.id,
        review_status: t.status,
        dead_line:t.expires_at
      })),
      total,
      page,
      limit,
    );
  }
  async getTaskDataSetReviewStats(
    taskId: string,
  ): Promise<TaskDataSetReviewerDistributionRto> {
    const task = await this.taskService.findOne({
      where: { id: taskId },
      relations: { taskRequirement: true },
    });
    if (!task) {
      throw new UnauthorizedException('Task not found');
    }
    return this.dataSetService.getTaskDataSetReviewStats(
      taskId,
      task.taskRequirement.max_reviewer_per_dataset,
    );
  }
  async getReviewerTasksWithPresignedUrl(
    task_id: string,
    user_id: string,
    query: FindReviewerDataSetDto,
  ): Promise<PaginatedResult<DataSetWithReviewInfo>> {
    // const userTask = await this.userTaskService.findOne({
    //   where: { user_id: user_id, task_id: task_id },
    //   relations: { user: true, task: { taskType: true } },
    // });
    // if (!userTask) {
    //   throw new UnauthorizedException(`User is not assigned to the task`);
    // }
    const task= await this.taskService.findOne({
      where: { id: task_id },
      relations: { taskType: true },
    });
    const reviewerId = user_id;
    // const task = .task;
    // const
    // get datasets from redis if exists
    const dataSets = await this.getReviewerTaskAssignments(
      task_id,
      reviewerId,
      query,
    );
    if (
      [taskTypes.TEXT_TO_AUDIO, taskTypes.IMAGE_TO_AUDIO].indexOf(
        task?.taskType?.task_type || '',
      ) !== -1
    ) {
      for (const dataset of dataSets.result) {
        await this.fileService.setPreSignedDatasets(dataset);
      }
    }
    if (
      [
        taskTypes.AUDIO_TO_TEXT,
        taskTypes.IMAGE_TO_TEXT,
        taskTypes.IMAGE_TO_AUDIO,
      ].indexOf(task?.taskType?.task_type || '') !== -1
    ) {
      for (const dataset of dataSets.result) {
        dataset.microTask.file_path = await this.fileService.getPreSignedUrl(
          dataset.microTask.file_path,
        );
      }
    }
    return dataSets;
  }
  /**
   * Rejects a data set and updates the reviewer's wallet and the contributor's user task status.
   * @param id The id of the data set to reject.
   * @param rejectionReason The reason for rejecting the data set.
   * @param reviewer_id The id of the reviewer who is rejecting the data set.
   * @param queryRunner The query runner to use when updating the database.
   * @param is_flagged Whether the data set is flagged or not.
   * @returns A promise resolving to the rejected data set if successful.
   * @throws BadRequestException If the data set is already rejected.
   * @throws NotFoundException If the data set is not found.
   * @throws BadRequestException If the reviewer is not a member of the task.
   */
  async rejectDataSet(
    dataSetReviewId: string,
    rejectionReasons: {
      data_set_review_id: string;
      rejection_type_id: string;
    }[],
    reviewerId: string,
    queryRunner: QueryRunner,
    is_flagged?: boolean,
    comment?: string,
    flag_type_ids?: string[],
    is_uncertain?: boolean,
  ): Promise<string> {
    const manager = queryRunner.manager;
    const dataSetReview = await manager.findOne(DataSetReview, {
      where: { id: dataSetReviewId, reviewer_id: reviewerId },
      relations: { dataSet: { microTask: { task: true } } },
    });
    const now = new Date();
    if (!dataSetReview || dataSetReview.expires_at < now) {
      throw new NotFoundException('Dataset not found or expired');
    }
    if (dataSetReview.status !== 'pending') {
      throw new BadRequestException('data set already rejected');
    }
    const membership=await this.userTaskService.findOne({
      where:{user_id: reviewerId, task_id:dataSetReview.task_id},
    })
    if(!membership){
      throw new UnauthorizedException("Reviewer is no longer actively assigned to the task");
    }
    if (membership.status !== UserTaskStatus.ACTIVE) {
      throw new UnauthorizedException("Reviewer is no longer actively assigned to the task");
    }
    await manager.update(DataSetReview, dataSetReviewId, {
      status: 'rejected',
      is_flagged: is_flagged ? true : false,
      is_uncertain: is_uncertain ? true : false,
      reviewed_at: now,
      comment: comment,
    });
    await this.rejectionService.createBulk(
      rejectionReasons.map((r) => ({
        ...r,
        data_set_id: dataSetReview.data_set_id,
      })),
      queryRunner,
    );
    if (flag_type_ids?.length) {
      await this.flagReasonService.createBulk(
        flag_type_ids.map((flag_type_id) => ({
          data_set_id: dataSetReview.data_set_id,
          data_set_review_id: dataSetReviewId,
          flag_type_id,
        })),
        queryRunner,
      );
    }
    return 'DataSet Rejected Successfully';
  }

  /**
   * Approves a data set.
   *
   * @param id - id of the data set.
   * @param reviewer_id - id of the reviewer.
   * @param queryRunner - query runner object.
   * @param annotation - annotation of the data set.
   * @returns nothing if the data set is approved successfully.
   * @throws NotFoundException - if the data set is not found.
   * @throws BadRequestException - if the data set is already approved or rejected, or if the annotation is not found.
   */
  async approveDataSet(
    dataSetReviewId: string,
    reviewerId: string,
    queryRunner: QueryRunner,
    annotationIds?: string[],
    is_uncertain?: boolean,
  ): Promise<void> {
    
    const manager = queryRunner.manager;

    const dataSetReview = await manager.findOne(DataSetReview, {
      where: { id: dataSetReviewId, reviewer_id: reviewerId },
      relations: { dataSet: { microTask: { task: true } } },
    });

    const now = new Date();

    if (!dataSetReview || dataSetReview.expires_at < now) {
      throw new NotFoundException('Dataset not found or expired');
    }

    if (dataSetReview.status !== 'pending') {
      throw new BadRequestException('data set already rejected');
    }

    const membership=await this.userTaskService.findOne({
      where:{user_id: reviewerId, task_id:dataSetReview.task_id},
    })
    if(!membership){
      throw new UnauthorizedException("Reviewer is no longer actively assigned to the task");
    }
    if (membership.status !== UserTaskStatus.ACTIVE) {
      throw new UnauthorizedException("Reviewer is no longer actively assigned to the task");
    }

    // update normal columns
    await manager.update(DataSetReview, dataSetReviewId, {
      status: 'approved',
      reviewed_at: now,
      is_uncertain: is_uncertain ? true : false,
    });

    // attach annotations
    if (annotationIds?.length) {
      await manager
        .createQueryBuilder()
        .relation(DataSetReview, 'annotations')
        .of(dataSetReviewId)
        .add(annotationIds);
    }
  }

  async countByOptions(
    options: FindOptionsWhere<DataSetReview>,
  ): Promise<number> {
    return await this.dataSetReviewRepository.count({ where: options });
  }
  async getReviewDetail(review_id: string): Promise<ReviewDetailRto> {
    const review = await this.dataSetReviewRepository.findOne({
      where: { id: review_id },
      relations: { rejectionReasons: true, dataSet: { microTask: true } },
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.dataSet.type == 'audio' || review.dataSet.type == 'image') {
      review.dataSet.file_path = await this.fileService.getPreSignedUrl(
        review.dataSet.file_path,
      );
    }
    if (
      review.dataSet.microTask.type == 'audio' ||
      review.dataSet.microTask.type == 'image'
    ) {
      review.dataSet.microTask.file_path =
        await this.fileService.getPreSignedUrl(
          review.dataSet.microTask.file_path,
        );
    }
    return ReviewDetailRto.from(review);
  }

  async rejectByProjectManager(
    dataSetId: string,
    rejectionTypeIds: string[],
    reviewerId: string,
    queryRunner: QueryRunner,
    is_flagged?: boolean,
    comment?: string,
    is_uncertain?: boolean,
  ): Promise<string> {
    const manager = queryRunner.manager;
    const dataSet = await this.dataSetService.findOne({
      where: { id: dataSetId },
      relations: { microTask: { task: true } },
    });
    if (!dataSet) {
      throw new NotFoundException('Dataset not found');
    }
    await this.dataSetService.update(
      dataSetId,
      { status: 'Rejected' },
      queryRunner,
    );
    const now = new Date();

    const reviewData = manager.create(DataSetReview, {
      data_set_id: dataSetId,
      task_id: dataSet.microTask.task_id,
      reviewer_id: reviewerId,
      status: 'rejected',
      is_flagged: is_flagged ? true : false,
      is_uncertain: is_uncertain ? true : false,
      reviewed_at: now,
      expires_at: now,
      comment: comment,
    });
    const dataSetReview = await manager.save(DataSetReview, reviewData);
    await this.rejectionService.createBulk(
      rejectionTypeIds.map((r) => ({
        data_set_id: dataSetId,
        data_set_review_id: dataSetReview.id,
        rejection_type_id: r,
      })),
      queryRunner,
    );
    // // add reviewer score

    return 'DataSet Rejected Successfully';
  }

  /**
   * Approves a data set.
   *
   * @param id - id of the data set.
   * @param reviewer_id - id of the reviewer.
   * @param queryRunner - query runner object.
   * @param annotation - annotation of the data set.
   * @returns nothing if the data set is approved successfully.
   * @throws NotFoundException - if the data set is not found.
   * @throws BadRequestException - if the data set is already approved or rejected, or if the annotation is not found.
   */
  async approveDataSetProjectManager(
    dataSetId: string,
    reviewerId: string,
    queryRunner: QueryRunner,
    annotationIds?: string[],
  ): Promise<string> {
    const manager = queryRunner.manager;
    const annotations = annotationIds
      ? await this.dataSetAnnotationService.findAll({ id: In(annotationIds) })
      : [];
    const now = new Date();
    const dataSet = await this.dataSetService.findOne({
      where: { id: dataSetId },
      relations: { microTask: { task: true } },
    });
    if (!dataSet) {
      throw new NotFoundException('Dataset not found');
    }
    await this.dataSetService.update(
      dataSetId,
      { status: 'Approved' },
      queryRunner,
    );
    const reviewData = manager.create(DataSetReview, {
      data_set_id: dataSetId,
      task_id: dataSet.microTask.task_id,
      reviewer_id: reviewerId,
      status: 'approved',
      reviewed_at: now,
      expires_at: now,
    });
    const savedReview = await manager.save(DataSetReview, reviewData);

    if (annotations.length) {
      savedReview.annotations = annotations;
      await manager.save(savedReview);
    }
    await manager.save(DataSetReview, reviewData);
    // add reviewer score
    return 'DataSet Approved Successfully';
  }

  async rejectByQA(
    dataSetId: string,
    rejectionTypeIds: string[],
    reviewerId: string,
    queryRunner: QueryRunner,
    is_flagged?: boolean,
    comment?: string,
    is_uncertain?: boolean,
  ): Promise<string> {
    const manager = queryRunner.manager;
    const dataSet = await this.dataSetService.findOne({
      where: { id: dataSetId },
      relations: { microTask: { task: true }, dataSetReviews: true },
    });
    if (!dataSet) {
      throw new NotFoundException('Dataset not found');
    }
    if (dataSet.qa_review_status == 'Approved') {
      throw new BadRequestException('Dataset already approved');
    }
    if (dataSet.qa_review_status == 'Rejected') {
      throw new BadRequestException('Dataset already rejected');
    }
    await this.dataSetService.update(
      dataSetId,
      { qa_review_status: 'Rejected', is_flagged: is_flagged ? true : false },
      queryRunner,
    );
    const now = new Date();

    const reviewData = manager.create(DataSetReview, {
      data_set_id: dataSetId,
      task_id: dataSet.microTask.task_id,
      reviewer_id: reviewerId,
      status: 'rejected',
      is_flagged: is_flagged ? true : false,
      is_uncertain: is_uncertain ? true : false,
      reviewed_at: now,
      expires_at: now,
      comment: comment,
    });
    const dataSetReview = await manager.save(DataSetReview, reviewData);
    await this.rejectionService.createBulk(
      rejectionTypeIds.map((r) => ({
        data_set_review_id: dataSetReview.id,
        data_set_id: dataSetId,
        rejection_type_id: r,
      })),
      queryRunner,
    );
    // // add reviewer score
    const reviewsGiven = dataSet.dataSetReviews;
    const reviewsWithScoreGiven: Map<string, number> = new Map();
    for (const review of reviewsGiven) {
      if (review.status == 'approved') {
        reviewsWithScoreGiven.set(
          review.reviewer_id,
          ReviewerScore.INVALID_REVIEW,
        );
      }
    }
    await this.userScoreService.updateReviewersScore(
      reviewsWithScoreGiven,
      queryRunner,
    );
    return 'DataSet Rejected Successfully';
  }

  /**
   * Approves a data set.
   *
   * @param id - id of the data set.
   * @param reviewer_id - id of the reviewer.
   * @param queryRunner - query runner object.
   * @param annotation - annotation of the data set.
   * @returns nothing if the data set is approved successfully.
   * @throws NotFoundException - if the data set is not found.
   * @throws BadRequestException - if the data set is already approved or rejected, or if the annotation is not found.
   */
  async approveByQA(
    dataSetId: string,
    reviewerId: string,
    queryRunner: QueryRunner,
    annotationIds?: string[],
  ): Promise<string> {
    const manager = queryRunner.manager;
    const annotations = annotationIds
      ? await this.dataSetAnnotationService.findAll({ id: In(annotationIds) })
      : [];
    const now = new Date();
    const dataSet = await this.dataSetService.findOne({
      where: { id: dataSetId },
      relations: { microTask: { task: true }, dataSetReviews: true },
    });
    if (!dataSet) {
      throw new NotFoundException('Dataset not found');
    }
    if (dataSet.qa_review_status == 'Approved') {
      throw new BadRequestException('Dataset already approved');
    }
    if (dataSet.qa_review_status == 'Rejected') {
      throw new BadRequestException('Dataset already rejected');
    }
    await this.dataSetService.update(
      dataSetId,
      { qa_review_status: 'Approved' },
      queryRunner,
    );
    const reviewData = manager.create(DataSetReview, {
      data_set_id: dataSetId,
      task_id: dataSet.microTask.task_id,
      reviewer_id: reviewerId,
      status: 'approved',
      reviewed_at: now,
      expires_at: now,
    });
    const savedReview = await manager.save(DataSetReview, reviewData);

    if (annotations.length) {
      savedReview.annotations = annotations;
      await manager.save(savedReview);
    }
    await manager.save(DataSetReview, reviewData);
    const reviewsGiven = dataSet.dataSetReviews;
    const reviewsWithScoreGiven: Map<string, number> = new Map();
    for (const review of reviewsGiven) {
      if (review.status == 'rejected') {
        reviewsWithScoreGiven.set(
          review.reviewer_id,
          ReviewerScore.INVALID_REVIEW,
        );
      }
    }
    await this.userScoreService.updateReviewersScore(
      reviewsWithScoreGiven,
      queryRunner,
    );
    // add reviewer score
    return 'DataSet Approved Successfully';
  }

  async getQATasks(
    qaId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Task>> {
    return this.userTaskService.getQATasks(qaId, paginationDto);
  }

  async getQAReviewDataSets(
    taskId: string,
    payload: GetQAMicroTasksDto,
  ): Promise<PaginatedResult<DataSetDetailRto>> {
    return this.dataSetService.getReviewDataSetsForQA(taskId, payload);
  }
  async getOverloadedReviewers(limit = 50): Promise<{ reviewer_id: string; email: string; preferred_language: string; queue_count: number }[]> {
    const overloaded = await this.dataSetReviewRepository
      .createQueryBuilder('review')
      .select('review.reviewer_id', 'reviewer_id')
      
      .addSelect('user.email', 'email')
      .addSelect('user.preferred_language', 'preferred_language')
      .addSelect('COUNT(review.id)', 'queue_count')
      .innerJoin('review.reviewer', 'user')
      .where('review.status = :status', { status: 'pending' })
      .andWhere('review.is_expired = :isExpired', { isExpired: false })
      .andWhere('review.expires_at > :now', { now: new Date() })
      .groupBy('review.reviewer_id')
      .addGroupBy('user.email')
      .addGroupBy('user.preferred_language')
      .having('COUNT(review.id) > :limit', { limit })
      .getRawMany();

    return overloaded.map((r) => ({
      reviewer_id: r.reviewer_id,
      email: r.email,
      preferred_language: r.preferred_language,
      queue_count: Number(r.queue_count),
    }));
}
}
