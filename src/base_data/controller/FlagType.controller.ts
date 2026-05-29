import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiResponse,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { FlagTypeService } from '../service/FlagType.service';
import {
  CreateRejectionTypeDto,
  UpdateRejectionTypeDto,
} from '../dto/RejectionType.dto';
import { PaginationDto } from 'src/common/dto/Pagination.dto';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guard/role.guard';
import { FlagTypeSanitized } from '../sanitize';
import { PaginatedResult } from 'src/utils/paginate.util';
import { Role } from 'src/auth/decorators/roles.enum';
import { Roles } from 'src/auth/decorators/roles.decorator';
@Controller('/setting/flag-type')
@ApiTags('Flag Type')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FlagTypeController {
  constructor(private readonly flagTypeService: FlagTypeService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  async create(
    @Body() rejectionTypeData: CreateRejectionTypeDto,
    @Request() req,
  ) {
    return this.flagTypeService.create({
      ...rejectionTypeData,
      created_by: req.user.id,
    });
  }
  @Get('paginate')
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'Paginate Countries' })
  @ApiExtraModels(PaginatedResult, FlagTypeSanitized)
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(FlagTypeSanitized) },
            },
          },
        },
      ],
    },
  })
  async findPaginate(@Query() paginationDto: PaginationDto) {
    const data = await this.flagTypeService.findPaginate(paginationDto);
    return {
      ...data,
      result: data.result.map((item) => FlagTypeSanitized.from(item)),
    };
  }

  @Get()
  async findAll(@Query() query: UpdateRejectionTypeDto , @Request() req) {
    const data = await this.flagTypeService.findAll(query);
    const user = req.user;

    return data.map((item) => FlagTypeSanitized.from(item, user.preferred_language));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.flagTypeService.findOne({ id });
    if (!data) {
      throw new NotFoundException(`FlagType #${id} not found`);
    }
    return FlagTypeSanitized.from(data);
  }

  @Put(':id')
  @ApiBearerAuth()
  async update(
    @Param('id') id: string,
    @Body() rejectionTypeData: UpdateRejectionTypeDto,
    @Request() request,
  ) {
    return this.flagTypeService.update(id, {
      ...rejectionTypeData,
      updated_by: request.user.id,
    });
  }

  // @Post('add-alternative-name/:id')
  // async addAlternativeName(
  //   @Param('id') id: string,
  //   @Body() addLanguage: AddLanguageDto,
  //   @Request() request,
  // ) {
  //   return this.flagTypeService.addAlternativeName(
  //     id,
  //     addLanguage.language_key,
  //     addLanguage.alternative_name,
  //   );
  // }
  // @Put('update-alternative-name/:id')
  // async updateAlternativeName(
  //   @Param('id') id: string,
  //   @Body() addLanguage: AddLanguageDto,
  //   @Request() request,
  // ) {
  //   return this.flagTypeService.updateAlternativeName(id,addLanguage.language_key,addLanguage.alternative_name);
  // }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.flagTypeService.remove(id);
  }
}
