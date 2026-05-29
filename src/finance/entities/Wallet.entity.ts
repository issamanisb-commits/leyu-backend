import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/User.entity';

@Entity('wallet')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  balance: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  held_balance: number;

  @Column({ nullable: true })
  created_by: string;

  @Column({ nullable: true })
  updated_by: string;

  @CreateDateColumn()
  created_date: Date;

  @UpdateDateColumn()
  updated_date: Date;

  // Wallet belongs to User
  @OneToOne(() => User, (user) => user.wallet)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({})
  user_id: string;

  // HMAC-SHA256 of "balance:held_balance"  verified before every write (Requirement 4.x)
  @Column({ nullable: true })
  integrity_hash: string;
}
