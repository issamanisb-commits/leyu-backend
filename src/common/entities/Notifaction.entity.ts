import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type NotificationType =
  | 'task-assign'
  | 'task-rejected'
  | 'task-approved'
  | 'task-progress-reminder'
  | 'reviewer-queue-alert'
  | 'reviewer-batch-assigned'
  | 'wallet-withdrawal-success'
  | 'wallet-withdrawal-failed'
  | 'password-changed'
  | 'referral-signup';

@Entity()
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @Column({ nullable: true })
  role_id: string;

  @Column()
  title: string;

  @Column()
  message: string;

  @Column({
    enum: [
      'task-assign',
      'task-rejected',
      'task-approved',
      'task-progress-reminder',
      'reviewer-queue-alert',
      'reviewer-batch-assigned',
      'wallet-withdrawal-success',
      'wallet-withdrawal-failed',
      'password-changed',
      'referral-signup',
    ],
  })
  type: NotificationType;

  @Column({ default: false })
  is_read: boolean;

  @Column({ default: false })
  is_actionable: boolean;

  @Column({ nullable: true })
  action_url: string;

  @Column({ nullable: true })
  created_by: string;

  @Column({ nullable: true })
  updated_by: string;

  @CreateDateColumn()
  created_date: Date;

  @UpdateDateColumn()
  updated_date: Date;
}
