import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { PaginationService } from 'src/common/service/pagination.service';
import { QueryOptions } from 'src/utils/queryOption.util';
import { PaginationDto } from 'src/common/dto/Pagination.dto';
import { DataSet } from '../entities/DataSet.entity';
import { FlagReason } from '../entities/FlagReason.entity';
import { PaginatedResult } from 'src/utils/paginate.util';
@Injectable()
export class FlagReasonService {
  constructor(
    @InjectRepository(FlagReason)
    private readonly flagReasonRepository: Repository<FlagReason>,

    private readonly paginateService: PaginationService<FlagReason>,
  ) {
    this.paginateService = new PaginationService<FlagReason>(
      this.flagReasonRepository,
    );
  }

  async create(
    flagReason: Partial<FlagReason>,
    queryRunner?: QueryRunner,
  ): Promise<FlagReason> {
    if (queryRunner) {
      const manager = queryRunner.manager;
      const data = manager.create(FlagReason, flagReason);
      return await manager.save(FlagReason, data);
    } else {
      const manager = this.flagReasonRepository;
      const data = manager.create(flagReason);
      return await manager.save(data);
    }
  }

  async createBulk(
    flagReasons: Partial<FlagReason>[],
    queryRunner?: QueryRunner,
  ): Promise<FlagReason[]> {
    if (queryRunner) {
      const manager = queryRunner.manager;
      const data = manager.create(FlagReason, flagReasons);
      return await manager.save(FlagReason, data);
    } else {
      const data = this.flagReasonRepository.create(flagReasons);
      return await this.flagReasonRepository.save(data);
    }
  }

  async findAll(
    queryOption: QueryOptions<FlagReason>,
    queryRunner?: QueryRunner,
  ): Promise<FlagReason[]> {
    const options: any = {
      where: queryOption.where,
      order: queryOption.order || {},
      relations: queryOption.relations || [],
    };
    if (queryOption.select) {
      options.select = queryOption.select;
    }
    const manager = queryRunner
      ? queryRunner.manager
      : this.flagReasonRepository;
    return await manager.find(options);
  }

  async findPaginate(
    queryOption: QueryOptions<DataSet>,
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<FlagReason>> {
    const options: any = {
      where: queryOption.where,
      order: queryOption.order || {},
      relations: queryOption.relations || [],
    };
    if (queryOption.select) {
      options.select = queryOption.select;
    }
    return await this.paginateService.paginateWithOptionQuery(
      paginationDto,
      'flag_reason',
      queryOption,
    );
  }

  async findOne(
    queryOption: QueryOptions<DataSet>,
    queryRunner?: QueryRunner,
  ): Promise<FlagReason | null> {
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
      return await manager.findOne(FlagReason, options);
    }

    const manager = this.flagReasonRepository;
    return await manager.findOne(options);
  }

  async update(
    id: string,
    dataSet: Partial<FlagReason>,
    queryRunner?: QueryRunner,
  ): Promise<FlagReason | null> {
    if (queryRunner) {
      const manager = queryRunner.manager;
      await manager.update(FlagReason, id, dataSet);
      return await manager.findOne(FlagReason, { where: { id } });
    } else {
      const manager = this.flagReasonRepository;
      await manager.update(id, dataSet);
      return await manager.findOne({ where: { id } });
    }
  }

  async remove(id: string): Promise<void> {
    await this.flagReasonRepository.delete(id);
    return;
  }
}
