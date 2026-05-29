import { User } from 'src/auth/entities/User.entity';
import { DataSetAnnotation } from 'src/base_data/entities/DataSetAnnotation.entity';
import { DataSet } from 'src/data_set/entities/DataSet.entity';
import { FlagReason } from 'src/data_set/entities/FlagReason.entity';
import { RejectionReason } from 'src/data_set/entities/RejectionReason.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';

@Entity()
export class DataSetReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  data_set_id: string;

  @Column({ type: 'uuid' })
  task_id: string;

  @Column({ type: 'uuid' })
  reviewer_id: string;

  @Column({ enum: ['pending', 'approved', 'rejected'] })
  status: 'pending' | 'approved' | 'rejected';

  @Column({ default: false })
  is_flagged: boolean;

  @Column({ default: false })
  is_uncertain: boolean;

  @Column()
  expires_at: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  assigned_at: Date;

  @Column({ nullable: true })
  reviewed_at: Date;

  @Column({ nullable: true })
  score_given: number;

  @Column({ default: false })
  is_expired: boolean;

  @Column({ nullable: true })
  comment: string;

  @OneToMany(
    () => RejectionReason,
    (rejectionReason) => rejectionReason.dateSetReview,
  )
  rejectionReasons: RejectionReason[];

  @OneToMany(() => FlagReason, (flagReason) => flagReason.dataSetReview)
  flagReasons: FlagReason[];

  

  @ManyToOne(() => DataSet, (dataSet) => dataSet.dataSetReviews)
  @JoinColumn({ name: 'data_set_id' })
  dataSet: DataSet;

  @ManyToOne(() => User, (user) => user.dataSetReviews)
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @ManyToMany(
    () => DataSetAnnotation,
    (annotation) => annotation.dataSetReviews,
  )
  @JoinTable({
    name: 'data_set_review_annotations', // optional, defaults to table names
    joinColumn: { name: 'data_set_review_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'annotation_id', referencedColumnName: 'id' },
  })
  annotations: DataSetAnnotation[];
}
