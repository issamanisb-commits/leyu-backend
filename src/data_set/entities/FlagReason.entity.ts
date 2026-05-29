import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DataSet } from './DataSet.entity';
import { FlagType } from 'src/base_data/entities/FlagType.entity';
import { DataSetReview } from 'src/task_distribution/enitities/DataSetReview.entity';

@Entity()
export class FlagReason {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  reason: string;

  @Column({ nullable: true })
  comment: string;

  @CreateDateColumn()
  created_date: Date;

  @UpdateDateColumn()
  updated_date: Date;

  // FlagReason belongs to DataSet
  @ManyToOne(() => DataSet, (dataSet) => dataSet.flagReason)
  @JoinColumn({ name: 'data_set_id' })
  dataSet: DataSet;
  @Column({ nullable: false })
  data_set_id: string;

  // FlagReason belongs to DataSetReview
  @ManyToOne(() => DataSetReview, (review) => review.flagReasons, {
    nullable: true,
  })
  @JoinColumn({ name: 'data_set_review_id' })
  dataSetReview: DataSetReview;
  @Column({ nullable: true })
  data_set_review_id: string;

  // FlagReason belongs to FlagType
  @ManyToOne(() => FlagType, (flagType) => flagType.flagReasons)
  @JoinColumn({ name: 'flag_type_id' })
  flagType: FlagType;
  @Column({ nullable: false })
  flag_type_id: string;
}
