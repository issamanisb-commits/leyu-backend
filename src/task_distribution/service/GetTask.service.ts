import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In, Not } from 'typeorm';
import { ContributorMicroTaskService } from './ContributorMicroTask.service';
import { ContributorMicroTasks } from '../enitities/ContributorMicroTasks.entity';
import { TaskService } from 'src/project/service/Task.service';
import { UserService } from 'src/auth/service/User.service';
import { Task } from 'src/project/entities/Task.entity';
import { MicroTaskService } from 'src/data_set/service/MicroTask.service';
import { ContributorMicroTasksConstantStatus } from 'src/utils/constants/ContributorMicroTasks.constant';
import { MicroTask } from 'src/data_set/entities/MicroTask.entity';
import { UserTaskService } from 'src/project/service/UserTask.service';
import { UserTask } from 'src/project/entities/UserTask.entity';
import { UserTaskStatus } from 'src/utils/constants/Task.constant';
import { paginate, PaginatedResult } from 'src/utils/paginate.util';
import {
  checkIfMicroTasIskRejectedAndTotalAttempts,
  getMicroTaskStatus,
  getTaskStatus,
} from 'src/utils/MicroTask.util';
import {
  ContributorDataSetRto,
  ContributorMicroTaskRto,
  ContributorTaskRto,
  TaskInstructionRto,
  TaskMicroTasksResponse,
} from '../rto/Task.rto';
import { GetContributorTasksDto } from '../dto/Task.dto';
import { DataSetSanitize } from 'src/data_set/sanitize';
import { CacheService } from 'src/cache/CacheService.service';
import { LanguageConstants } from 'src/utils/constants/Language.constant';
import { User } from 'src/auth/entities/User.entity';

type ContributorTaskRtoOverrides = Omit<
  ContributorTaskRto,
  | 'id'
  | 'name'
  | 'description'
  | 'is_public'
  | 'require_contributor_test'
  | 'task_type'
  | 'average_time'
  | 'earning_per_task'
> & {
  // These are the only truly optional ones
  dead_line?: Date;
  estimated_earning: number | null;
};
type TaskWithStatus = Task & {
  totalApprovedMicroTasks: number;
  totalPendingMicroTasks: number;
  totalRejectedMicroTasks: number;
  totalApprovedTestMicroTasks: number;
  totalPendingTestMicroTasks: number;
  totalRejectedTestMicroTasks: number;
}


@Injectable()
/**
 * The TaskDistributionService class is responsible for managing task distribution and redistribution
 * among contributors. It provides methods to initialize task redistribution and to handle events
 * related to contributor creation. The service interacts with various other services such as
 * MicroTaskStatisticsService, ContributorMicroTaskService, TaskService, and UserService to achieve
 * its goals.
 */
