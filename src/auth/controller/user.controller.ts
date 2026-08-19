import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UsePipes,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Put,
  Patch,
  ParseUUIDPipe,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { UserService } from '../service/User.service';
import {
  CreateUserDto,
  SignUpDto,
  VerifyAccountDto,
  ChangePasswordDto,
  UserSearchWithSpecificRoleDto,
  FirstContributorUpdateDto,
  GetUsersFilterDto,
  GetContributorFilterDto,
  UpdateProfileDto,
  UpdateUserDto,
  UpdatePreferredLanguageDto,
  UpdateReferralCode,
  UserExistDto,
  // findUserQuerySchema,
} from '../dto/User.dto';
import {
  Between,
  DataSource,
  FindOptionsWhere,
  ILike,
  QueryRunner,
} from 'typeorm';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guard/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
// import { OtpThrottlerGuard } from 'src/auth/guard/otp-throttler.guard';

import { FileInterceptor } from '@nestjs/platform-express';

import { RolesGuard } from 'src/auth/guard/role.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../decorators/roles.enum';
import { multerImageS3Storage } from 'src/config/minio.config';
import { QueryOptions } from 'src/utils/queryOption.util';
import { User } from '../entities/User.entity';
import { ActivityLogService } from 'src/common/service/ActivityLog.service';
import {
  ActivityEntityType,
  ActivityLogActions,
} from 'src/utils/constants/ActivityLog.actions';
import {
  RoleSanitizedFields,
  UserSanitize,
  UserSanitizedFields,
} from '../sanitize';

