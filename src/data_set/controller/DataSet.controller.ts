import {
  Controller,
  Get,
  Body,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiExtraModels,
  getSchemaPath,
  ApiProperty,
} from '@nestjs/swagger';
import {
  FindContributorDatasetDto,
  GetDataSetDto,
  TaskSubmissionsDto,
  UpdateDataSetDto,
} from '../dto/DataSet.dto';
import { PaginationDto } from 'src/common/dto/Pagination.dto';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/auth/decorators/roles.enum';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guard/role.guard';
import { DataSetService } from '../service/DataSet.service';
import { FindOptionsWhere } from 'typeorm';
import { DataSet } from '../entities/DataSet.entity';
import { PaginatedResult } from 'src/utils/paginate.util';
import { DataSetSanitize } from '../sanitize';
import { DataSetDetailRto } from '../rto/DataSet.rto'; // <-- Add this import if DataSetDetailsRto is defined there
@Controller('workspace/data-set')
@ApiTags('DataSet')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@ApiExtraModels(PaginatedResult, DataSetSanitize)
export class DataSetController {
  constructor(
    private readonly dataSetService: DataSetService, // create a query runner for transaction
  ) {}

  @Get()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER, Role.CONTRIBUTOR)
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(DataSetSanitize) },
            },
          },
        },
      ],
    },
  })
  async findPaginate(
    @Query() searchSchem: GetDataSetDto,
    @Request() req,
  ): Promise<PaginatedResult<DataSetSanitize>> {
    const page = searchSchem.page;
    const limit = searchSchem.limit;
    delete searchSchem.page;
    delete searchSchem.limit;
    const searchFilter: FindOptionsWhere<DataSet> = {};
    for (const [key, value] of Object.entries(searchSchem)) {
      if (value !== undefined && value !== null) {
        searchFilter[key] = value;
      }
    }
    const data = await this.dataSetService.findPaginate(
      { where: searchFilter },
      { page, limit },
    );
    const result = data.result.map((item) => DataSetSanitize.from(item));
    return {
      ...data,
      result,
    };
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.CONTRIBUTOR)
  @ApiResponse({
    status: 200,
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(DataSetSanitize) },
    },
  })
  async findAll(@Request() req) {
    const data = await this.dataSetService.findAll({});
    return data.map((item) => DataSetSanitize.from(item));
  }
  @Get('contributor/my-data-sets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CONTRIBUTOR)
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(DataSetSanitize) },
            },
          },
        },
      ],
    },
  })
  async contributorDataSets(
    @Query() paginateDto: PaginationDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    const data = await this.dataSetService.findPaginate(
      { where: { contributor_id: user_id } },
      paginateDto,
    );
    const result = data.result.map((item) => DataSetSanitize.from(item));
    return {
      ...data,
      result,
    };
  }

  @Get('contributor/:micro_task_id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CONTRIBUTOR)
  @ApiResponse({
    description: 'get contributor submission details',
    status: 200,
  })
  contributorSubmission(
    @Param('micro_task_id', ParseUUIDPipe) microTaskId: string,
    @Request() req,
  ) {
    const user = req.user;
    return this.dataSetService.contributorSubmission(microTaskId, user.id);
  }

  @Get('task/:task_id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER, Role.FACILITATOR)
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(DataSetSanitize) },
            },
          },
        },
      ],
    },
  })
  async findByTask(
    @Param('task_id', ParseUUIDPipe) task_id: string,
    @Query() submissionDto: TaskSubmissionsDto,
  ) {
    const data = await this.dataSetService.getTaskDataSetsSubmissions(
      task_id,
      submissionDto,
    );
    const result = data.result.map((item) => DataSetSanitize.from(item));
    return {
      ...data,
      result,
    };
  }

  @Get('micro_task/:micro_task_id')
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(DataSetSanitize) },
            },
          },
        },
      ],
    },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    Role.ADMIN,
    Role.SUPER_ADMIN,
    Role.PROJECT_MANAGER,
    Role.REVIEWER,
    Role.CONTRIBUTOR,
  )
  async findByMicroTask(
    @Param('micro_task_id', ParseUUIDPipe) id: string,
    @Query() searchSchem: GetDataSetDto,
    @Request() req,
  ) {
    const page = searchSchem.page;
    const limit = searchSchem.limit;
    delete searchSchem.page;
    delete searchSchem.limit;
    const searchFilter: FindOptionsWhere<DataSet> = {};
    for (const [key, value] of Object.entries(searchSchem)) {
      if (value !== undefined && value !== null) {
        searchFilter[key] = value;
      }
    }
    searchFilter['micro_task_id'] = id;
    const data = await this.dataSetService.findPaginate(
      {
        where: searchFilter,
        relations: {
          microTask: true,
        },
      },
      { page, limit },
    );

    const result = data.result.map((item) => DataSetSanitize.from(item));
    return {
      ...data,
      result,
    };
  }
  @Get('/facilitator/contributor/submissions/:task_id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.FACILITATOR)
  async getContributorDataSets(
    @Param('task_id', ParseUUIDPipe) task_id: string,
    @Query() query: FindContributorDatasetDto,
    @Request() req,
  ) {
    return this.dataSetService.getTaskDataSetsSubmissionsPerContributor(
      task_id,
      query.contributor_id,
      { page: query.page, limit: query.limit },
    );
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER)
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.dataSetService.findOne({
      where: { id },
      relations: { microTask: true, rejectionReasons: { rejectionType: true } },
    });
  }

  @Get('details/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER, Role.QA)
  @ApiProperty({
    description: 'Get DataSet details with all review history and comments',
  })
  @ApiResponse({
    type: DataSetDetailRto,
  })
  async findOneDetails(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.dataSetService.getDetails(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dataDto: UpdateDataSetDto,
    @Request() req,
  ) {
    return this.dataSetService.update(id, {
      ...dataDto,
      updated_by: req.user.id,
    });
  }
}