export class GetTasksService {
  constructor(
    private readonly contributorMicroTaskService: ContributorMicroTaskService,
    private readonly taskService: TaskService,
    private readonly userService: UserService,
    private readonly microTaskService: MicroTaskService,
    private readonly userTaskService: UserTaskService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Retrieves contributor tasks for a given user with status filtering,
   * caching, and pagination support.
   *
   * Flow:
   * 1. Validate contributor existence.
   * 2. Attempt to fetch contributor tasks from cache.
   * 3. If cached data exists:
   *    - Apply status filtering
   *    - Paginate and return the result
   * 4. If no cache:
   *    - Resolve matching tasks based on contributor profile
   *    - Fetch assigned, member, and test-required tasks
   *    - Calculate task-level statistics (approved, pending, rejected)
   *    - Derive contributor-facing task statuses
   *    - Cache computed tasks
   *    - Apply status filtering and pagination
   *
   * Supported task statuses:
   * - NEW
   * - UNDER_REVIEW
   * - REJECTED
   * - COMPLETED
   * - TEST_UNDER_REVIEW
   * - TEST_REJECTED
   * - RECENT (mapped to review & rejection states)
   *
   * Pagination:
   * - Defaults: page = 1, limit = 10
   * - Performed in-memory after filtering
   *
   * Caching:
   * - Uses cacheService to read/write contributor task summaries
   * - Cache is keyed by contributor user ID
   *
   * @param {string} user_id
   *  Unique identifier of the contributor.
   *
   * @param {GetContributorTasksDto} contributorTaskDto
   *  Data transfer object containing:
   *  - `status` (optional): Task status filter (`ALL`, `RECENT`, or specific status)
   *  - `page` (optional): Page number for pagination
   *  - `limit` (optional): Maximum number of tasks per page
   *
   * @returns {Promise<PaginatedResult<ContributorTaskRto>>}
   *  Paginated contributor task list including:
   *  - `result`: Array of contributor task summaries
   *  - `total`: Total number of matched tasks
   *  - `totalPages`: Total available pages
   *  - `page`: Current page number
   *  - `limit`: Items per page
   *
   * @throws {NotFoundException}
   *  Thrown when the contributor user does not exist.
   */
  // ─── Helper: Pagination ───────────────────────────────────────────────────────

  private paginateTasks<T>(
    tasks: T[],
    page: number,
    limit: number,
    total?: number,
  ): PaginatedResult<T> {
    const skip = (page - 1) * limit;
    const lastIndex = Math.min(skip + limit, tasks.length);
    return paginate(
      tasks.slice(skip, lastIndex),
      total ?? tasks.length,
      page,
      limit,
    );
  }

  // ─── Helper: Status filter ────────────────────────────────────────────────────

  private filterByStatus<T extends { status: string }>(
    tasks: T[],
    status: string,
  ): T[] {
    if (!status || status === 'ALL') return tasks;

    const RECENT_STATUSES = [
      'REJECTED',
      'TEST_REJECTED',
      'UNDER_REVIEW',
      'TEST_UNDER_REVIEW',
    ];
    return status === 'RECENT'
      ? tasks.filter((t) => RECENT_STATUSES.includes(t.status))
      : tasks.filter((t) => t.status === status);
  }

  // ─── Helper: Base RTO shape ───────────────────────────────────────────────────

  private buildBaseRto(
  task: TaskWithStatus,
  overrides: ContributorTaskRtoOverrides,
): ContributorTaskRto {
  return ContributorTaskRto.fromSelf({
    id: task.id,
    name: task.name,
    description: task.description,
    is_public: task.is_public,
    require_contributor_test: task.require_contributor_test,
    is_closed: task.is_closed,
    is_archived: task.is_archived,
    distribution_started: task.distribution_started,
    task_type: task.taskType?.task_type,
    average_time: task.taskRequirement?.appriximate_time_per_batch ?? null,
    earning_per_task: task.payment?.contributor_credit_per_microtask ?? null,
    // overrides must supply the rest (status, counts, dead_line, estimated_earning)
    ...overrides,
  });
}

  private estimatedEarning(task: TaskWithStatus, unitCount: number): number {
    return task.payment.contributor_credit_per_microtask * unitCount;
  }

  // ─── Helper: Build RTO for assigned tasks (have ContributorMicroTask) ─────────

  private buildAssignedTaskRto(
    task: TaskWithStatus,
    assignment: ContributorMicroTasks,
  ): ContributorTaskRto | null {
    const earning = this.estimatedEarning(task, assignment.total_micro_tasks);
    // ── COMPLETED assignment ──────────────────────────────────────────────────
    if (assignment.status === ContributorMicroTasksConstantStatus.COMPLETED) {
      const base = {
        done_count: task.totalApprovedMicroTasks+task.totalPendingMicroTasks+task.totalRejectedMicroTasks,
        total_count: task.totalApprovedMicroTasks+task.totalPendingMicroTasks+task.totalRejectedMicroTasks,
        dead_line: assignment.dead_line,
        rejected_count: task.totalRejectedMicroTasks,
        pending_count: task.totalPendingMicroTasks,
        approved_count: task.totalApprovedMicroTasks,
        estimated_earning: earning,
      };

      if (task.totalRejectedMicroTasks > 0) {
        return this.buildBaseRto(task, { ...base, status: 'REJECTED' });
      }
      if (task.totalPendingMicroTasks > 0) {
        return this.buildBaseRto(task, { ...base, status: 'UNDER_REVIEW' });
      }
      return this.buildBaseRto(task, {
        ...base,
        status: 'COMPLETED',
        rejected_count: 0,
        pending_count: 0,
      });
    }
    let totalDone=task.totalRejectedMicroTasks + task.totalPendingMicroTasks + task.totalApprovedMicroTasks;
    // ── IN_PROGRESS assignment ────────────────────────────────────────────────
    const microTasksIds=assignment.micro_task_ids;
    const nextBatchIds=microTasksIds.slice(assignment.current_batch, Math.min(microTasksIds.length, assignment.current_batch+assignment.batch));
    const undone = nextBatchIds.length;
    let total=totalDone+undone;
    if (assignment.status === ContributorMicroTasksConstantStatus.IN_PROGRESS) {
      // Rejected tasks take priority
      if (task.totalRejectedMicroTasks > 0) {
        // const totalDone = Math.min(
        //   task.totalRejectedMicroTasks +
        //     task.totalPendingMicroTasks +
        //     task.totalApprovedMicroTasks,
        //   assignment.total_micro_tasks,
        // );
        return this.buildBaseRto(task, {
          status: 'REJECTED',
          done_count: totalDone,
          total_count: total,
          dead_line: assignment.dead_line,
          rejected_count: task.totalRejectedMicroTasks,
          pending_count: task.totalPendingMicroTasks,
          approved_count: task.totalApprovedMicroTasks,
          estimated_earning: earning,
        });
      }
      
      return this.buildBaseRto(task, {
        status: 'UNDER_REVIEW',
        done_count: totalDone,
        total_count: total,  //assignment.micro_task_ids.length,
        dead_line: assignment.dead_line,
        rejected_count: task.totalRejectedMicroTasks,
        pending_count: task.totalPendingMicroTasks,
        approved_count: task.totalApprovedMicroTasks,
        estimated_earning: earning,
      });
    }

    // ── NEW assignment ────────────────────────────────────────────────────────
    if (assignment.status === ContributorMicroTasksConstantStatus.NEW) {
      if (task.totalRejectedMicroTasks > 0) {
        // const totalDone = Math.min(
        //   task.totalRejectedMicroTasks +
        //     task.totalPendingMicroTasks +
        //     task.totalApprovedMicroTasks,
        //   assignment.total_micro_tasks,
        // );
        return this.buildBaseRto(task, {
          status: 'REJECTED',
          done_count: totalDone,
          total_count: total,
          dead_line: assignment.dead_line,
          rejected_count: task.totalRejectedMicroTasks,
          pending_count: task.totalPendingMicroTasks,
          approved_count: task.totalApprovedMicroTasks,
          estimated_earning: earning,
        });
      }

      // totalDone =
      //   task.totalApprovedMicroTasks +
      //   task.totalPendingMicroTasks +
      //   task.totalRejectedMicroTasks +
      //   task.totalApprovedTestMicroTasks +
      //   task.totalPendingTestMicroTasks +
      //   task.totalRejectedTestMicroTasks;

      if (totalDone > 0) {
        const maxBatch = Math.min(
          assignment.batch,
          assignment.micro_task_ids.length,
        );
        return this.buildBaseRto(task, {
          status: 'UNDER_REVIEW',
          done_count: totalDone,
          total_count:total,
          dead_line: assignment.dead_line,
          rejected_count: task.totalRejectedMicroTasks,
          pending_count: task.totalPendingMicroTasks,
          approved_count: task.totalApprovedMicroTasks,
          estimated_earning: earning,
        });
      }

      return this.buildBaseRto(task, {
        status: totalDone>0?'UNDER_REVIEW':'NEW',
        done_count: totalDone,
        total_count:total,
        dead_line: assignment.dead_line,
        estimated_earning: earning,
        rejected_count: task.totalRejectedMicroTasks,
        approved_count: task.totalApprovedMicroTasks,
        pending_count: task.totalPendingMicroTasks,
      });
    }

    return null;
  }

  // ─── Helper: Build RTO for member tasks (no assignment, has UserTask) ─────────

  private buildMemberTaskRto(
    task: TaskWithStatus,
    memberStatus: UserTask,
  ): ContributorTaskRto | null {
    const earning = this.estimatedEarning(
      task,
      task.taskRequirement.max_micro_task_per_contributor,
    );

    if (memberStatus.status === 'Active') {
      if (
        task.totalApprovedTestMicroTasks > 0 &&
        task.totalApprovedMicroTasks === 0
      ) {
        return this.buildBaseRto(task, {
          status: 'TEST_UNDER_REVIEW',
          done_count: task.totalApprovedTestMicroTasks,
          total_count: task.totalApprovedTestMicroTasks,
          approved_count: task.totalApprovedTestMicroTasks,
          estimated_earning: earning,
          rejected_count: 0,
          pending_count: 0
        });
      }
      else if (task.totalRejectedMicroTasks>0){
        return this.buildBaseRto(task, {
          status:'REJECTED',
          done_count: task.totalApprovedMicroTasks + task.totalRejectedMicroTasks + task.totalPendingMicroTasks,
          total_count: task.totalApprovedMicroTasks + task.totalRejectedMicroTasks + task.totalPendingMicroTasks,
          dead_line: undefined,
          approved_count: task.totalApprovedMicroTasks,
          estimated_earning: earning,
          rejected_count: task.totalRejectedMicroTasks,
          pending_count: task.totalPendingMicroTasks
        });
      }
      else if ((task.totalApprovedMicroTasks + task.totalPendingMicroTasks + task.totalRejectedMicroTasks) > 0) {
        return this.buildBaseRto(task, {
          status: 'COMPLETED',
          done_count: task.totalApprovedMicroTasks + task.totalRejectedMicroTasks + task.totalPendingMicroTasks,
          total_count: task.totalApprovedMicroTasks + task.totalRejectedMicroTasks + task.totalPendingMicroTasks,
          dead_line: undefined,
          approved_count: task.totalApprovedMicroTasks,
          estimated_earning: earning,
          rejected_count: task.totalRejectedMicroTasks,
          pending_count: task.totalPendingMicroTasks
        });
      }
      return null;
    }

    if (memberStatus.status === 'Rejected') {
      const testTotal =
        task.totalApprovedTestMicroTasks +
        task.totalPendingTestMicroTasks +
        task.totalRejectedTestMicroTasks;
      return this.buildBaseRto(task, {
        status: 'TEST_REJECTED',
        done_count: testTotal,
        total_count: testTotal,
        rejected_count: task.totalRejectedTestMicroTasks,
        pending_count: task.totalPendingTestMicroTasks,
        approved_count: task.totalApprovedTestMicroTasks,
        estimated_earning: earning,
      });
    }

    if (memberStatus.status === 'Pending') {
      const totalDone =
        task.totalApprovedTestMicroTasks +
        task.totalPendingTestMicroTasks +
        task.totalRejectedTestMicroTasks;
      const totalTestMicroTasks = task.microTasks.filter(
        (m) => m.is_test,
      ).length;

      const status =
        task.totalRejectedTestMicroTasks > 0
          ? 'REJECTED'
          : totalDone > 0
            ? 'UNDER_REVIEW'
            : 'NEW';

      return this.buildBaseRto(task, {
        status,
        done_count: totalDone,
        total_count: totalDone > 0 ? totalDone : totalTestMicroTasks,
        rejected_count: task.totalRejectedTestMicroTasks,
        pending_count: task.totalPendingTestMicroTasks,
        approved_count: task.totalApprovedTestMicroTasks,
        estimated_earning: earning,
      });
    }

    return null;
  }

  // ─── Helper: Build RTO for brand-new tasks (no assignment, no UserTask) ───────

  private buildNewTestTaskRto(task: TaskWithStatus): ContributorTaskRto | null {
    if (!task.require_contributor_test) return null;

    const totalTestMicroTasks = task.microTasks.filter((m) => m.is_test).length;
    return this.buildBaseRto(task, {
      status: 'NEW',
      done_count: 0,
      total_count: totalTestMicroTasks,
      estimated_earning: this.estimatedEarning(
        task,
        task.taskRequirement.max_micro_task_per_contributor
      ),
      rejected_count: 0,
      approved_count: 0,
      pending_count: 0
    });
  }

  // ─── Helper: Build RTO for a single task (dispatcher) ────────────────────────

  private buildTaskRto(
    task: TaskWithStatus,
    assignment: ContributorMicroTasks | undefined,
    memberStatus: UserTask | undefined,
  ): ContributorTaskRto | null {
    const isBlockedMember =
      memberStatus?.status === 'InActive' || memberStatus?.status === 'Flagged';

    if (assignment) {
      if (isBlockedMember) return null;
      return this.buildAssignedTaskRto(task, assignment);
    }

    if (memberStatus) {
      return this.buildMemberTaskRto(task, memberStatus);
    }

    return this.buildNewTestTaskRto(task);
  }

  // ─── Helper: Fetch all raw data needed ───────────────────────────────────────

  private async fetchContributorData(user_id: string, user: User) {
    const matchedTasks = await this.taskService.findMatchingTasks({
      dialect_id: user.dialect_id,
      language_id: user.language_id,
      birth_date: user.birth_date,
      gender: user.gender,
    });

    const memberTasks = await this.userTaskService.findAll({
      where: { user_id },
      order: { created_date: 'DESC' },
      relations: { task: true },
    });

    const contributorAssignedTasks: ContributorMicroTasks[] =
      await this.contributorMicroTaskService.findAllUnExpiredAssignments({
        where: { contributor_id: user_id },
        order: { created_date: 'DESC' },
      });

    return { matchedTasks, memberTasks, contributorAssignedTasks };
  }

  // ─── Helper: Fetch and filter userTasks from DB ───────────────────────────────

  private async fetchUserTasks(
    user_id: string,
    newAssignedTaskIds: string[],
    testRequireMatchingTaskIds: string[],
    memberTaskIds: string[],
  ) {
    const userTasks = await this.taskService.findAll({
      where: [
        {
          is_closed: false,
          is_archived: false,
          microTasks: { dataSets: { contributor_id: user_id } },
        },
        {
          is_closed: false,
          is_archived: false,
          id: In([
            ...newAssignedTaskIds,
            ...testRequireMatchingTaskIds,
            ...memberTaskIds,
          ]),
        },
      ],
      order: { created_date: 'DESC' },
      relations: {
        taskType: true,
        taskRequirement: true,
        taskInstruction: true,
        microTasks: { dataSets: true },
        payment: true,
      },
    });

    // Scope dataSets to this contributor only
    userTasks.forEach((task) => {
      task.microTasks.forEach((microTask) => {
        microTask.dataSets = microTask.dataSets.filter(
          (ds) => ds.contributor_id === user_id,
        );
      });
    });

    return userTasks;
  }

  // ─── Main method ──────────────────────────────────────────────────────────────

  async getContributorTasks(
    user_id: string,
    contributorTaskDto: GetContributorTasksDto,
  ): Promise<PaginatedResult<ContributorTaskRto>> {
    const user = await this.userService.findOne({ where: { id: user_id } });
    if (!user) throw new NotFoundException(`User with id ${user_id} not found`);

    const limit = contributorTaskDto.limit || 10;
    const page = contributorTaskDto.page || 1;

    // ── Serve from cache if available ──────────────────────────────────────────
    const cached: ContributorTaskRto[] =
      await this.cacheService.getContributorTasks(user_id);
    if (cached.length > 0) {
      const filtered = this.filterByStatus(cached, contributorTaskDto.status);
      return this.paginateTasks(filtered, page, limit, cached.length);
    }

    // ── Fetch raw data ─────────────────────────────────────────────────────────
    const { matchedTasks, memberTasks, contributorAssignedTasks } =
      await this.fetchContributorData(user_id, user);

    const memberTaskIds = memberTasks.map((m) => m.task.id);

    const newAssignedTaskIds = contributorAssignedTasks
      .filter((t) => t.status === ContributorMicroTasksConstantStatus.NEW)
      .map((t) => t.task_id);

    const testRequireMatchingTaskIds = matchedTasks
      .filter((t) => t.task.require_contributor_test)
      .map((t) => t.task.id);

    const userTasks = await this.fetchUserTasks(
      user_id,
      newAssignedTaskIds,
      testRequireMatchingTaskIds,
      memberTaskIds,
    );

    // ── Build RTOs ─────────────────────────────────────────────────────────────
    const taskStatuses = getTaskStatus(userTasks);

    const contributorRecentTasks: ContributorTaskRto[] = taskStatuses.reduce(
      (acc, task) => {
        const assignment = contributorAssignedTasks.find(
          (a) => a.task_id === task.id,
        );
        const memberStatus = memberTasks.find((m) => m.task_id === task.id);
        const rto = this.buildTaskRto(task, assignment, memberStatus);
        if (rto) acc.push(rto);
        return acc;
      },
      [] as ContributorTaskRto[],
    );

    // ── Write to cache ─────────────────────────────────────────────────────────
    if (contributorRecentTasks.length > 0) {
      await this.cacheService.writeContributorTask(
        user_id,
        contributorRecentTasks,
      );
    }

    // ── Filter & paginate ──────────────────────────────────────────────────────
    const filtered = this.filterByStatus(
      contributorRecentTasks,
      contributorTaskDto.status,
    );
    return this.paginateTasks(
      filtered,
      page,
      limit,
      contributorRecentTasks.length,
    );
  }
  // async getUserRecentTasksV2(
  //   user_id: string,
  //   paginateDto: PaginationDto,
  // ): Promise<PaginatedResult<ContributorRecentTaskRto>> {
  //   const userParticipatedTasks = await this.taskService.findAll({
  //     where: {
  //       microTasks: {
  //         dataSets: {
  //           contributor_id: user_id,
  //         },
  //       },
  //     },
  //     order: {
  //       created_date: 'DESC',
  //     },
  //     relations: {
  //       taskType: true,
  //       taskRequirement: true,
  //       taskInstruction: true,
  //       microTasks: { dataSets: true },
  //     },
  //   });
  //   const memberTasks = await this.userTaskService.findAll({
  //     where: {
  //       user_id: user_id,
  //     },
  //     order: {
  //       created_date: 'DESC',
  //     },
  //   });
  //   const contributorAssignedTasks: ContributorMicroTasks[] =
  //     await this.contributorMicroTaskService.findAll({
  //       where: {
  //         contributor_id: user_id,
  //       },
  //       order: {
  //         created_date: 'DESC',
  //       },
  //     });
  //   const taskStatus = getTaskStatus(userParticipatedTasks);
  //   let contributorRecentTasks: ContributorRecentTaskRto[] = [];

  //   for (const task of taskStatus) {
  //     const contributorAssignedTask = contributorAssignedTasks.find(
  //       (item) => item.task_id == task.id,
  //     );
  //     const memberStatus: UserTask | undefined = memberTasks.find(
  //       (item) => item.task_id == task.id,
  //     );
  //     if (contributorAssignedTask) {
  //       if (
  //         contributorAssignedTask.status ==
  //         ContributorMicroTasksConstantStatus.COMPLETED
  //       ) {
  //         if (task.totalRejectedMicroTasks > 0) {
  //           if (task.hasPendingOrUndoneMicroTasks) {
  //             contributorRecentTasks.push({
  //               ...task,
  //               status: 'REJECTED',
  //               done_count: contributorAssignedTask.total_micro_tasks,
  //               total_count: contributorAssignedTask.total_micro_tasks,
  //               dead_line: contributorAssignedTask.dead_line,
  //               rejected_count: task.totalRejectedMicroTasks,
  //               pending_count: task.totalPendingMicroTasks,
  //               approved_count: task.totalApprovedMicroTasks,
  //               task_type: task.taskType.task_type,
  //               average_time: task.taskRequirement.appriximate_time_per_batch,
  //             });
  //           }
  //         } else if (task.totalPendingMicroTasks > 0) {
  //           contributorRecentTasks.push({
  //             ...task,
  //             status: 'UNDER_REVIEW',
  //             done_count: contributorAssignedTask.total_micro_tasks,
  //             total_count: contributorAssignedTask.total_micro_tasks,
  //             dead_line: contributorAssignedTask.dead_line,
  //             rejected_count: task.totalRejectedMicroTasks,
  //             pending_count: task.totalPendingMicroTasks,
  //             approved_count: task.totalApprovedMicroTasks,
  //             task_type: task.taskType?.task_type,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //           });
  //         }
  //       } else {
  //         const totalDoneCount = Math.min(
  //           task.totalRejectedMicroTasks +
  //             task.totalPendingMicroTasks +
  //             task.totalApprovedMicroTasks,
  //           contributorAssignedTask.total_micro_tasks,
  //         );
  //         if (task.totalRejectedMicroTasks > 0) {
  //           contributorRecentTasks.push({
  //             ...task,
  //             status:
  //               task.totalRejectedMicroTasks > 0 ? 'REJECTED' : 'UNDER_REVIEW',
  //             done_count: totalDoneCount,
  //             total_count: contributorAssignedTask.total_micro_tasks,
  //             dead_line: contributorAssignedTask.dead_line,
  //             rejected_count: task.totalRejectedMicroTasks,
  //             pending_count: task.totalPendingMicroTasks,
  //             approved_count: task.totalApprovedMicroTasks,
  //             task_type: task.taskType.task_type,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //           });
  //         } else {
  //           // If the assignment is new or inprogress
  //           // if new
  //           if (
  //             contributorAssignedTask.status ==
  //             ContributorMicroTasksConstantStatus.IN_PROGRESS
  //           ) {
  //             const done_count = contributorAssignedTask.current_batch;
  //             const total_count = contributorAssignedTask.micro_task_ids.length;
  //             const dead_line = contributorAssignedTask.dead_line;
  //             const rejected_count = task.totalRejectedMicroTasks;
  //             const pending_count = task.totalPendingMicroTasks;
  //             const approved_count = task.totalApprovedMicroTasks;

  //             contributorRecentTasks.push({
  //               ...task,
  //               status: 'UNDER_REVIEW',
  //               done_count,
  //               total_count,
  //               dead_line,
  //               rejected_count,
  //               pending_count,
  //               approved_count,
  //               task_type: task.taskType.task_type,
  //               average_time: task.taskRequirement.appriximate_time_per_batch,
  //             });
  //           }
  //           const totalDone =
  //             task.totalApprovedMicroTasks +
  //             task.totalPendingMicroTasks +
  //             task.totalRejectedMicroTasks +
  //             task.totalApprovedTestMicroTasks +
  //             task.totalPendingTestMicroTasks +
  //             task.totalRejectedTestMicroTasks;
  //           // console.log("Task Name ",task.name + " Status ",contributorAssignedTask.status)
  //           // console.log("Member Status",memberStatus?.status)
  //           // console.log("Total Done ",totalDone)
  //           if (
  //             contributorAssignedTask.status ==
  //               ContributorMicroTasksConstantStatus.NEW &&
  //             totalDone > 0
  //           ) {
  //             const done_count = 0;
  //             const totalAssigned =
  //               contributorAssignedTask.micro_task_ids.length;
  //             const maxBatch = Math.min(
  //               contributorAssignedTask.batch,
  //               contributorAssignedTask.micro_task_ids.length,
  //             ); //contributorAssignedTask.batch
  //             const total_count = contributorAssignedTask.micro_task_ids.slice(
  //               0,
  //               maxBatch,
  //             ).length;
  //             const dead_line = contributorAssignedTask.dead_line;
  //             const rejected_count = task.totalRejectedMicroTasks;
  //             const pending_count = task.totalPendingMicroTasks;
  //             const approved_count = task.totalApprovedMicroTasks;

  //             contributorRecentTasks.push({
  //               ...task,
  //               status: 'UNDER_REVIEW',
  //               done_count,
  //               total_count,
  //               dead_line,
  //               rejected_count,
  //               pending_count,
  //               approved_count,
  //               task_type: task.taskType.task_type,
  //               average_time: task.taskRequirement.appriximate_time_per_batch,
  //             });
  //           }
  //         }
  //       }
  //     } else {
  //       if (memberStatus) {
  //         if (memberStatus.status == 'Active') {
  //           contributorRecentTasks.push({
  //             ...task,
  //             status: 'TEST_UNDER_REVIEW',
  //             done_count: task.totalApprovedTestMicroTasks,
  //             total_count: task.totalApprovedTestMicroTasks,
  //             // dead_line: '',
  //             rejected_count: 0,
  //             pending_count: 0,
  //             approved_count: task.totalApprovedTestMicroTasks,
  //             task_type: task.taskType.task_type,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //           });
  //         } else if (memberStatus.status == 'Rejected') {
  //           contributorRecentTasks.push({
  //             ...task,
  //             status: 'TEST_REJECTED',
  //             done_count:
  //               task.totalApprovedTestMicroTasks +
  //               task.totalPendingTestMicroTasks +
  //               task.totalRejectedTestMicroTasks,
  //             total_count:
  //               task.totalApprovedTestMicroTasks +
  //               task.totalPendingTestMicroTasks +
  //               task.totalRejectedTestMicroTasks,
  //             // dead_line: '',
  //             rejected_count: task.totalRejectedTestMicroTasks,
  //             pending_count: task.totalPendingTestMicroTasks,
  //             approved_count: task.totalApprovedTestMicroTasks,
  //             task_type: task.taskType?.task_type,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //           });
  //         } else if (memberStatus.status == 'Pending') {
  //           contributorRecentTasks.push({
  //             ...task,
  //             status:
  //               task.totalRejectedTestMicroTasks > 0
  //                 ? 'REJECTED'
  //                 : 'TEST_UNDER_REVIEW',
  //             done_count:
  //               task.totalApprovedTestMicroTasks +
  //               task.totalPendingTestMicroTasks +
  //               task.totalRejectedTestMicroTasks,
  //             total_count:
  //               task.totalApprovedTestMicroTasks +
  //               task.totalPendingTestMicroTasks +
  //               task.totalRejectedTestMicroTasks,
  //             rejected_count: task.totalRejectedTestMicroTasks,
  //             pending_count: task.totalPendingTestMicroTasks,
  //             approved_count: task.totalApprovedTestMicroTasks,
  //             task_type: task.taskType.task_type,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //           });
  //         }
  //       }
  //     }
  //   }
  //   const limit = paginateDto.limit || 10;
  //   const page = paginateDto.page || 1;
  //   // const take=
  //   const skip = (page - 1) * limit;
  //   const lastIndex = Math.min(skip + limit, contributorRecentTasks.length);
  //   const paginatedContributorTasks = contributorRecentTasks.slice(
  //     skip,
  //     lastIndex,
  //   );
  //   return {
  //     result: paginatedContributorTasks,
  //     total: contributorRecentTasks.length,
  //     totalPages: Math.ceil(contributorRecentTasks.length / limit),
  //     page: page,
  //     limit: limit,
  //   };
  // }

  /**
   * Retrieves micro-tasks for a specific contributor and task.
   *
   * Flow:
   * 1. Attempt to load contributor task micro-tasks from cache.
   * 2. If cached data exists, return immediately.
   * 3. Fetch task with all required relations.
   * 4. Validate task existence.
   * 5. Fetch contributor's task membership (`UserTask`).
   * 6. Route handling logic based on contributor task status:
   *    - `REJECTED` → handleRejected
   *    - `ACTIVE` → handleActive
   *    - `PENDING` → handlePending
   *    - Other / Inactive → handlePendingOrInActive
   * 7. Cache the computed response when micro-tasks exist.
   *
   * Caching:
   * - Read: `cacheService.getContributorTaskMicroTasks(taskId, userId)`
   * - Write: `cacheService.writeContributorTaskMicroTasks(userId, taskId, response)`
   *
   * @param {string} userId
   *  Unique identifier of the contributor.
   *
   * @param {string} taskId
   *  Unique identifier of the task.
   *
   * @returns {Promise<TaskMicroTasksResponse>}
   *  Object containing:
   *  - Task metadata
   *  - Contributor-specific micro-tasks
   *  - Assignment status and limits
   *
   * @throws {BadRequestException}
   *  Thrown when the task does not exist.
   */
  async getContributorTaskMicroTasks(
    userId: string,
    taskId: string,
  ): Promise<TaskMicroTasksResponse> {
    const cacheData = await this.cacheService.getContributorTaskMicroTasks(
      taskId,
      userId,
    );
    if (cacheData) {
      console.log('=== FROM CACHE ===');
      return cacheData;
    }
    const task = await this.taskService.findOne({
      where: { id: taskId },
      relations: {
        taskRequirement: true,
        taskType: true,
        microTasks: true,
        taskInstruction: true,
        payment: true,
      },
    });

    if (!task) throw new BadRequestException('Task not found');

    const userTask = await this.userTaskService.findOne({
      where: { user_id: userId, task_id: taskId },
      relations: { user: true },
    });
    if (!userTask) return this.handleNewUser(task, userId);
    let response: TaskMicroTasksResponse;
    switch (userTask.status) {
      case UserTaskStatus.REJECTED:
        response = await this.handleRejected(
          task,
          userId,
          userTask.user.preferred_language,
        );
        break;
      case UserTaskStatus.ACTIVE:
        console.log('Preferred lang', userTask.user.preferred_language);
        response = await this.handleActive(
          task,
          userId,
          userTask.user.preferred_language,
        );
        break;
      case UserTaskStatus.PENDING:
        response = await this.handlePending(
          task,
          userId,
          userTask.user.preferred_language,
        );
        break;
      default:
        response = await this.handlePendingOrInActive(
          task,
          userId,
          userTask.user.preferred_language,
        );
        break;
    }
    if (response.contributorMicroTask.length > 0) {
      await this.cacheService.writeContributorTaskMicroTasks(
        userId,
        task.id,
        response,
      );
    }
    return response;
  }

  /**
   * Handles a contributor's rejected task micro-tasks.
   *
   * @param task - The task.
   * @param userId - Unique identifier of the contributor.
   *
   * @returns {Promise<TaskMicrotasksResponse>}
   *  Object containing:
   *  - Task metadata
   *  - Contributor-specific micro-tasks
   *  - Assignment status and limits
   *
   */
  private async handleRejected(
    task: Task,
    userId: string,
    userPreferredLanguage: LanguageConstants = LanguageConstants.ENGLISH,
  ): Promise<TaskMicroTasksResponse> {
    // contributor submitted microtasks
    const contributorSubmissions = await this.microTaskService.findAll({
      where: {
        task_id: task.id,
        dataSets: { contributor_id: userId },
      },
      relations: {
        dataSets: {
          rejectionReasons: { rejectionType: true },
          dataSetReviews: true,
        },
      },
    });
    let contributorMicroTasks: ContributorMicroTaskRto[] = [];
    for (const microTask of contributorSubmissions) {
      const status = getMicroTaskStatus(
        microTask,
        task.taskRequirement.max_retry_per_task + 1,
      );
      contributorMicroTasks.push({
        ...microTask,
        acceptance_status: status.acceptanceStatus,
        current_retry: status.totalAttempts,
        allowed_retry: task.taskRequirement.max_retry_per_task + 1,
        can_retry: status.canRetry,
        dataSet: status.dataSet
          ? ContributorDataSetRto.from(status.dataSet, userPreferredLanguage)
          : undefined,
      });
    }

    contributorMicroTasks = contributorMicroTasks
      .map((microTask) => {
        return ContributorMicroTaskRto.fromSelf(microTask);
      })
      .sort((a, b) => {
        if (a.can_retry === b.can_retry) return 0;
        return a.can_retry ? -1 : 1; // true first
      });
    return TaskMicroTasksResponse.from({
      ...task,
      has_passed: 'REJECTED',
      batch: 0,
      is_test: true,
      contributorMicroTask: contributorMicroTasks,
      taskInstruction: task.taskInstruction
        ? TaskInstructionRto.from(task.taskInstruction)
        : undefined,
      minimum_seconds: task.taskRequirement.minimum_seconds,
      maximum_seconds: task.taskRequirement.maximum_seconds,
      minimum_characters_length: task.taskRequirement.minimum_characters_length,
      maximum_characters_length: task.taskRequirement.maximum_characters_length,
      estimated_earning:
        task.payment.contributor_credit_per_microtask *
        task.taskRequirement.max_micro_task_per_contributor,
      earning_per_task: task.payment.contributor_credit_per_microtask,
      average_time: task.taskRequirement.appriximate_time_per_batch,
      deadline: null,
    });
  }

  /**
   * Handles micro-task retrieval and batching logic for an ACTIVE contributor task.
   *
   * This method builds the contributor-facing micro-task list by:
   * - Resolving assigned contributor micro-task metadata
   * - Merging previously submitted micro-tasks with newly assigned ones
   * - Calculating retry eligibility and acceptance status per micro-task
   * - Applying batch limits and task requirements
   *
   * Behavior:
   * 1. Fetch contributor assignment metadata for the task.
   * 2. Fetch all contributor submissions for the task.
   * 3. If no contributor assignment exists:
   *    - Treat task as already approved
   *    - Return all submitted micro-tasks with retry metadata
   * 4. If assignment exists:
   *    - Determine current and next batch boundaries
   *    - Split micro-tasks into:
   *      - Previously completed micro-tasks
   *      - Newly assigned micro-tasks
   *    - Calculate retry status per micro-task
   *    - Merge, sort, and return contributor-visible micro-tasks
   *
   * Retry Logic:
   * - Retry eligibility is determined using:
   *   - `max_retry_per_task +1`
   *   - Contributor submission history
   * - Micro-tasks that can be retried are prioritized in ordering
   *
   * Batch Logic:
   * - `current_batch` represents already completed micro-tasks
   * - `batch` size controls how many new micro-tasks are unlocked
   * - Total batch size is capped by `total_micro_tasks`
   *
   * Sorting:
   * - Micro-tasks are sorted with retryable tasks first
   *
   * @param {Task} task
   *  Fully hydrated task entity including:
   *  - task requirements
   *  - instructions
   *  - payment
   *
   * @param {string} userId
   *  Unique identifier of the contributor.
   *
   * @returns {Promise<TaskMicroTasksResponse>}
   *  Response containing:
   *  - Contributor micro-tasks (completed + newly assigned)
   *  - Retry metadata per micro-task
   *  - Batch state and deadline
   *  - Task requirements and earning information
   */
  private async handleActive(
    task: Task,
    userId: string,
    userPreferredLanguage: LanguageConstants = LanguageConstants.ENGLISH,
  ): Promise<TaskMicroTasksResponse> {
    console.log('=== handleActive ===', userPreferredLanguage);
    const contributorMicroTasksAssignedInComplete =
      await this.contributorMicroTaskService.findOne({
        where: {
          contributor_id: userId,
          task_id: task.id,
          status: In([
            ContributorMicroTasksConstantStatus.IN_PROGRESS,
            ContributorMicroTasksConstantStatus.NEW,
          ]),
        },
      });

    console.log(
      'Contributor Assignment ',
      contributorMicroTasksAssignedInComplete,
    );
    const contributorSubmissions: MicroTask[] =
      await this.microTaskService.findAll({
        where: {
          task_id: task.id,
          dataSets: {
            contributor_id: userId,
          },
        },
        relations: {
          dataSets: {
            rejectionReasons: { rejectionType: true },
            dataSetReviews: true,
          },
        },
      });
    if (!contributorMicroTasksAssignedInComplete) {
      const result: ContributorMicroTaskRto[] = [];
      let nonTestSubmissions = contributorSubmissions.filter(
        (mt) => !mt.is_test,
      );
      for (const mt of nonTestSubmissions) {
        const status = getMicroTaskStatus(
          mt,
          task.taskRequirement.max_retry_per_task + 1,
        );
        result.push({
          ...mt,
          acceptance_status: status.acceptanceStatus,
          current_retry: status.totalAttempts,
          allowed_retry: task.taskRequirement.max_retry_per_task + 1,
          can_retry: status.canRetry,
          dataSet: status.dataSet
            ? ContributorDataSetRto.from(status.dataSet, userPreferredLanguage)
            : undefined,
        });
      }
      return TaskMicroTasksResponse.from({
        ...task,
        has_passed: 'APPROVED',
        batch: 0,
        is_test: false,
        contributorMicroTask: result.sort((a, b) => {
          if (a.can_retry === b.can_retry) return 0;
          return a.can_retry ? -1 : 1; // true first
        }),
        taskInstruction: task.taskInstruction,
        minimum_seconds: task.taskRequirement.minimum_seconds,
        maximum_seconds: task.taskRequirement.maximum_seconds,
        minimum_characters_length:
          task.taskRequirement.minimum_characters_length,
        maximum_characters_length:
          task.taskRequirement.maximum_characters_length,
        estimated_earning:
          task.payment.contributor_credit_per_microtask *
          task.taskRequirement.max_micro_task_per_contributor,
        earning_per_task: task.payment.contributor_credit_per_microtask,
        average_time: task.taskRequirement.appriximate_time_per_batch,
        deadline: null,
      });
    }
    const nextBatch = Math.min(
      contributorMicroTasksAssignedInComplete.current_batch +
        contributorMicroTasksAssignedInComplete.batch,
      contributorMicroTasksAssignedInComplete.total_micro_tasks,
    );
    const current_batch = contributorMicroTasksAssignedInComplete.current_batch;
    // const prevMicroTasksIds =
    //   contributorMicroTasksAssignedInComplete.micro_task_ids.slice(
    //     0,
    //     current_batch,
    //   );
    const nextMicroTasksIds =
      contributorMicroTasksAssignedInComplete.micro_task_ids.slice(
        current_batch,
        nextBatch,
      );
    const prevDoneMicroTasks: any[] = contributorSubmissions.filter((mt) =>
      mt.is_test==false
    );
    let nextAssignedMicroTasks: any[] = [];
    if (nextMicroTasksIds.length > 0) {
      nextAssignedMicroTasks = await this.microTaskService.findAll({
        where: {
          id: In(nextMicroTasksIds),
        },
      });
    }
    const result: ContributorMicroTaskRto[] = [];
    for (const microTask of prevDoneMicroTasks) {
      const status = checkIfMicroTasIskRejectedAndTotalAttempts(
        microTask,
        task.taskRequirement.max_retry_per_task + 1,
      );
      result.push(
        ContributorMicroTaskRto.from(
          {
            ...microTask,
            dataSets: status.dataSet ? [status.dataSet] : undefined,
          },
          {
            acceptance_status: status.acceptanceStatus,
            current_retry: status.totalAttempts,
            allowed_retry: task.taskRequirement.max_retry_per_task + 1,
            can_retry: status.canRetry,
          },
          userPreferredLanguage,
        ),
      );
    }
    // cons
    for (const microTask of nextAssignedMicroTasks) {
      result.push(
        ContributorMicroTaskRto.from(
          {
            ...microTask,
            dataSets: [],
          },
          {
            current_retry: 0,
            allowed_retry: task.taskRequirement.max_retry_per_task + 1,
            acceptance_status: 'NOT_STARTED',
            can_retry: true,
          },
          userPreferredLanguage,
        ),
      );
    }

    return TaskMicroTasksResponse.from({
      ...task,
      has_passed: 'APPROVED',
      is_test: false,
      contributorMicroTask: result.sort((a, b) => {
        if (a.can_retry === b.can_retry) return 0;
        return a.can_retry ? -1 : 1; // true first
      }),
      batch: current_batch,
      taskInstruction: task.taskInstruction,
      minimum_seconds: task.taskRequirement.minimum_seconds,
      maximum_seconds: task.taskRequirement.maximum_seconds,
      minimum_characters_length: task.taskRequirement.minimum_characters_length,
      maximum_characters_length: task.taskRequirement.maximum_characters_length,
      estimated_earning:
        task.payment.contributor_credit_per_microtask *
        task.taskRequirement.max_micro_task_per_contributor,
      earning_per_task: task.payment.contributor_credit_per_microtask,
      average_time: task.taskRequirement.appriximate_time_per_batch,
      deadline: contributorMicroTasksAssignedInComplete.dead_line,
    });
  }

  /**
   * Handles micro-task retrieval for a contributor whose task membership
   * is in a PENDING state.
   *
   * This method resolves contributor-visible micro-tasks based on:
   * - Task visibility (public / private)
   * - Whether contributor testing is required
   * - Existing contributor submissions
   * - Assigned batch configuration (if applicable)
   *
   * Scenarios handled:
   *
   * 1. Private task + contributor test required:
   *    - If contributor already submitted test micro-tasks:
   *      → Return submitted test micro-tasks with retry and review metadata
   *    - If no submissions:
   *      → Return unstarted test micro-tasks
   *
   * 2. Public task + contributor test required:
   *    - Return contributor submissions (no test gating)
   *    - Micro-tasks are marked UNDER_REVIEW
   *
   * 3. Task does NOT require contributor test:
   *    - If contributor has an assignment:
   *      → Load current batch micro-tasks
   *      → Merge submitted and newly assigned micro-tasks
   *      → Calculate retry eligibility per micro-task
   *    - If no assignment:
   *      → Return empty micro-task list under review
   *
   * 4. Fallback:
   *    - Return empty contributor micro-task response under review
   *
   * Retry Logic:
   * - Retry eligibility is calculated using:
   *   - `max_retry_per_task +1`
   *   - Submission history
   *
   * Batch Logic:
   * - Current batch is derived from contributor assignment
   * - Only micro-tasks within the current batch window are exposed
   *
   * Sorting:
   * - Retryable micro-tasks are prioritized in the response
   *
   * @param {Task} task
   *  Fully hydrated task entity including:
   *  - task requirements
   *  - instructions
   *  - payment
   *
   * @param {string} userId
   *  Unique identifier of the contributor.
   *
   * @returns {Promise<TaskMicroTasksResponse>}
   *  Response containing:
   *  - Contributor micro-tasks
   *  - Test status and batch info
   *  - Retry metadata per micro-task
   *  - Task timing and earning information
   */
  private async handlePending(
    task: Task,
    userId: string,
    userPreferredLanguage: LanguageConstants = LanguageConstants.ENGLISH,
  ): Promise<TaskMicroTasksResponse> {
    console.log(' ========== handlePending ==========');
    if (!task.is_public && task.require_contributor_test) {
      const contributorSubmittedMicroTasks =
        await this.microTaskService.findAll({
          where: {
            task_id: task.id,
            dataSets: {
              contributor_id: userId,
            },
          },
          relations: {
            dataSets: {
              rejectionReasons: { rejectionType: true },
              dataSetReviews: true,
            },
          },
        });
      if (contributorSubmittedMicroTasks.length > 0) {
        const contributorMicroTasks: ContributorMicroTaskRto[] = [];
        for (const microTask of contributorSubmittedMicroTasks) {
          const status = getMicroTaskStatus(
            microTask,
            task.taskRequirement.max_retry_per_task + 1,
          );
          contributorMicroTasks.push(
            ContributorMicroTaskRto.from(
              {
                ...microTask,
                dataSets: status.dataSet ? [status.dataSet] : [],
              },
              {
                current_retry: status.totalAttempts,
                allowed_retry: task.taskRequirement.max_retry_per_task + 1,
                acceptance_status: status.acceptanceStatus,
                can_retry: status.canRetry,
              },
              userPreferredLanguage,
            ),
          );
        }
        return TaskMicroTasksResponse.from({
          ...task,
          has_passed: 'UNDER_REVIEW',
          batch: 0,
          is_test: true,
          contributorMicroTask: contributorMicroTasks.sort((a, b) => {
            if (a.can_retry === b.can_retry) return 0;
            return a.can_retry ? -1 : 1; // true first
          }),
          taskInstruction: task.taskInstruction
            ? TaskInstructionRto.from(task.taskInstruction)
            : undefined,
          minimum_seconds: task.taskRequirement.minimum_seconds,
          maximum_seconds: task.taskRequirement.maximum_seconds,
          minimum_characters_length:
            task.taskRequirement.minimum_characters_length,
          maximum_characters_length:
            task.taskRequirement.maximum_characters_length,
          estimated_earning:
            task.taskRequirement.max_micro_task_per_contributor *
            task.payment.contributor_credit_per_microtask,
          earning_per_task: task.payment.contributor_credit_per_microtask,
          average_time: task.taskRequirement.appriximate_time_per_batch,
          deadline: null,
        });
      } else {
        const testMicroTasks = await this.microTaskService.findAll({
          where: {
            is_test: true,
            task_id: task.id,
          },
          relations: {
            dataSets: true,
          },
        });
        return TaskMicroTasksResponse.from({
          ...task,
          has_passed: 'PENDING',
          batch: 0,
          is_test: true,
          contributorMicroTask: testMicroTasks.map((microTask) => {
            return ContributorMicroTaskRto.from(
              microTask,
              {
                current_retry: 0,
                allowed_retry: 1,
                acceptance_status: 'NOT_STARTED',
                can_retry: false,
              },
              userPreferredLanguage,
            );
          }),
          taskInstruction: task.taskInstruction,
          minimum_seconds: task.taskRequirement.minimum_seconds,
          maximum_seconds: task.taskRequirement.maximum_seconds,
          minimum_characters_length:
            task.taskRequirement.minimum_characters_length,
          maximum_characters_length:
            task.taskRequirement.maximum_characters_length,
          estimated_earning:
            task.taskRequirement.max_micro_task_per_contributor *
            task.payment.contributor_credit_per_microtask,
          earning_per_task: task.payment.contributor_credit_per_microtask,
          average_time: task.taskRequirement.appriximate_time_per_batch,
          deadline: null,
        });
      }
    } else if (task.is_public && task.require_contributor_test) {
      const contributorSubmissions: MicroTask[] =
        await this.microTaskService.findAll({
          where: {
            task_id: task.id,
            dataSets: {
              contributor_id: userId,
            },
          },
          relations: {
            dataSets: { rejectionReasons: { rejectionType: true } },
          },
        });
      const result: ContributorMicroTaskRto[] = [];
      for (const mt of contributorSubmissions) {
        const status = getMicroTaskStatus(
          mt,
          task.taskRequirement.max_retry_per_task + 1,
        );
        result.push({
          ...mt,
          acceptance_status: status.acceptanceStatus,
          current_retry: status.totalAttempts,
          allowed_retry: task.taskRequirement.max_retry_per_task + 1,
          can_retry: status.canRetry,
          dataSet: status.dataSet
            ? ContributorDataSetRto.from(status.dataSet, userPreferredLanguage)
            : undefined,
        });
      }
      return TaskMicroTasksResponse.from({
        ...task,
        has_passed: 'UNDER_REVIEW',
        batch: 0,
        is_test: false,
        contributorMicroTask: result.sort((a, b) => {
          if (a.can_retry === b.can_retry) return 0;
          return a.can_retry ? -1 : 1; // true first
        }),
        taskInstruction: task.taskInstruction,
        minimum_seconds: task.taskRequirement.minimum_seconds,
        maximum_seconds: task.taskRequirement.maximum_seconds,
        minimum_characters_length:
          task.taskRequirement.minimum_characters_length,
        maximum_characters_length:
          task.taskRequirement.maximum_characters_length,
        estimated_earning:
          task.taskRequirement.max_micro_task_per_contributor *
          task.payment.contributor_credit_per_microtask,
        earning_per_task: task.payment.contributor_credit_per_microtask,
        average_time: task.taskRequirement.appriximate_time_per_batch,
        deadline: null,
      });
    } else if (!task.require_contributor_test) {
      const contributorMicroTasksAssigned =
        await this.contributorMicroTaskService.findOne({
          where: {
            task_id: task.id,
            contributor_id: userId,
            status: Not(ContributorMicroTasksConstantStatus.EXPIRED),
          },
        });
      if (contributorMicroTasksAssigned) {
        const nextBatch =
          contributorMicroTasksAssigned.current_batch +
            contributorMicroTasksAssigned.batch >
          contributorMicroTasksAssigned.total_micro_tasks
            ? contributorMicroTasksAssigned.total_micro_tasks -
              contributorMicroTasksAssigned.current_batch
            : contributorMicroTasksAssigned.current_batch +
              contributorMicroTasksAssigned.batch;
        const current_batch = contributorMicroTasksAssigned.current_batch;
        const nextMicroTasks =
          contributorMicroTasksAssigned.micro_task_ids.slice(
            current_batch,
            nextBatch,
          );
        const contributorSubmissions = await this.microTaskService.findAll({
          where: [
            { id: In(nextMicroTasks) },
            {
              task_id: task.id,
              dataSets: {
                contributor_id: userId,
              },
            },
          ],
          relations: {
            dataSets: { rejectionReasons: { rejectionType: true } },
          },
        });
        const result: ContributorMicroTaskRto[] = [];
        if (contributorSubmissions.length > 0) {
          for (const microTask of contributorSubmissions) {
            const status = checkIfMicroTasIskRejectedAndTotalAttempts(
              microTask,
              task.taskRequirement.max_retry_per_task + 1,
            );
            result.push(
              ContributorMicroTaskRto.from(
                {
                  ...microTask,
                  dataSets: status.dataSet ? [status.dataSet] : undefined,
                },
                {
                  acceptance_status: status.acceptanceStatus,
                  current_retry: status.totalAttempts,
                  allowed_retry: task.taskRequirement.max_retry_per_task + 1,
                  can_retry: status.canRetry,
                },
                userPreferredLanguage,
              ),
            );
          }
        }
        const newTasks: MicroTask[] = contributorSubmissions.filter(
          (microTask) => microTask.dataSets.length === 0,
        );

        for (const microTask of newTasks) {
          result.push(
            ContributorMicroTaskRto.from(
              {
                ...microTask,
                dataSets: [],
              },
              {
                current_retry: 0,
                allowed_retry: task.taskRequirement.max_retry_per_task + 1,
                acceptance_status: 'NOT_STARTED',
                can_retry: true,
              },
              userPreferredLanguage,
            ),
          );
        }
        return TaskMicroTasksResponse.from({
          ...task,
          has_passed: 'APPROVED',
          is_test: false,
          contributorMicroTask: result.sort((a, b) => {
            if (a.can_retry === b.can_retry) return 0;
            return a.can_retry ? -1 : 1; // true first
          }),
          batch: current_batch,
          taskInstruction: task.taskInstruction,
          minimum_seconds: task.taskRequirement.minimum_seconds,
          maximum_seconds: task.taskRequirement.maximum_seconds,
          minimum_characters_length:
            task.taskRequirement.minimum_characters_length,
          maximum_characters_length:
            task.taskRequirement.maximum_characters_length,
          estimated_earning:
            task.taskRequirement.max_micro_task_per_contributor *
            task.payment.contributor_credit_per_microtask,
          earning_per_task: task.payment.contributor_credit_per_microtask,
          average_time: task.taskRequirement.appriximate_time_per_batch,
          deadline: null,
        });
      } else {
        return TaskMicroTasksResponse.from({
          ...task,
          has_passed: 'UNDER_REVIEW',
          batch: 0,
          is_test: false,
          contributorMicroTask: [],
          taskInstruction: undefined,
          minimum_seconds: task.taskRequirement.minimum_seconds,
          maximum_seconds: task.taskRequirement.maximum_seconds,
          minimum_characters_length:
            task.taskRequirement.minimum_characters_length,
          maximum_characters_length:
            task.taskRequirement.maximum_characters_length,
          estimated_earning:
            task.taskRequirement.max_micro_task_per_contributor *
            task.payment.contributor_credit_per_microtask,
          earning_per_task: task.payment.contributor_credit_per_microtask,
          average_time: task.taskRequirement.appriximate_time_per_batch,
          deadline: null,
        });
      }
    } else {
      return TaskMicroTasksResponse.from({
        ...task,
        has_passed: 'UNDER_REVIEW',
        batch: 0,
        is_test: false,
        contributorMicroTask: [],
        taskInstruction: task.taskInstruction,
        minimum_seconds: task.taskRequirement.minimum_seconds,
        maximum_seconds: task.taskRequirement.maximum_seconds,
        minimum_characters_length:
          task.taskRequirement.minimum_characters_length,
        maximum_characters_length:
          task.taskRequirement.maximum_characters_length,
        estimated_earning:
          task.taskRequirement.max_micro_task_per_contributor *
          task.payment.contributor_credit_per_microtask,
        earning_per_task: task.payment.contributor_credit_per_microtask,
        average_time: task.taskRequirement.appriximate_time_per_batch,
        deadline: null,
      });
    }
  }

  /**
   * Handles micro-task retrieval for a contributor who has no existing
   * `UserTask` record for the given task (new contributor).
   *
   * This method determines what micro-tasks a new contributor can see based on:
   * - Whether the task requires a contributor qualification test
   * - Whether the contributor has already submitted any micro-tasks
   * - Existing contributor micro-task assignment (if any)
   *
   * Scenarios handled:
   *
   * 1. Task does NOT require contributor test:
   *    - If contributor has no assignment:
   *      → Return empty contributor micro-task list (task already approved)
   *    - If contributor has an assignment:
   *      → Load previously completed micro-tasks
   *      → Load the next batch of assigned micro-tasks
   *      → Merge completed and newly assigned micro-tasks
   *
   * 2. Task requires contributor test:
   *    - If contributor has already submitted test micro-tasks:
   *      → Return submitted test micro-tasks under review
   *    - If contributor has not taken the test:
   *      → Return all test micro-tasks in NOT_STARTED state
   *
   * Retry Logic:
   * - Retry eligibility is calculated using:
   *   - `max_retry_per_task +1`
   *   - Submission history per micro-task
   *
   * Batch Logic (non-test tasks):
   * - Previously completed micro-tasks are derived from `current_batch`
   * - New micro-tasks are derived from `batch` size
   * - Batch boundaries are capped by total assigned micro-tasks
   *
   * Sorting:
   * - Micro-tasks are sorted with retryable tasks first
   *
   * @param {Task} task
   *  Fully hydrated task entity including:
   *  - task requirements
   *  - instructions
   *  - payment
   *
   * @param {string} userId
   *  Unique identifier of the contributor.
   *
   * @returns {Promise<TaskMicroTasksResponse>}
   *  Response containing:
   *  - Contributor micro-tasks
   *  - Test state and batch information
   *  - Retry metadata per micro-task
   *  - Task timing and earning information
   */
  private async handleNewUser(
    task: Task,
    userId: string,
    userPreferredLanguage: LanguageConstants = LanguageConstants.ENGLISH,
  ): Promise<TaskMicroTasksResponse> {
    console.log(' ========== handleNewUser ==========');
    // return all the test micro tasks
    if (!task.require_contributor_test) {
      const contributorMicroTasksAssigned =
        await this.contributorMicroTaskService.findOne({
          where: {
            task_id: task.id,
            contributor_id: userId,
            status: Not(ContributorMicroTasksConstantStatus.EXPIRED),
          },
        });
      if (!contributorMicroTasksAssigned) {
        return TaskMicroTasksResponse.from({
          ...task,
          has_passed: 'APPROVED',
          batch: 0,
          is_test: false,
          contributorMicroTask: [],
          taskInstruction: task.taskInstruction,
          minimum_seconds: task.taskRequirement.minimum_seconds,
          maximum_seconds: task.taskRequirement.maximum_seconds,
          minimum_characters_length:
            task.taskRequirement.minimum_characters_length,
          maximum_characters_length:
            task.taskRequirement.maximum_characters_length,
          estimated_earning:
            task.taskRequirement.max_micro_task_per_contributor *
            task.payment.contributor_credit_per_microtask,
          earning_per_task: task.payment.contributor_credit_per_microtask,
          average_time: task.taskRequirement.appriximate_time_per_batch,
          deadline: null,
        });
      }
      const prevDoneMicroTaskIds =
        contributorMicroTasksAssigned.micro_task_ids.slice(
          0,
          contributorMicroTasksAssigned.current_batch,
        );
      const prevSubmissions = await this.microTaskService.findAll({
        where: {
          task_id: task.id,
          dataSets: {
            contributor_id: userId,
            micro_task_id: In(prevDoneMicroTaskIds),
          },
        },
        relations: {
          dataSets: { rejectionReasons: { rejectionType: true } },
        },
      });
      const batch = contributorMicroTasksAssigned.batch;
      const currentBatch = contributorMicroTasksAssigned.current_batch;
      const newMicroTaskIds =
        contributorMicroTasksAssigned.micro_task_ids.slice(
          currentBatch,
          currentBatch + batch,
        );

      const contributorTasks: ContributorMicroTaskRto[] = [];
      const newMicroTasks = await this.microTaskService.findAll({
        where: {
          id: In(newMicroTaskIds),
        },
      });
      // Add the new microtasks
      for (const newM of newMicroTasks) {
        contributorTasks.push(
          ContributorMicroTaskRto.from(
            newM,
            {
              current_retry: 0,
              allowed_retry: task.taskRequirement.max_retry_per_task + 1,
              acceptance_status: 'NOT_STARTED',
              can_retry: false,
            },
            userPreferredLanguage,
          ),
        );
      }

      for (const prevM of prevSubmissions) {
        const status = checkIfMicroTasIskRejectedAndTotalAttempts(
          prevM,
          task.taskRequirement.max_retry_per_task + 1,
        );
        contributorTasks.push(
          ContributorMicroTaskRto.from(
            {
              ...prevM,
              dataSets: status.dataSet ? [status.dataSet] : undefined,
            },
            {
              acceptance_status: status.acceptanceStatus,
              current_retry: status.totalAttempts,
              allowed_retry: task.taskRequirement.max_retry_per_task + 1,
              can_retry: status.canRetry,
            },
            userPreferredLanguage,
          ),
        );
      }

      return TaskMicroTasksResponse.from({
        ...task,
        contributorMicroTask: contributorTasks.sort((a, b) => {
          if (a.can_retry === b.can_retry) return 0;
          return a.can_retry ? -1 : 1; // true first
        }),
        has_passed: 'APPROVED',
        is_test: false,
        batch: 0,
        taskInstruction: task.taskInstruction,
        minimum_seconds: task.taskRequirement.minimum_seconds,
        maximum_seconds: task.taskRequirement.maximum_seconds,
        minimum_characters_length:
          task.taskRequirement.minimum_characters_length,
        maximum_characters_length:
          task.taskRequirement.maximum_characters_length,
        estimated_earning:
          task.taskRequirement.max_micro_task_per_contributor *
          task.payment.contributor_credit_per_microtask,
        earning_per_task: task.payment.contributor_credit_per_microtask,
        average_time: task.taskRequirement.appriximate_time_per_batch,
        deadline: contributorMicroTasksAssigned.dead_line,
      });
    } else {
      const contributorSubmissions = await this.microTaskService.findAll({
        where: {
          task_id: task.id,
          dataSets: {
            contributor_id: userId,
          },
        },
        relations: {
          dataSets: { rejectionReasons: { rejectionType: true } },
        },
      });
      const hasTakenTest = contributorSubmissions.length > 0;

      if (hasTakenTest && contributorSubmissions) {
        const contributorMicroTasks: ContributorMicroTaskRto[] = [];
        for (const microTask of contributorSubmissions) {
          const status = checkIfMicroTasIskRejectedAndTotalAttempts(
            microTask,
            task.taskRequirement.max_retry_per_task + 1,
          );
          contributorMicroTasks.push(
            ContributorMicroTaskRto.from(
              microTask,
              {
                current_retry: status.totalAttempts,
                allowed_retry: task.taskRequirement.max_retry_per_task + 1,
                acceptance_status: status.acceptanceStatus,
                can_retry: status.canRetry,
              },
              userPreferredLanguage,
            ),
          );
        }
        return TaskMicroTasksResponse.from({
          has_passed: 'UNDER_REVIEW',
          batch: 0,
          is_test: true,
          ...task,
          contributorMicroTask: contributorMicroTasks.sort((a, b) => {
            if (a.can_retry === b.can_retry) return 0;
            return a.can_retry ? -1 : 1; // true first
          }),
          taskInstruction: task.taskInstruction,
          minimum_seconds: task.taskRequirement.minimum_seconds,
          maximum_seconds: task.taskRequirement.maximum_seconds,
          minimum_characters_length:
            task.taskRequirement.minimum_characters_length,
          maximum_characters_length:
            task.taskRequirement.maximum_characters_length,
          estimated_earning:
            task.payment.contributor_credit_per_microtask *
            task.taskRequirement.max_micro_task_per_contributor,
          earning_per_task: task.payment.contributor_credit_per_microtask,
          average_time: task.taskRequirement.appriximate_time_per_batch,
          deadline: null,
        });
      } else {
        const testMicroTasks =
          await this.microTaskService.findAllTestMicroTasks({
            where: { task_id: task.id },
          });
        return TaskMicroTasksResponse.from({
          has_passed: 'PENDING',
          batch: 0,
          is_test: true,
          ...task,
          contributorMicroTask: testMicroTasks.map((microTask) => {
            return ContributorMicroTaskRto.from(
              microTask,
              {
                current_retry: 0,
                allowed_retry: task.taskRequirement.max_retry_per_task + 1,
                acceptance_status: 'NOT_STARTED',
                can_retry: false,
              },
              userPreferredLanguage,
            );
          }),
          taskInstruction: task.taskInstruction,
          minimum_seconds: task.taskRequirement.minimum_seconds,
          maximum_seconds: task.taskRequirement.maximum_seconds,
          minimum_characters_length:
            task.taskRequirement.minimum_characters_length,
          maximum_characters_length:
            task.taskRequirement.maximum_characters_length,
          estimated_earning:
            task.taskRequirement.max_micro_task_per_contributor *
            task.payment.contributor_credit_per_microtask,
          earning_per_task: task.payment.contributor_credit_per_microtask,
          average_time: task.taskRequirement.appriximate_time_per_batch,
          deadline: null,
        });
      }
    }
  }

  /**
   * Handles micro-task retrieval for contributors whose task membership
   * is in a PENDING or INACTIVE (flagged) state.
   *
   * This method represents a restricted access state where the contributor
   * is not allowed to interact with any micro-tasks for the task.
   *
   * Behavior:
   * - No micro-tasks are returned
   * - Task is marked as FLAGGED
   * - No batching or test logic is applied
   * - Task metadata and earning information are still provided
   *
   * Typical use cases:
   * - Contributor has been flagged
   * - Contributor task access is temporarily suspended
   * - Task membership is inactive or unresolved
   *
   * @param {Task} task
   *  Fully hydrated task entity including:
   *  - task requirements
   *  - instructions
   *  - payment
   *
   * @param {string} userId
   *  Unique identifier of the contributor.
   *
   * @returns {Promise<TaskMicroTasksResponse>}
   *  Response indicating restricted access with no available micro-tasks.
   */
  private async handlePendingOrInActive(
    task: Task,
    userId: string,
    userPreferredLanguage: LanguageConstants = LanguageConstants.ENGLISH,
  ): Promise<TaskMicroTasksResponse> {
    return TaskMicroTasksResponse.from({
      ...task,
      has_passed: 'FLAGGED',
      batch: 0,
      is_test: false,
      contributorMicroTask: [],
      taskInstruction: task.taskInstruction,
      minimum_seconds: task.taskRequirement.minimum_seconds,
      maximum_seconds: task.taskRequirement.maximum_seconds,
      minimum_characters_length: task.taskRequirement.minimum_characters_length,
      maximum_characters_length: task.taskRequirement.maximum_characters_length,
      estimated_earning:
        task.taskRequirement.max_micro_task_per_contributor *
        task.payment.contributor_credit_per_microtask,
      earning_per_task: task.payment.contributor_credit_per_microtask,
      average_time: task.taskRequirement.appriximate_time_per_batch,
      deadline: null,
    });
  }

  /**
   * Retrieves and sanitizes all submissions made by a contributor
   * for a specific micro-task.
   *
   * This method:
   * - Fetches the micro-task along with contributor-specific data sets
   * - Includes rejection reasons and their types
   * - Converts raw DataSet entities into a sanitized response format
   *
   * If no submissions exist or the micro-task is not found,
   * an empty array is returned.
   *
   * @param {string} microTaskId
   *  Unique identifier of the micro-task.
   *
   * @param {string} contributorId
   *  Unique identifier of the contributor.
   *
   * @returns {Promise<DataSetSanitize[]>}
   *  List of sanitized contributor submissions, including:
   *  - Submission metadata
   *  - Rejection reasons (if any)
   */
  async getContributorMicroTaskSubmissions(
    microTaskId: string,
    contributorId: string,
  ): Promise<DataSetSanitize[]> {
    const microTask = await this.microTaskService.findOne({
      where: {
        id: microTaskId,
        dataSets: { contributor_id: contributorId },
      },
      relations: {
        dataSets: {
          rejectionReasons: { rejectionType: true },
        },
      },
    });
    const dataSetsSanitized: DataSetSanitize[] = microTask?.dataSets
      ? microTask.dataSets.map((dataSet) => {
          return DataSetSanitize.from(dataSet);
        })
      : [];
    return dataSetsSanitized;
  }

  // async getUserAssignedNewTasks(
  //   user_id: string,
  //   paginateDto: PaginationDto,
  // ): Promise<PaginatedResult<TaskStatus>> {
  //   const user = await this.userService.findOne({ where: { id: user_id } });
  //   if (!user) throw new NotFoundException(`User with id ${user_id} not found`);
  //   // Step 1: Get matching public task IDs
  //   const matchedTasks = await this.taskService.findMatchingTasks({
  //     dialect_id: user.dialect_id,
  //     language_id: user.language_id,
  //     birth_date: user.birth_date,
  //     gender: user.gender,
  //   });

  //   // Step 2: Get pending non started task Ids
  //   const memberTasksWithOutContribution = await this.userTaskService.findAll({
  //     where: {
  //       user_id: user_id,
  //       has_done_task: false,
  //       task: {
  //         is_closed: false,
  //         distribution_started: true,
  //       },
  //     },
  //     relations: { task: true },
  //   });
  //   const memberTasksWithOutContributionIds =
  //     memberTasksWithOutContribution.map((task) => task.task_id);

  //   // Step 3: Get assigned task IDs and done tasks
  //   const assignedTasksIds = await this.contributorMicroTaskService.findAll({
  //     where: {
  //       contributor_id: user_id,
  //       // status: ContributorMicroTasksConstantStatus.NEW,
  //     },
  //   });
  //   //
  //   let newAssignedTaskIds = assignedTasksIds
  //     .filter((task) => task.status === ContributorMicroTasksConstantStatus.NEW)
  //     .map((task) => task.task_id);

  //   const testRequireMatchingTaskIds = matchedTasks
  //     .filter((task) => task.task.require_contributor_test)
  //     .map((task) => task.task.id);

  //   const testRequiredUnAssignedMatchingTaskIds =
  //     testRequireMatchingTaskIds.filter(
  //       (id) => !newAssignedTaskIds.includes(id),
  //     );
  //   const filteredTaskIds = [
  //     ...newAssignedTaskIds,
  //     ...memberTasksWithOutContributionIds,
  //     ...testRequiredUnAssignedMatchingTaskIds,
  //   ];
  //   // Step 4: Fetch paginated tasks with relations
  //   const paginatedTasks = await this.taskService.getTasksWithoutContributor(
  //     filteredTaskIds,
  //     user_id,
  //     paginateDto.page || 1,
  //     paginateDto.limit || 10,
  //   );

  //   // Step 5: Enhance tasks with progress info
  //   const tasksWithStatus: TaskStatus[] = (
  //     await Promise.all(
  //       paginatedTasks.result.map(async (task) => {
  //         const contributorTask = assignedTasksIds.find(
  //           (contributorTask) => contributorTask.task_id === task.id,
  //         );
  //         if (!contributorTask) {
  //           if (task.require_contributor_test) {
  //             const total_count = await this.microTaskService.count({
  //               where: { task_id: task.id, is_test: true },
  //             });
  //             return {
  //               ...task,
  //               done_count: 0,
  //               total_count,
  //               task_type: task.taskType.task_type,
  //               average_time: task.taskRequirement.appriximate_time_per_batch,
  //               taskInstruction:
  //                 task.taskInstruction.length > 0
  //                   ? task.taskInstruction[0].content
  //                   : '',
  //             };
  //           } else {
  //             return;
  //           }
  //         } else {
  //           const done_count = 0;
  //           const total_count = Math.min(
  //             contributorTask.micro_task_ids.length,
  //             contributorTask.batch,
  //           );
  //           const dead_line = contributorTask.dead_line;

  //           return {
  //             ...task,
  //             task_type: task.taskType.task_type,
  //             taskInstruction:
  //               task.taskInstruction.length > 0
  //                 ? task.taskInstruction[0].content
  //                 : '',
  //             done_count,
  //             total_count,
  //             dead_line,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //           };
  //         }
  //       }),
  //     )
  //   ).filter((task) => task !== undefined);

  //   // Step 6: Return structured response
  //   return {
  //     result: tasksWithStatus,
  //     total: paginatedTasks.total,
  //     totalPages: paginatedTasks.totalPages,
  //     page: paginatedTasks.page,
  //     limit: paginatedTasks.limit,
  //   };
  // }
  // async getUserAssignedTaskMicroTasks(
  //   user_id: string,
  //   task_id: string,
  // ): Promise<TaskMicroTasksResponse> {
  //   let task = await this.taskService.findOne({
  //     where: {
  //       id: task_id,
  //     },
  //     relations: {
  //       taskRequirement: true,
  //       taskType: true,
  //       microTasks: true,
  //       taskInstruction: true,
  //       payment: true,
  //     },
  //   });
  //   if (!task) {
  //     throw new BadRequestException('Task not found');
  //   }
  //   // if (task.require_contributor_test) {
  //   let userTask: UserTask | null = await this.userTaskService.findOne({
  //     where: { user_id: user_id, task_id: task_id },
  //   });

  //   if (userTask != null) {
  //     if (userTask.status == UserTaskStatus.REJECTED) {
  //       let contributorTask = await this.taskService.findOne({
  //         where: {
  //           id: task_id,
  //           microTasks: {
  //             dataSets: {
  //               contributor_id: user_id,
  //             },
  //           },
  //         },
  //         relations: {
  //           microTasks: {
  //             dataSets: {
  //               rejectionReasons: { rejectionType: true },
  //             },
  //           },
  //         },
  //       });
  //       if (!contributorTask) {
  //         throw new BadRequestException('Task not found');
  //       }
  //       const microTasks = contributorTask.microTasks;
  //       let contributorMicroTasks: ContributorMicroTaskRto[] = [];
  //       for (const microTask of microTasks) {
  //         const status = getMicroTaskStatus(
  //           microTask,
  //           task.taskRequirement.max_retry_per_task +1,
  //         );
  //         contributorMicroTasks.push({
  //           ...microTask,
  //           acceptance_status: status.acceptanceStatus,
  //           current_retry: status.totalAttempts,
  //           allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //           can_retry: status.canRetry,
  //           dataSet: status.dataSet
  //             ? ContributorDataSetRto.from(status.dataSet)
  //             : undefined,
  //         });
  //       }

  //       contributorMicroTasks = contributorMicroTasks
  //         .map((microTask) => {
  //           return ContributorMicroTaskRto.fromSelf(microTask);
  //         })
  //         .sort((a, b) => {
  //           if (a.can_retry === b.can_retry) return 0;
  //           return a.can_retry ? -1 : 1; // true first
  //         });
  //       return TaskMicroTasksResponse.from({
  //         ...task,
  //         has_passed: 'REJECTED',
  //         batch: 0,
  //         is_test: true,
  //         contributorMicroTask: contributorMicroTasks,
  //         taskInstruction:
  //           task.taskInstruction.length > 0
  //             ? TaskInstructionRto.from(task.taskInstruction[0])
  //             : undefined,
  //         minimum_seconds: task.taskRequirement.minimum_seconds,
  //         maximum_seconds: task.taskRequirement.maximum_seconds,
  //         minimum_characters_length:
  //           task.taskRequirement.minimum_characters_length,
  //         maximum_characters_length:
  //           task.taskRequirement.maximum_characters_length,
  //         estimated_earning:
  //           task.payment.contributor_credit_per_microtask *
  //           task.taskRequirement.max_micro_task_per_contributor,
  //         earning_per_task: task.payment.contributor_credit_per_microtask,
  //         average_time: task.taskRequirement.appriximate_time_per_batch,
  //         deadline: null,
  //       });
  //     } else if (userTask.status == UserTaskStatus.ACTIVE) {
  //       const contributorMicroTasksAssigned =
  //         await this.contributorMicroTaskService.findOne({
  //           where: { contributor_id: user_id, task_id: task_id },
  //         });
  //       if (!contributorMicroTasksAssigned) {
  //         let microTasksDone: MicroTask[] = await this.microTaskService.findAll(
  //           {
  //             where: {
  //               task_id: task_id,
  //               dataSets: {
  //                 contributor_id: user_id,
  //               },
  //             },
  //             relations: {
  //               dataSets: {
  //                 rejectionReasons: { rejectionType: true },
  //               },
  //             },
  //           },
  //         );
  //         let result: ContributorMicroTaskRto[] = [];
  //         for (const mt of microTasksDone) {
  //           const status = getMicroTaskStatus(
  //             mt,
  //             task.taskRequirement.max_retry_per_task +1,
  //           );
  //           result.push({
  //             ...mt,
  //             acceptance_status: status.acceptanceStatus,
  //             current_retry: status.totalAttempts,
  //             allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //             can_retry: status.canRetry,
  //             dataSet: status.dataSet
  //               ? ContributorDataSetRto.from(status.dataSet)
  //               : undefined,
  //           });
  //         }
  //         return TaskMicroTasksResponse.from({
  //           ...task,
  //           has_passed: 'APPROVED',
  //           batch: 0,
  //           is_test: false,
  //           contributorMicroTask: result.sort((a, b) => {
  //             if (a.can_retry === b.can_retry) return 0;
  //             return a.can_retry ? -1 : 1; // true first
  //           }),
  //           taskInstruction:
  //             task.taskInstruction.length > 0
  //               ? TaskInstructionRto.from(task.taskInstruction[0])
  //               : undefined,
  //           minimum_seconds: task.taskRequirement.minimum_seconds,
  //           maximum_seconds: task.taskRequirement.maximum_seconds,
  //           minimum_characters_length:
  //             task.taskRequirement.minimum_characters_length,
  //           maximum_characters_length:
  //             task.taskRequirement.maximum_characters_length,
  //           estimated_earning:
  //             task.payment.contributor_credit_per_microtask *
  //             task.taskRequirement.max_micro_task_per_contributor,
  //           earning_per_task: task.payment.contributor_credit_per_microtask,
  //           average_time: task.taskRequirement.appriximate_time_per_batch,
  //           deadline: null,
  //         });
  //       }
  //       let nextBatch = Math.min(
  //         contributorMicroTasksAssigned.current_batch +
  //           contributorMicroTasksAssigned.batch,
  //         contributorMicroTasksAssigned.total_micro_tasks,
  //       );
  //       let current_batch = contributorMicroTasksAssigned.current_batch;
  //       let prevMicroTasksIds =
  //         contributorMicroTasksAssigned.micro_task_ids.slice(0, current_batch);
  //       let nextMicroTasksIds =
  //         contributorMicroTasksAssigned.micro_task_ids.slice(
  //           current_batch,
  //           nextBatch,
  //         );
  //       let prevDoneMicroTasks: any[] = [];
  //       let nextAssignedMicroTasks: any[] = [];
  //       if (prevMicroTasksIds.length > 0) {
  //         prevDoneMicroTasks = await this.microTaskService.findAll({
  //           where: {
  //             id: In(prevMicroTasksIds),
  //             dataSets: {
  //               contributor_id: user_id,
  //             },
  //           },
  //           relations: {
  //             dataSets: {
  //               rejectionReasons: { rejectionType: true },
  //               flagReason: true,
  //             },
  //           },
  //         });
  //       }
  //       if (nextMicroTasksIds.length > 0) {
  //         nextAssignedMicroTasks = await this.microTaskService.findAll({
  //           where: {
  //             id: In(nextMicroTasksIds),
  //           },
  //         });
  //       }
  //       let result: ContributorMicroTaskRto[] = [];
  //       for (const microTask of prevDoneMicroTasks) {
  //         const status = checkIfMicroTasIskRejectedAndTotalAttempts(
  //           microTask,
  //           task.taskRequirement.max_retry_per_task +1,
  //         );
  //         result.push(
  //           ContributorMicroTaskRto.from(
  //             {
  //               ...microTask,
  //               dataSets: status.dataSet
  //                 ? [ContributorDataSetRto.from(status.dataSet)]
  //                 : undefined,
  //             },
  //             {
  //               acceptance_status: status.acceptanceStatus,
  //               current_retry: status.totalAttempts,
  //               allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //               can_retry: status.canRetry,
  //             },
  //           ),
  //         );
  //       }
  //       // cons
  //       for (const microTask of nextAssignedMicroTasks) {
  //         result.push(
  //           ContributorMicroTaskRto.from(
  //             {
  //               ...microTask,
  //               dataSets: [],
  //             },
  //             {
  //               current_retry: 0,
  //               allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //               acceptance_status: 'NOT_STARTED',
  //               can_retry: true,
  //             },
  //           ),
  //         );
  //       }

  //       return TaskMicroTasksResponse.from({
  //         ...task,
  //         has_passed: 'APPROVED',
  //         is_test: false,
  //         contributorMicroTask: result.sort((a, b) => {
  //           if (a.can_retry === b.can_retry) return 0;
  //           return a.can_retry ? -1 : 1; // true first
  //         }),
  //         batch: current_batch,
  //         taskInstruction:
  //           task.taskInstruction.length > 0
  //             ? TaskInstructionRto.from(task.taskInstruction[0])
  //             : undefined,
  //         minimum_seconds: task.taskRequirement.minimum_seconds,
  //         maximum_seconds: task.taskRequirement.maximum_seconds,
  //         minimum_characters_length:
  //           task.taskRequirement.minimum_characters_length,
  //         maximum_characters_length:
  //           task.taskRequirement.maximum_characters_length,
  //         estimated_earning:
  //           task.payment.contributor_credit_per_microtask *
  //           task.taskRequirement.max_micro_task_per_contributor,
  //         earning_per_task: task.payment.contributor_credit_per_microtask,
  //         average_time: task.taskRequirement.appriximate_time_per_batch,
  //         deadline: contributorMicroTasksAssigned.dead_line,
  //       });
  //     } else if (userTask.status == UserTaskStatus.PENDING) {
  //       if (!task.is_public && task.require_contributor_test) {
  //         const contributorSubmittedMicroTasks =
  //           await this.microTaskService.findAll({
  //             where: {
  //               task_id: task_id,
  //               dataSets: {
  //                 contributor_id: user_id,
  //               },
  //             },
  //             relations: {
  //               dataSets: { rejectionReasons: { rejectionType: true } },
  //             },
  //           });
  //         if (contributorSubmittedMicroTasks.length > 0) {
  //           let contributorMicroTasks: ContributorMicroTaskRto[] = [];
  //           for (const microTask of contributorSubmittedMicroTasks) {
  //             const status = getMicroTaskStatus(
  //               microTask,
  //               task.taskRequirement.max_retry_per_task +1,
  //             );
  //             contributorMicroTasks.push(
  //               ContributorMicroTaskRto.from(
  //                 {
  //                   ...microTask,
  //                   dataSets: status.dataSet
  //                     ? [ContributorDataSetRto.from(status.dataSet)]
  //                     : [],
  //                 },
  //                 {
  //                   current_retry: status.totalAttempts,
  //                   allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //                   acceptance_status: status.acceptanceStatus,
  //                   can_retry: status.canRetry,
  //                 },
  //               ),
  //             );
  //           }
  //           return TaskMicroTasksResponse.from({
  //             ...task,
  //             has_passed: 'UNDER_REVIEW',
  //             batch: 0,
  //             is_test: true,
  //             contributorMicroTask: contributorMicroTasks.sort((a, b) => {
  //               if (a.can_retry === b.can_retry) return 0;
  //               return a.can_retry ? -1 : 1; // true first
  //             }),
  //             taskInstruction:
  //               task.taskInstruction.length > 0
  //                 ? task.taskInstruction[0]
  //                 : undefined,
  //             minimum_seconds: task.taskRequirement.minimum_seconds,
  //             maximum_seconds: task.taskRequirement.maximum_seconds,
  //             minimum_characters_length:
  //               task.taskRequirement.minimum_characters_length,
  //             maximum_characters_length:
  //               task.taskRequirement.maximum_characters_length,
  //             estimated_earning:
  //               task.taskRequirement.max_micro_task_per_contributor *
  //               task.payment.contributor_credit_per_microtask,
  //             earning_per_task: task.payment.contributor_credit_per_microtask,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //             deadline: null,
  //           });
  //         } else {
  //           const testMicroTasks = await this.microTaskService.findAll({
  //             where: {
  //               is_test: true,
  //               task_id: task_id,
  //             },
  //             relations: {
  //               dataSets: true,
  //             },
  //           });
  //           return TaskMicroTasksResponse.from({
  //             ...task,
  //             has_passed: 'PENDING',
  //             batch: 0,
  //             is_test: true,
  //             contributorMicroTask: testMicroTasks.map((microTask) => {
  //               return ContributorMicroTaskRto.from(microTask, {
  //                 current_retry: 0,
  //                 allowed_retry: 1,
  //                 acceptance_status: 'NOT_STARTED',
  //                 can_retry: false,
  //               });
  //             }),
  //             taskInstruction:
  //               task.taskInstruction.length > 0
  //                 ? task.taskInstruction[0]
  //                 : undefined,
  //             minimum_seconds: task.taskRequirement.minimum_seconds,
  //             maximum_seconds: task.taskRequirement.maximum_seconds,
  //             minimum_characters_length:
  //               task.taskRequirement.minimum_characters_length,
  //             maximum_characters_length:
  //               task.taskRequirement.maximum_characters_length,
  //             estimated_earning:
  //               task.taskRequirement.max_micro_task_per_contributor *
  //               task.payment.contributor_credit_per_microtask,
  //             earning_per_task: task.payment.contributor_credit_per_microtask,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //             deadline: null,
  //           });
  //         }
  //       } else if (task.is_public && task.require_contributor_test) {
  //         let microTasksDone: MicroTask[] = await this.microTaskService.findAll(
  //           {
  //             where: {
  //               task_id: task_id,
  //               dataSets: {
  //                 contributor_id: user_id,
  //               },
  //             },
  //             relations: {
  //               dataSets: { rejectionReasons: { rejectionType: true } },
  //             },
  //           },
  //         );
  //         let result: ContributorMicroTaskRto[] = [];
  //         for (const mt of microTasksDone) {
  //           const status = getMicroTaskStatus(
  //             mt,
  //             task.taskRequirement.max_retry_per_task +1,
  //           );
  //           result.push({
  //             ...mt,
  //             acceptance_status: status.acceptanceStatus,
  //             current_retry: status.totalAttempts,
  //             allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //             can_retry: status.canRetry,
  //             dataSet: status.dataSet
  //               ? ContributorDataSetRto.from(status.dataSet)
  //               : undefined,
  //           });
  //         }
  //         return TaskMicroTasksResponse.from({
  //           ...task,
  //           has_passed: 'UNDER_REVIEW',
  //           batch: 0,
  //           is_test: false,
  //           contributorMicroTask: result.sort((a, b) => {
  //             if (a.can_retry === b.can_retry) return 0;
  //             return a.can_retry ? -1 : 1; // true first
  //           }),
  //           taskInstruction:
  //             task.taskInstruction.length > 0
  //               ? task.taskInstruction[0]
  //               : undefined,
  //           minimum_seconds: task.taskRequirement.minimum_seconds,
  //           maximum_seconds: task.taskRequirement.maximum_seconds,
  //           minimum_characters_length:
  //             task.taskRequirement.minimum_characters_length,
  //           maximum_characters_length:
  //             task.taskRequirement.maximum_characters_length,
  //           estimated_earning:
  //             task.taskRequirement.max_micro_task_per_contributor *
  //             task.payment.contributor_credit_per_microtask,
  //           earning_per_task: task.payment.contributor_credit_per_microtask,
  //           average_time: task.taskRequirement.appriximate_time_per_batch,
  //           deadline: null,
  //         });
  //       } else if (!task.require_contributor_test) {
  //         const contributorMicroTasksAssigned =
  //           await this.contributorMicroTaskService.findOne({
  //             where: {
  //               task_id: task_id,
  //               contributor_id: user_id,
  //             },
  //           });
  //         if (contributorMicroTasksAssigned) {
  //           let nextBatch =
  //             contributorMicroTasksAssigned.current_batch +
  //               contributorMicroTasksAssigned.batch >
  //             contributorMicroTasksAssigned.total_micro_tasks
  //               ? contributorMicroTasksAssigned.total_micro_tasks -
  //                 contributorMicroTasksAssigned.current_batch
  //               : contributorMicroTasksAssigned.current_batch +
  //                 contributorMicroTasksAssigned.batch;
  //           let current_batch = contributorMicroTasksAssigned.current_batch;
  //           let nextMicroTasks =
  //             contributorMicroTasksAssigned.micro_task_ids.slice(
  //               current_batch,
  //               nextBatch,
  //             );
  //           const contributorTasks = await this.taskService.findOne({
  //             where: {
  //               id: task_id,
  //               microTasks: {
  //                 is_test: false,
  //                 dataSets: {
  //                   contributor_id: user_id,
  //                 },
  //               },
  //             },
  //             relations: {
  //               microTasks: {
  //                 dataSets: true,
  //               },
  //             },
  //           });
  //           let result: ContributorMicroTaskRto[] = [];
  //           if (contributorTasks) {
  //             for (const microTask of contributorTasks.microTasks) {
  //               const status = checkIfMicroTasIskRejectedAndTotalAttempts(
  //                 microTask,
  //                 task.taskRequirement.max_retry_per_task +1,
  //               );
  //               result.push(
  //                 ContributorMicroTaskRto.from(
  //                   {
  //                     ...microTask,
  //                     dataSets: status.dataSet
  //                       ? [ContributorDataSetRto.from(status.dataSet)]
  //                       : undefined,
  //                   },
  //                   {
  //                     acceptance_status: status.acceptanceStatus,
  //                     current_retry: status.totalAttempts,
  //                     allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //                     can_retry: status.canRetry,
  //                   },
  //                 ),
  //               );
  //             }
  //           }
  //           let newTasks: MicroTask[] = await this.microTaskService.findAll({
  //             where: { id: In(nextMicroTasks) },
  //             relations: {
  //               dataSets: true,
  //             },
  //           });

  //           for (const microTask of newTasks) {
  //             result.push(
  //               ContributorMicroTaskRto.from(
  //                 {
  //                   ...microTask,
  //                   dataSets: [],
  //                 },
  //                 {
  //                   current_retry: 0,
  //                   allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //                   acceptance_status: 'NOT_STARTED',
  //                   can_retry: true,
  //                 },
  //               ),
  //             );
  //           }
  //           return TaskMicroTasksResponse.from({
  //             ...task,
  //             has_passed: 'APPROVED',
  //             is_test: false,
  //             contributorMicroTask: result.sort((a, b) => {
  //               if (a.can_retry === b.can_retry) return 0;
  //               return a.can_retry ? -1 : 1; // true first
  //             }),
  //             batch: current_batch,
  //             taskInstruction:
  //               task.taskInstruction.length > 0
  //                 ? task.taskInstruction[0]
  //                 : undefined,
  //             minimum_seconds: task.taskRequirement.minimum_seconds,
  //             maximum_seconds: task.taskRequirement.maximum_seconds,
  //             minimum_characters_length:
  //               task.taskRequirement.minimum_characters_length,
  //             maximum_characters_length:
  //               task.taskRequirement.maximum_characters_length,
  //             estimated_earning:
  //               task.taskRequirement.max_micro_task_per_contributor *
  //               task.payment.contributor_credit_per_microtask,
  //             earning_per_task: task.payment.contributor_credit_per_microtask,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //             deadline: null,
  //           });
  //         } else {
  //           return TaskMicroTasksResponse.from({
  //             ...task,
  //             has_passed: 'UNDER_REVIEW',
  //             batch: 0,
  //             is_test: false,
  //             contributorMicroTask: [],
  //             taskInstruction: undefined,
  //             minimum_seconds: task.taskRequirement.minimum_seconds,
  //             maximum_seconds: task.taskRequirement.maximum_seconds,
  //             minimum_characters_length:
  //               task.taskRequirement.minimum_characters_length,
  //             maximum_characters_length:
  //               task.taskRequirement.maximum_characters_length,
  //             estimated_earning:
  //               task.taskRequirement.max_micro_task_per_contributor *
  //               task.payment.contributor_credit_per_microtask,
  //             earning_per_task: task.payment.contributor_credit_per_microtask,
  //             average_time: task.taskRequirement.appriximate_time_per_batch,
  //             deadline: null,
  //           });
  //         }
  //       } else {
  //         return TaskMicroTasksResponse.from({
  //           ...task,
  //           has_passed: 'UNDER_REVIEW',
  //           batch: 0,
  //           is_test: false,
  //           contributorMicroTask: [],
  //           taskInstruction:
  //             task.taskInstruction.length > 0
  //               ? task.taskInstruction[0]
  //               : undefined,
  //           minimum_seconds: task.taskRequirement.minimum_seconds,
  //           maximum_seconds: task.taskRequirement.maximum_seconds,
  //           minimum_characters_length:
  //             task.taskRequirement.minimum_characters_length,
  //           maximum_characters_length:
  //             task.taskRequirement.maximum_characters_length,
  //           estimated_earning:
  //             task.taskRequirement.max_micro_task_per_contributor *
  //             task.payment.contributor_credit_per_microtask,
  //           earning_per_task: task.payment.contributor_credit_per_microtask,
  //           average_time: task.taskRequirement.appriximate_time_per_batch,
  //           deadline: null,
  //         });
  //       }
  //     } else {
  //       return TaskMicroTasksResponse.from({
  //         ...task,
  //         has_passed: 'FLAGGED',
  //         batch: 0,
  //         is_test: false,
  //         contributorMicroTask: [],
  //         taskInstruction:
  //           task.taskInstruction.length > 0
  //             ? task.taskInstruction[0]
  //             : undefined,
  //         minimum_seconds: task.taskRequirement.minimum_seconds,
  //         maximum_seconds: task.taskRequirement.maximum_seconds,
  //         minimum_characters_length:
  //           task.taskRequirement.minimum_characters_length,
  //         maximum_characters_length:
  //           task.taskRequirement.maximum_characters_length,
  //         estimated_earning:
  //           task.taskRequirement.max_micro_task_per_contributor *
  //           task.payment.contributor_credit_per_microtask,
  //         earning_per_task: task.payment.contributor_credit_per_microtask,
  //         average_time: task.taskRequirement.appriximate_time_per_batch,
  //         deadline: null,
  //       });
  //     }
  //   } else {
  //     // return all the test micro tasks
  //     if (!task.require_contributor_test) {
  //       const contributorMicroTasksAssigned =
  //         await this.contributorMicroTaskService.findOne({
  //           where: {
  //             task_id: task_id,
  //             contributor_id: user_id,
  //           },
  //         });
  //       if (!contributorMicroTasksAssigned) {
  //         return TaskMicroTasksResponse.from({
  //           ...task,
  //           has_passed: 'APPROVED',
  //           batch: 0,
  //           is_test: false,
  //           contributorMicroTask: [],
  //           taskInstruction:
  //             task.taskInstruction.length > 0
  //               ? task.taskInstruction[0]
  //               : undefined,
  //           minimum_seconds: task.taskRequirement.minimum_seconds,
  //           maximum_seconds: task.taskRequirement.maximum_seconds,
  //           minimum_characters_length:
  //             task.taskRequirement.minimum_characters_length,
  //           maximum_characters_length:
  //             task.taskRequirement.maximum_characters_length,
  //           estimated_earning:
  //             task.taskRequirement.max_micro_task_per_contributor *
  //             task.payment.contributor_credit_per_microtask,
  //           earning_per_task: task.payment.contributor_credit_per_microtask,
  //           average_time: task.taskRequirement.appriximate_time_per_batch,
  //           deadline: null,
  //         });
  //       }
  //       let batch = contributorMicroTasksAssigned.batch;
  //       let currentBatch = contributorMicroTasksAssigned.current_batch;
  //       let newMicroTaskIds =
  //         contributorMicroTasksAssigned.micro_task_ids.slice(
  //           currentBatch,
  //           currentBatch + batch,
  //         );
  //       let contributorTasks: ContributorMicroTaskRto[] = [];
  //       const newMicroTasks = await this.microTaskService.findAll({
  //         where: {
  //           id: In(newMicroTaskIds),
  //         },
  //         relations: {
  //           dataSets: true,
  //         },
  //       });
  //       // Add the new microtasks
  //       for (const newM of newMicroTasks) {
  //         contributorTasks.push(
  //           ContributorMicroTaskRto.from(newM, {
  //             current_retry: 0,
  //             allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //             acceptance_status: 'NOT_STARTED',
  //             can_retry: false,
  //           }),
  //         );
  //       }
  //       return TaskMicroTasksResponse.from({
  //         ...task,
  //         contributorMicroTask: contributorTasks.sort((a, b) => {
  //           if (a.can_retry === b.can_retry) return 0;
  //           return a.can_retry ? -1 : 1; // true first
  //         }),
  //         has_passed: 'APPROVED',
  //         is_test: false,
  //         batch: 0,
  //         taskInstruction:
  //           task.taskInstruction.length > 0
  //             ? task.taskInstruction[0]
  //             : undefined,
  //         minimum_seconds: task.taskRequirement.minimum_seconds,
  //         maximum_seconds: task.taskRequirement.maximum_seconds,
  //         minimum_characters_length:
  //           task.taskRequirement.minimum_characters_length,
  //         maximum_characters_length:
  //           task.taskRequirement.maximum_characters_length,
  //         estimated_earning:
  //           task.taskRequirement.max_micro_task_per_contributor *
  //           task.payment.contributor_credit_per_microtask,
  //         earning_per_task: task.payment.contributor_credit_per_microtask,
  //         average_time: task.taskRequirement.appriximate_time_per_batch,
  //         deadline: contributorMicroTasksAssigned.dead_line,
  //       });
  //     } else {
  //       const contributedTaskBefore = await this.taskService.findOne({
  //         where: {
  //           id: task_id,
  //           microTasks: {
  //             dataSets: {
  //               contributor_id: user_id,
  //             },
  //           },
  //         },
  //         relations: {
  //           microTasks: {
  //             dataSets: true,
  //           },
  //         },
  //       });
  //       const hasTakenTest = contributedTaskBefore
  //         ? contributedTaskBefore.microTasks.length > 0
  //         : false;

  //       if (hasTakenTest && contributedTaskBefore) {
  //         // return all the tasks with the status
  //         const contributedMicroTasksBefore = contributedTaskBefore.microTasks;
  //         let contributorMicroTasks: ContributorMicroTaskRto[] = [];
  //         for (const microTask of contributedMicroTasksBefore) {
  //           const status = checkIfMicroTasIskRejectedAndTotalAttempts(
  //             microTask,
  //             task.taskRequirement.max_retry_per_task +1,
  //           );
  //           contributorMicroTasks.push(
  //             ContributorMicroTaskRto.from(microTask, {
  //               current_retry: status.totalAttempts,
  //               allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //               acceptance_status: status.acceptanceStatus,
  //               can_retry: status.canRetry,
  //             }),
  //           );
  //         }
  //         return TaskMicroTasksResponse.from({
  //           has_passed: 'UNDER_REVIEW',
  //           batch: 0,
  //           is_test: true,
  //           ...task,
  //           contributorMicroTask: contributorMicroTasks.sort((a, b) => {
  //             if (a.can_retry === b.can_retry) return 0;
  //             return a.can_retry ? -1 : 1; // true first
  //           }),
  //           taskInstruction:
  //             task.taskInstruction.length > 0
  //               ? task.taskInstruction[0]
  //               : undefined,
  //           minimum_seconds: task.taskRequirement.minimum_seconds,
  //           maximum_seconds: task.taskRequirement.maximum_seconds,
  //           minimum_characters_length:
  //             task.taskRequirement.minimum_characters_length,
  //           maximum_characters_length:
  //             task.taskRequirement.maximum_characters_length,
  //           estimated_earning:
  //             task.payment.contributor_credit_per_microtask *
  //             task.taskRequirement.max_micro_task_per_contributor,
  //           earning_per_task: task.payment.contributor_credit_per_microtask,
  //           average_time: task.taskRequirement.appriximate_time_per_batch,
  //           deadline: null,
  //         });
  //       } else {
  //         let testMicroTasks =
  //           await this.microTaskService.findAllTestMicroTasks({
  //             where: { task_id: task_id },
  //           });
  //         return TaskMicroTasksResponse.from({
  //           has_passed: 'PENDING',
  //           batch: 0,
  //           is_test: true,
  //           ...task,
  //           contributorMicroTask: testMicroTasks.map((microTask) => {
  //             return ContributorMicroTaskRto.from(microTask, {
  //               current_retry: 0,
  //               allowed_retry: task.taskRequirement.max_retry_per_task +1,
  //               acceptance_status: 'NOT_STARTED',
  //               can_retry: false,
  //             });
  //           }),
  //           taskInstruction:
  //             task.taskInstruction.length > 0
  //               ? task.taskInstruction[0]
  //               : undefined,
  //           minimum_seconds: task.taskRequirement.minimum_seconds,
  //           maximum_seconds: task.taskRequirement.maximum_seconds,
  //           minimum_characters_length:
  //             task.taskRequirement.minimum_characters_length,
  //           maximum_characters_length:
  //             task.taskRequirement.maximum_characters_length,
  //           estimated_earning:
  //             task.taskRequirement.max_micro_task_per_contributor *
  //             task.payment.contributor_credit_per_microtask,
  //           earning_per_task: task.payment.contributor_credit_per_microtask,
  //           average_time: task.taskRequirement.appriximate_time_per_batch,
  //           deadline: null,
  //         });
  //       }
  //     }
  //   }
  // }
}
