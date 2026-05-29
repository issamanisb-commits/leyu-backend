import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from 'src/common/dto/Pagination.dto';

export class GetContributorTasksDto extends PaginationDto {
  @ApiProperty({ required: false, enum: ['RECENT', 'NEW', 'COMPLETED', 'ALL'] })
  @IsOptional()
  @IsEnum(['RECENT', 'NEW', 'COMPLETED', 'ALL'])
  status: 'RECENT' | 'NEW' | 'COMPLETED' | 'ALL';
}

export class GetQAMicroTasksDto extends PaginationDto {
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @Type(() => String)
  reviewerIds?: string[] | string;

  @ApiProperty({
    required: false,
    enum: ['Pending', 'Approved', 'Rejected', 'Flagged', 'All'],
  })
  @IsOptional()
  @IsEnum(['Pending', 'Approved', 'Rejected', 'Flagged', 'All'])
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Flagged' | 'All';

  @ApiProperty({ required: false, type:'boolean'})
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return Boolean(value); // fallback
  })
  is_uncertain?:boolean
}
