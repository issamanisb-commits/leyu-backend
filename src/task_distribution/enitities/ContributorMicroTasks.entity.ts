import { User } from 'src/auth/entities/User.entity';
import { ContributorMicroTasksConstantStatus } from 'src/utils/constants/ContributorMicroTasks.constant';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ schema: 'task_distribution', name: 'contributor_micro_tasks' })
// @Unique(['contributor_id', 'task_id'])
export class ContributorMicroTasks {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: false, type: 'uuid' })
  contributor_id: string;

  @Column({ nullable: true })
  gender: 'Male' | 'Female';

  @Column({ nullable: false, type: 'uuid' })
  task_id: string;

  @Column({ type: 'text', array: true, nullable: true })
  micro_task_ids: string[];

  @Column({
    type: 'enum',
    enum: [
      ContributorMicroTasksConstantStatus.NEW,
      ContributorMicroTasksConstantStatus.IN_PROGRESS,
      ContributorMicroTasksConstantStatus.COMPLETED,
      ContributorMicroTasksConstantStatus.EXPIRED,
    ],
    default: ContributorMicroTasksConstantStatus.NEW,
  })
  status: string;

  @Column({ type: 'integer', nullable: false })
  expected_micro_task_for_contributor: number;

  @Column({ type: 'integer', nullable: true })
  batch: number;

  @Column({ type: 'integer', default: 0 })
  current_batch: number;

  @Column({ type: 'integer', nullable: false })
  total_micro_tasks: number;

  @Column({ nullable: true })
  dead_line: Date;


  @UpdateDateColumn()
  updated_date:Date;
  
  @CreateDateColumn()
  created_date: Date;
}
