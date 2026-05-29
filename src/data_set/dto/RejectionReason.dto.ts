import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateRejectionDto {
  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return Boolean(value); // fallback
  })
  flag: boolean;

  @ApiProperty()
  @IsArray()
  @IsUUID('all', { each: true })
  rejection_type_ids: string[];

  @ApiProperty({ required: false, description: 'Optional flag type IDs to create flag reasons' })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  flag_type_ids?: string[];

  @ApiProperty({ required: false, description: 'Set true if reviewer is uncertain about this rejection' })
  @IsBoolean()
  @IsOptional()
  is_uncertain?: boolean;

  @ApiProperty()
  @IsString()
  @IsOptional()
  comment?: string;
}

export class UpdateRejectionReasonDto {
  @ApiProperty({ type: 'array' })
  reason?: string[];

  @ApiProperty({})
  comment?: string;

  @ApiProperty({})
  rejection_type_id?: string[];
}
export class FlagReasonDto {
  @ApiProperty({ required: false })
  @IsOptional()
  reason: string;

  @ApiProperty({ required: false })
  @IsOptional()
  comment: string;

  @ApiProperty({ required: true })
  @IsUUID()
  flag_type_id: string;
}
