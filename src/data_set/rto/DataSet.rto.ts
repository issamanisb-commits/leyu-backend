import { ApiProperty } from '@nestjs/swagger';
import { DataSet } from '../entities/DataSet.entity';

class ReviewsRto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  reviewer_id: string;
  @ApiProperty()
  score: number;
  @ApiProperty()
  reviewer_name: string;

  @ApiProperty()
  reviewer_email: string;

  @ApiProperty()
  review_status: string;
  @ApiProperty()
  comment: string;
  @ApiProperty()
  rejection_reason: string[];

  @ApiProperty()
  flag_reason: string[];
  @ApiProperty()
  annotations: string[];
}
class MicroTaskRto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  code: string;
  @ApiProperty()
  is_test: boolean;
  @ApiProperty()
  instruction: string;
  @ApiProperty()
  file_path: string;
  @ApiProperty()
  text: string;
  @ApiProperty()
  type: string;
}

export class DataSetDetailRto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  code: string;
  @ApiProperty()
  text_data_set: string;
  @ApiProperty()
  status: string;

  @ApiProperty()
  qa_status: string;

  @ApiProperty()
  is_test: boolean;
  @ApiProperty()
  audio_duration: number;
  @ApiProperty()
  file_path: string;
  @ApiProperty()
  type: string;
  @ApiProperty()
  created_date: string | Date;

  @ApiProperty({ type: MicroTaskRto })
  micro_task: MicroTaskRto;
  @ApiProperty({ type: ReviewsRto })
  reviews: ReviewsRto[];
  @ApiProperty()
  total_reviews: number;
  @ApiProperty()
  expected_reviews: number;

  static from(
    dataSet: DataSet,
    totalReviews: number,
    expectedReviews: number,
  ): DataSetDetailRto {
    const dataSetDetailRto = new DataSetDetailRto();
    dataSetDetailRto.id = dataSet.id;
    dataSetDetailRto.code = dataSet.code;
    dataSetDetailRto.text_data_set = dataSet.text_data_set;
    dataSetDetailRto.status = dataSet.status;
    dataSetDetailRto.is_test = dataSet.is_test;
    dataSetDetailRto.audio_duration = dataSet.audio_duration;
    dataSetDetailRto.file_path = dataSet.file_path;
    dataSetDetailRto.type = dataSet.type;
    dataSetDetailRto.created_date = dataSet.created_date;
    dataSetDetailRto.qa_status = dataSet.qa_review_status;
    ((dataSetDetailRto.micro_task = {
      id: dataSet.microTask.id,
      code: dataSet.microTask.code,
      is_test: dataSet.microTask.is_test,
      instruction: dataSet.microTask.instruction,
      file_path: dataSet.microTask.file_path,
      text: dataSet.microTask.text,
      type: dataSet.microTask.type,
    }),
      (dataSetDetailRto.reviews = dataSet.dataSetReviews.map((review) => {
        return {
          id: review.id,
          reviewer_id: review.reviewer.id,
          score: review.reviewer?.score?.score || 0,
          reviewer_name:
            review.reviewer?.first_name +
            ' ' +
            review.reviewer?.middle_name +
            ' ' +
            review.reviewer?.last_name,
          reviewer_email: review.reviewer?.email,
          review_status: review.status,
          comment: review.comment,
          rejection_reason: review?.rejectionReasons.map((rejectionReason) => {
            return rejectionReason.rejectionType.name;
          }),
          flag_reason: review?.flagReasons?.map((flagReason) => {
            return flagReason.flagType?.name;
          }),
          annotations: review?.annotations.map((annotation) => {
            return annotation.name;
          }),
        };
      })));
    dataSetDetailRto.total_reviews = totalReviews;
    dataSetDetailRto.expected_reviews = expectedReviews;
    return dataSetDetailRto;
  }
}
