import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryRunner, Repository } from 'typeorm';
import { QueryOptions } from 'src/utils/queryOption.util';
import { TaskRequirement } from '../entities/TaskRequirement.entity';
import { DialectService } from 'src/base_data/service';
import { UpdateTaskRequirementDto } from '../dto/Task.dto';

@Injectable()
export class TaskRequirementService {
  constructor(
    @InjectRepository(TaskRequirement)
    private readonly taskRequirementRepository: Repository<TaskRequirement>,
    private readonly dialectService: DialectService,
  ) {}

  async create(
    taskRequirementData: Partial<TaskRequirement>,
    queryRunner?: QueryRunner,
  ): Promise<TaskRequirement> {
    if (queryRunner) {
      const manager = queryRunner.manager;
      const taskRequirement = manager.create(
        TaskRequirement,
        taskRequirementData,
      );
      return await manager.save(TaskRequirement, taskRequirement);
    } else {
      const manager = this.taskRequirementRepository;
      const taskRequirement = manager.create(taskRequirementData);
      return await manager.save(taskRequirement);
    }
  }

  async findAll(
    queryOption: QueryOptions<TaskRequirement>,
    queryRunner?: QueryRunner,
  ): Promise<TaskRequirement[]> {
    return await this.taskRequirementRepository.find(queryOption);
  }

  async findOne(
    queryOption: QueryOptions<TaskRequirement>,
    queryRunner?: QueryRunner,
  ): Promise<TaskRequirement | null> {
    return await this.taskRequirementRepository.findOne(queryOption);
  }

  async update(
    id: string,
    taskRequirementData: UpdateTaskRequirementDto,
  ): Promise<TaskRequirement | null> {
    let taskDialects: { id: string; name: string }[] = [];
    console.log('taskRequirementData  ==  ', taskRequirementData.dialects);
    if (
      taskRequirementData.is_dialect_specific &&
      taskRequirementData.dialects
    ) {
      const dialects = await this.dialectService.findMany({
        id: In(taskRequirementData.dialects.map((dialect) => dialect.id)),
      });
      taskDialects = dialects.map((dialect) => ({
        id: dialect.id,
        name: dialect.name,
      }));
    }
    delete taskRequirementData.dialects;
    console.log('taskDialects  ==  ', taskDialects);
    await this.taskRequirementRepository.update(id, {
      ...taskRequirementData,
      dialects: taskDialects,
      locations: taskRequirementData.locations?.map(l => ({ name: l }))
    });
    return await this.taskRequirementRepository.findOne({ where: { id } });
  }
  async remove(id: string) {
    return await this.taskRequirementRepository.delete(id);
  }
}