import { PaginatedResult } from 'src/utils/paginate.util';
import { FileService } from 'src/common/service/File.service';
@ApiTags('Users')
@ApiBearerAuth()
@Controller('iam/users')
export class UsersController {
  constructor(
    private readonly usersService: UserService,
    private readonly fileService: FileService,
    private readonly activityLogService: ActivityLogService,
    private readonly dataSource: DataSource, // Inject DataSource for transactions
  ) {
    this.usersService = usersService;
  }
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async create(@Body() body: CreateUserDto) {
    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Call UserService to create user
      const user = await this.usersService.create(body, queryRunner);
      // Commit transaction if everything is successful
      await queryRunner.commitTransaction();
      user.password = '_'; // Remove password from response
      return user;
    } catch (error) {
      await queryRunner.rollbackTransaction(); // Rollback on failure
      throw error;
    } finally {
      if (queryRunner) {
        try {
          await queryRunner.release();
        } catch (releaseError) {
          console.error('Error releasing queryRunner:', releaseError);
        }
      }
    }
  }

  @Post('sign-up')
  // @UseGuards(OtpThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 6000 } })
  async SignUp(@Body() body: SignUpDto) {
    try {
      const user = await this.usersService.signUp(body.phone_number);
      // Commit transaction if everything is successful
      return user;
    } catch (error) {
      throw error;
    }
  }
  @Post('verify/:id')
  async verifyUser(@Param('id') id: string, @Body() body: VerifyAccountDto) {
    return this.usersService.verifyAccount(id, body.code, body.phone);
  }

  @Patch('preferred-language')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updatedPreferredLanguage(
    @Body() body: UpdatePreferredLanguageDto,
    @Request() req,
  ) {
    const user = req.user;
    return this.usersService.updatedPreferredLanguage(
      user.id,
      body.language_key,
    );
  }
  @Patch('')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        national_id: {
          type: 'string',
          format: 'binary',
        },
        first_name: {
          type: 'string',
        },
        middle_name: {
          type: 'string',
        },
        last_name: {
          type: 'string',
        },
        email: {
          type: 'string',
        },
        password: {
          type: 'string',
        },
        birth_date: {
          type: 'string',
          format: 'date',
        },
        gender: {
          type: 'string',
          enum: ['Male', 'Female'],
        },
        city: {
          type: 'string',
        },
        woreda: {
          type: 'string',
        },
        dialect_id: {
          type: 'string',
        },
        language_id: {
          type: 'string',
        },
        regional_id: {
          type: 'string',
        },
        zone_id: {
          type: 'string',
        },
        referral_code: {
          type: 'string',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('national_id', { storage: multerImageS3Storage }),
  )
  async firstUpdate(
    @UploadedFile() file: any,
    @Body()
    body: FirstContributorUpdateDto,
    @Request() req,
  ) {
    const user_id = req.user.id;
    let national_id = undefined;
    const file_key = file?.key ?? undefined;
    if (file_key) {
      national_id = file_key;
    }
    return this.usersService.firstUpdate(user_id, { ...body, national_id });
  }

  @Get('me')
  @ApiResponse({ status: 200, type: UserSanitize })
  @UseGuards(JwtAuthGuard, RolesGuard)
  async findMe(@Request() req): Promise<UserSanitize> {
    const id = req.user.id; // Assuming the user ID is stored in the request object
    return this.usersService.getUserProfile(id);
  }
  @Get('my-score')
  @ApiResponse({ status: 200 })
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getMyScore(@Request() req): Promise<{ score: number }> {
    const id = req.user.id; // Assuming the user ID is stored in the request object
    return this.usersService.getMyScore(id);
  }

  @Get('all')
  @ApiResponse({ status: 200, type: [UserSanitize] })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async findAll(@Query() query: any) {
    const user = await this.usersService.findMany({ where: query });
    return user.map((user) => UserSanitize.from(user));
  }

  @Get('/project-manager')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER)
  @ApiExtraModels(PaginatedResult, UserSanitize)
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(UserSanitize) },
            },
          },
        },
      ],
    },
  })
  async findProjectManagerPaginate(
    @Query() searchSchema: UserSearchWithSpecificRoleDto,
  ) {
    let search = searchSchema.search;
    const query: QueryOptions<User> = { relations: { projects: true } };
    query.where = [];
    if (search) {
      search = search.trim();
      query.where = [
        { email: ILike(`%${search}%`) },
        { first_name: ILike(`%${search}%`) },
        { last_name: ILike(`%${search}%`) },
        { phone_number: ILike(`%${search}%`) },
      ];
    }
    const result = await this.usersService.findProjectManagersPaginate(query, {
      page: searchSchema.page,
      limit: searchSchema.limit,
    });
    return {
      ...result,
      result: result.result.map((item) => UserSanitize.from(item)),
    };
  }
  @Get('/reviewer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER)
  @ApiExtraModels(PaginatedResult, UserSanitize)
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(UserSanitize) },
            },
          },
        },
      ],
    },
  })
  async findReviewerPaginate(
    @Query() searchSchema: UserSearchWithSpecificRoleDto,
  ) {
    let search: string | undefined = searchSchema.search;
    const query: QueryOptions<User> = { relations: { role: true } };
    query.where = [];
    if (search) {
      // prepare search query for email , firstname and lastname and phone number
      search = search.trim();
      query.where = [
        { email: ILike(`%${search}%`) },
        { first_name: ILike(`%${search}%`) },
        { last_name: ILike(`%${search}%`) },
        { phone_number: ILike(`%${search}%`) },
      ];
    }

    const data = await this.usersService.findReviewersPaginate(query, {
      page: searchSchema.page,
      limit: searchSchema.limit,
    });

    return {
      ...data,
      result: data.result.map((item) => UserSanitize.from(item)),
    };
  }
  @Get('/contributor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER, Role.REVIEWER)
  @ApiExtraModels(PaginatedResult, UserSanitize)
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(UserSanitize) },
            },
          },
        },
      ],
    },
  })
  async findContributorPaginate(
    @Query() searchSchema: GetContributorFilterDto,
  ) {
    let search: string | undefined = searchSchema.search;
    const page = searchSchema.page;
    const limit = searchSchema.limit;

    // Clean up
    delete searchSchema.page;
    delete searchSchema.limit;
    delete searchSchema.search;

    const baseFilters: FindOptionsWhere<User> = {};
    const searchFilters: FindOptionsWhere<User>[] = [];

    // Build exact match filters from searchSchema
    for (const [key, value] of Object.entries(searchSchema)) {
      if (value !== undefined && value !== null) {
        if (
          [
            'is_active',
            'role_id',
            'gender',
            'language_id',
            'dialect_id',
          ].includes(key)
        ) {
          baseFilters[key] = value;
        } else {
          baseFilters[key] = ILike(`%${value}%`);
        }
      }
    }

    // Build search filter if applicable
    if (search) {
      search = search.trim();
      searchFilters.push(
        { ...baseFilters, email: ILike(`%${search}%`) },
        { ...baseFilters, first_name: ILike(`%${search}%`) },
        { ...baseFilters, last_name: ILike(`%${search}%`) },
        { ...baseFilters, phone_number: ILike(`%${search}%`) },
      );
    }

    const query: QueryOptions<User> = {
      relations: { role: true, region: true, zone: true },
      where: search ? searchFilters : baseFilters,
    };
    const result = await this.usersService.findContributorsPaginate(query, {
      page: page,
      limit: limit,
    });

    return {
      ...result,
      result: result.result.map((item) => UserSanitize.from(item)),
    };
  }
  @Get('/facilitator')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER, Role.REVIEWER)
  @ApiExtraModels(PaginatedResult, UserSanitize)
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(UserSanitize) },
            },
          },
        },
      ],
    },
  })
  async findFacilitatorPaginate(
    @Query() searchSchema: UserSearchWithSpecificRoleDto,
  ) {
    let search: string | undefined = searchSchema.search;
    const query: QueryOptions<User> = { relations: { role: true } };
    query.where = [];
    if (search) {
      // prepare search query for email , firstname and lastname and phone number
      search = search.trim();
      query.where = [
        { email: ILike(`%${search}%`) },
        { first_name: ILike(`%${search}%`) },
        { last_name: ILike(`%${search}%`) },
        { phone_number: ILike(`%${search}%`) },
      ];
    }
    const data = await this.usersService.findFacilitatorPaginate(query, {
      page: searchSchema.page,
      limit: searchSchema.limit,
    });

    return {
      ...data,
      result: data.result.map((item) => UserSanitize.from(item)),
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiExtraModels(PaginatedResult, UserSanitize)
  @ApiResponse({
    status: 200,
    schema: {
      allOf: [
        { $ref: getSchemaPath(PaginatedResult) },
        {
          properties: {
            result: {
              type: 'array',
              items: { $ref: getSchemaPath(UserSanitize) },
            },
          },
        },
      ],
    },
  })
  async findPaginate(@Query() searchSchema: GetUsersFilterDto) {
    let search: string | undefined = searchSchema.search;
    const page = searchSchema.page;
    const limit = searchSchema.limit;

    // Clean up
    delete searchSchema.page;
    delete searchSchema.limit;
    delete searchSchema.search;

    const baseFilters: FindOptionsWhere<User> = {};
    const searchFilters: FindOptionsWhere<User>[] = [];

    // Build exact match filters from searchSchema
    for (const [key, value] of Object.entries(searchSchema)) {
      if (value !== undefined && value !== null) {
        if (
          [
            'is_active',
            'role_id',
            'gender',
            'language_id',
            'dialect_id',
          ].includes(key)
        ) {
          baseFilters[key] = value;
        } else if (
          searchSchema.created_start_date &&
          searchSchema.created_end_date
        ) {
          baseFilters['created_date'] = Between(
            searchSchema.created_start_date,
            searchSchema.created_end_date,
          );
        } else {
          baseFilters[key] = ILike(`%${value}%`);
        }
      }
    }

    // Build search filter if applicable
    if (search) {
      search = search.trim();
      searchFilters.push(
        { ...baseFilters, email: ILike(`%${search}%`) },
        { ...baseFilters, first_name: ILike(`%${search}%`) },
        { ...baseFilters, last_name: ILike(`%${search}%`) },
        { ...baseFilters, phone_number: ILike(`%${search}%`) },
      );
    }

    const query: QueryOptions<User> = {
      relations: {
        role: true,
        region: true,
        zone: true,
        language: true,
        dialect: true,
      },
      where: search ? searchFilters : baseFilters,
    };
    // Debug output
    const data = await this.usersService.findPaginate(query, { page, limit });

    return data;
  }
  @Put('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateProfile(
    @Body() updateData: UpdateProfileDto,
    @UploadedFile() file: any,
    @Request() req,
  ) {
    const user_id = req.user.id;
    const user = await this.usersService.updateProfile(user_id, updateData);
    await this.activityLogService.create({
      user_id: req.user.id,
      action: ActivityLogActions.UPDATE_PROFILE,
      metadata: '',
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      entity_type: ActivityEntityType.USER,
      entity_id: '',
    });
    return user;
  }

  @Put('profile')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
   @UseInterceptors(FileInterceptor('image', { 
    storage: multerImageS3Storage ,
    limits:{
      fileSize:5 * 1024 * 1024
    }, // 5 MB,
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
      ];

      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            'Only JPEG, PNG, and WebP images are allowed',
          ),
          false,
        );
      }
    }

  }))
  async updateProfilePicture(@UploadedFile() file: any, @Request() request) {
    const file_key = file.key;
    const user_id = request.user.id;
    if (file_key) {
      const user = await this.usersService.update(user_id, {
        profile_picture: file_key,
        updated_by: request.user.id,
      });
      const preSigned = await this.fileService.getPreSignedUrl(file_key);
      return { ...user, profile_picture: preSigned };
    } else {
      return 'file not found';
    }
  }

  @Patch('national_id')
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
   @UseInterceptors(FileInterceptor('image', { 
    storage: multerImageS3Storage ,
    limits:{
      fileSize:5 * 1024 * 1024
    }, // 5 MB,
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
      ];

      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            'Only JPEG, PNG, and WebP images are allowed',
          ),
          false,
        );
      }
    }

  }))
  async updateNationalIdInage(@UploadedFile() file: any, @Request() request) {
    const file_key = file.key;
    const user_id = request.user.id;
    if (file_key) {
      return await this.usersService.uploadNationalId(user_id, file_key);
    } else {
      return 'file not found';
    }
  }
  @Patch('referral_code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updateReferralCode(@Body() body: UpdateReferralCode, @Request() req) {
    const user = req.user;
    return this.usersService.updateReferralCode(user.id, body.referral_code);
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async changePassword(@Body() body: ChangePasswordDto, @Request() req) {
    const user = req.user;
    await this.activityLogService.create({
      user_id: req.user.id,
      action: ActivityLogActions.CHANGE_PASSWORD,
      metadata: '',
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      entity_type: ActivityEntityType.USER,
      entity_id: '',
    });
    return this.usersService.changePassword(
      user.id,
      body.current_password,
      body.new_password,
    );
  }
  @Put('activate-toggle/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async activatToggle(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() request,
  ) {
    return this.usersService.activateToggle(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async update(
    @Param('id') id: string,
    @Body() userData: UpdateUserDto,
    @Request() request,
  ) {
    return this.usersService.update(id, {
      ...userData,
      updated_by: request.user.id,
    });
  }
  @Get('/exist')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER)
  async validateIfUserAlreadyExist(@Query() data: UserExistDto) {
    const exist = await this.usersService.validateIfUserAlreadyExist(
      data.email,
      data.role_id,
    );
    return { exist };
  }
  @Get('/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne({
      where: { id },
      select: { ...UserSanitizedFields, role: RoleSanitizedFields },
    });
  }
}
