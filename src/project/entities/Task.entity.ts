import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './Project.entity';
import { TaskType } from './TaskType.entity';
import { MicroTask } from 'src/data_set/entities/MicroTask.entity';
import { Language } from 'src/base_data/entities/Language.entity';
import { UserTask } from './UserTask.entity';
import { TaskInstruction } from './TaskInstruction.entity';
import { TaskPayment } from 'src/project/entities/TaskPayment.entity';
import { TaskRequirement } from './TaskRequirement.entity';
import { InvitationLink } from './InvitationLink.entity';
import { FacilitatorContributor } from './FacilitatorContributor.entity';
import { QATaskInstruction } from './QATaskInstruction.entity';
import { ReviewerTaskInstruction } from './ReviewerTaskInstruction.entity';

@Entity('task')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  is_public: boolean;

  @Column({ default: false })
  require_contributor_test: boolean;

  @Column({ default: false })
  is_closed: boolean;

  @Column({ default: false })
  is_archived: boolean;

  @Column({ default: false })
  distribution_started: boolean;

  @Column({ nullable: true })
  contributor_completion_time_limit: number;

  @Column({ nullable: true })
  reviewer_completion_time_limit: number;

  @Column({ nullable: true })
  max_expected_no_of_contributors: number;

  @Column({ nullable: true })
  created_by: string;

  @Column({ nullable: true })
  updated_by: string;

  @CreateDateColumn()
  created_date: Date;

  @UpdateDateColumn()
  updated_date: Date;

  // Task belongsTo Project
  @ManyToOne(() => Project, (project) => project.tasks)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({})
  project_id: string;
  // Task belongsTo TaskType
  @ManyToOne(() => TaskType, (taskType) => taskType.tasks)
  @JoinColumn({ name: 'task_type_id' }) // This creates a proper foreign key column
  taskType: TaskType;

  @Column({})
  task_type_id: string;
  // Task Belongs to language
  @ManyToOne(() => Language, (language) => language.tasks)
  @JoinColumn({ name: 'language_id' }) // This creates a proper foreign key column
  language: Language;

  @Column({})
  language_id: string;
  // Task has many questions
  @OneToMany(() => MicroTask, (microTask) => microTask.task)
  microTasks: MicroTask[];

  @OneToMany(
    () => FacilitatorContributor,
    (facilitatorContributor) => facilitatorContributor.task,
  )
  facilitatorContributors: MicroTask[];

  @OneToOne(() => TaskRequirement, (taskRequirement) => taskRequirement.task)
  taskRequirement: TaskRequirement;

  // User has Many Tasks through UserTask
  // @ManyToMany(() => User, (user) => user.tasks)
  // users: User[]

  @OneToMany(() => UserTask, (userTask) => userTask.task)
  userToTasks: UserTask[];

  // Task has Many Task Instruction
  @OneToOne(() => TaskInstruction, (taskInstruction) => taskInstruction.task)
  taskInstruction: TaskInstruction;

  @OneToOne(
    () => ReviewerTaskInstruction,
    (taskInstruction) => taskInstruction.task,
  )
  reviewerInstruction: ReviewerTaskInstruction;

  @OneToOne(() => QATaskInstruction, (taskInstruction) => taskInstruction.task)
  qaInstruction: QATaskInstruction;

  // Task has one TaskPayment
  @OneToOne(() => TaskPayment, (payment) => payment.task)
  payment: TaskPayment;

  @OneToMany(() => InvitationLink, (invitationLink) => invitationLink.task)
  invitationLinks: InvitationLink[];

}
