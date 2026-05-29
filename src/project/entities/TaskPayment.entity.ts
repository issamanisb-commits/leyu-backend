import { Task } from 'src/project/entities/Task.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class TaskPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Task, (task) => task.payment)
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @Column()
  task_id: string;

  @Column({type:'float'})
  contributor_credit_per_microtask: number;

  @Column({type:'float'})
  reviewer_credit_per_microtask: number;

  @Column({ nullable: true })
  status: string;

  @Column({ nullable: true })
  created_by: string;

  @Column({ nullable: true })
  updated_by: string;

  @CreateDateColumn()
  created_date: Date;

  @UpdateDateColumn()
  updated_date: Date;
}
