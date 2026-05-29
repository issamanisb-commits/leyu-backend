import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from '../entities/Task.entity';
import { UserTaskService } from './UserTask.service';
import { UserTask } from '../entities/UserTask.entity';
import {
  ExportContributorsOfATaskDto,
  ImportContributorFromOtherTaskDto,
} from '../dto/Task.dto';
import { UserTaskStatus } from 'src/utils/constants/Task.constant';

export interface Contributors {
  id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  gender: string;
  contribution_count: string;
}

@Injectable()
export class TaskServiceHelperService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,

    @InjectRepository(UserTask)
    private readonly userTaskRepository: Repository<UserTask>,
    // private readonly notificationService:NotificationService,

    private readonly userTaskService: UserTaskService,
  ) {}

  /**
   * Import contributors from other task.
   *
   * @param taskId: the task id from which to import contributors.
   * @param importDto: the import contributor dto.
   * @returns { message: string }: 'Contributors imported successfully'
   * @throws NotFoundException: if no members are found
   */
  async importContributorsFromOtherTask(
    taskId: string,
    importDto: ImportContributorFromOtherTaskDto,
  ) {
    const task = await this.taskRepository.findOneBy({ id: taskId });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    if (task.is_public) {
      throw new BadRequestException(
        'Cannot import contributors for public task',
      );
    }
    if (task.id ===importDto.sourceTaskId){
      throw new BadRequestException(
        'Cannot import contributors from same task'
      )
    }
    const targetTaskMembers = await this.userTaskService.findAll({
      where: {
        task_id: taskId,
        role: 'Contributor',
      },
    });
    const targetTaskMembersUserId = targetTaskMembers.map(
      (member) => member.user_id,
    );

    const members = await this.getMembersWithMinContributions(
      targetTaskMembersUserId,
      importDto,
    );
    console.log("Source task members",members)
    if (members.length == 0) {
      throw new NotFoundException('No members found');
    }

    const status = task.require_contributor_test
      ? UserTaskStatus.PENDING
      : UserTaskStatus.ACTIVE;
    const taskMemberImages: Partial<UserTask>[] = members.map((m) => {
      return {
        task_id: task.id,
        user_id: m.id,
        role: 'Contributor',
        status: status,
      };
    });
    await this.userTaskService.createMultipleTaskMembers(taskMemberImages);
    return { message: 'Contributors imported successfully' };
  }
  /**
   * Get contributors of a task.
   * @param task_id The task id.
   * @param exportDto The export contributor dto.
   * @returns { message: string }: 'Contributors exported successfully'
   * @throws NotFoundException: if no members are found
   */
  async getTaskContributors(
    task_id: string,
    exportDto: ExportContributorsOfATaskDto,
  ) {
    return await this.getMembersWithMinContributions([], {
      ...exportDto,
      sourceTaskId: task_id,
    });
  }
  /**
   * Retrieves contributors of a task that have a minimum number of accepted data sets.
   * - param: excludedMemberIds - an array of member ids to exclude from the results
   * - param: importDto - an object containing the task id, dataset status, status, min number of accepted data sets and limit
   * - returns: a promise that resolves to a list of contributors
   */
  async getMembersWithMinContributions(
  excludedMemberIds: string[],
  importDto: ImportContributorFromOtherTaskDto,
): Promise<Contributors[]> {
  const query = this.userTaskRepository
    .createQueryBuilder('user_task')
    .where('user_task.role = :role', { role: 'Contributor' })
    .andWhere('user_task.task_id = :taskId', { taskId: importDto.sourceTaskId })
    .innerJoin('user_task.user', 'user');

  if (excludedMemberIds.length > 0) {
    query.andWhere('user.id NOT IN (:...excludedMemberIds)', { excludedMemberIds });
  }

  if (importDto.status && importDto.status !== 'All') {
    query.andWhere('user_task.status = :status', { status: importDto.status });
  }

  const hasStatusFilter =
    importDto.datasetStatus && importDto.datasetStatus !== 'All';

  if (hasStatusFilter) {
    query
      .leftJoin(
        'user.contributes',
        'contributes',
        'contributes.status = :datasetStatus',
        { datasetStatus: importDto.datasetStatus },
      )
      .leftJoin(
        'contributes.microTask',
        'microTask',
        'microTask.task_id = :taskId',
        { taskId: importDto.sourceTaskId },
      );
  } else {
    query
      .leftJoin('user.contributes', 'contributes')
      .leftJoin(
        'contributes.microTask',
        'microTask',
        'microTask.task_id = :taskId',
        { taskId: importDto.sourceTaskId },
      );
  }

  query
    .groupBy('user.id')
    .addGroupBy('user_task.id')
    .select([
      'user.id AS id',
      'user.first_name AS first_name',
      'user.middle_name AS middle_name',
      'user.last_name AS last_name',
      'user.email AS email',
      'user.phone_number AS phone_number',
      'user.gender AS gender',
    ])
    // Only count contributions that matched the task via microTask join
    .addSelect(
      'COUNT(CASE WHEN microTask.task_id IS NOT NULL THEN contributes.id END)',
      'contribution_count',
    );

  if (
    importDto.minNumberOfAcceptedDataSets &&
    importDto.minNumberOfAcceptedDataSets > 0
  ) {
    query.having(
      'COUNT(CASE WHEN microTask.task_id IS NOT NULL THEN contributes.id END) >= :minCount',
      { minCount: importDto.minNumberOfAcceptedDataSets },
    );
  }

  if (importDto.limit) {
    query.take(importDto.limit);
  }

  return await query.getRawMany();
}
}
