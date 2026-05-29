import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DataSetReview } from '../enitities/DataSetReview.entity';
import {
  MicroTaskSanitize,
  RejectionReasonSanitize,
} from 'src/data_set/sanitize';
import { Transform, Type } from 'class-transformer';

export class AttemptsDto {
  @ApiProperty()
  @IsUUID()
  micro_task_id: string;

  @ApiProperty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  text_data_set: string;
}
export class CreateMultipleDataSetDto {
  @ApiProperty({ type: [AttemptsDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttemptsDto)
  attempts: AttemptsDto[];

  @ApiProperty()
  @IsBoolean()
  is_test: boolean;
}
export class ApproveDataSetDto {
  @ApiPropertyOptional({ description: 'Filter by annotation' })
  @IsArray()
  @IsOptional()
  annotationIds?: string[];

  @ApiPropertyOptional({ description: 'Set true if reviewer is uncertain about this review' })
  @IsBoolean()
  @IsOptional()
  is_uncertain?: boolean;
}

export class ReviewDetailRto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  data_set_review_id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  text_data_set: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  review_status: string;

  @ApiProperty()
  is_test: boolean;

  @ApiProperty()
  is_flagged: boolean;

  @ApiProperty()
  audio_duration: number;

  @ApiProperty()
  file_path: string;

  @ApiProperty()
  type: string;

  // TO DO
  @ApiProperty()
  annotation: string[];

  @ApiProperty()
  created_date: Date;

  @ApiProperty()
  micro_task_id: string;

  @ApiProperty({ type: MicroTaskSanitize })
  microTask?: MicroTaskSanitize;

  rejectionReasons?: RejectionReasonSanitize[];

  reviewed_at?: Date;
  static from(review: DataSetReview): ReviewDetailRto {
    return {
      id: review.dataSet.id,
      data_set_review_id: review.id,
      code: review.dataSet.code,
      text_data_set: review.dataSet.text_data_set,
      status: review.dataSet.status,
      review_status: review.status,
      is_test: review.dataSet.is_test,
      is_flagged: review.dataSet.is_flagged,
      audio_duration: review.dataSet.audio_duration,
      file_path: review.dataSet.file_path,
      type: review.dataSet.type,
      annotation: review.annotations.map((annotation) => annotation.name),
      created_date: review.dataSet.created_date,
      micro_task_id: review.dataSet.micro_task_id,
      microTask:
        review.dataSet.microTask &&
        MicroTaskSanitize.from(review.dataSet.microTask),
      rejectionReasons: review.dataSet.rejectionReasons
        ? review?.dataSet?.rejectionReasons.map((rejectionReason) =>
            RejectionReasonSanitize.from(rejectionReason),
          )
        : undefined,
      reviewed_at: review.reviewed_at,
    };
  }
}
