import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryRunner, Repository } from 'typeorm';
import { UserScore } from '../entities/UserScore.entity';
import { ActionScore } from 'src/utils/constants/ActionScore.contant';
import { UserScoreDefaultPoint } from 'src/utils/constants/UserScoreAction.constant';
@Injectable()
export class UserScoreService {
  constructor(
    @InjectRepository(UserScore)
    private readonly userScoreRepository: Repository<UserScore>,
  ) {}
  async getOrCreateUserScore(user_id: string): Promise<UserScore> {
    const userScore = await this.userScoreRepository.findOne({
      where: { user_id },
    });
    if (userScore) {
      return userScore;
    }
    const newUserScore = this.userScoreRepository.create({
      user_id,
      score: UserScoreDefaultPoint,
    });
    return this.userScoreRepository.save(newUserScore);
  }

  // ): Promise<UserScore | null> {
  //   const userScore= await this.getOrCreateUserScore(user_id);
  //   userScore.score += ActionScore.SUBMIT;
  //   return await manager.save(UserScore, userScore);
  // }
  async createScore(
    user_id: string,
    queryRunner: QueryRunner,
  ): Promise<UserScore> {
    // create a manager for the query
    const manager = queryRunner.manager;
    // Check if the user score already exists
    let userScore = await manager.findOne(UserScore, { where: { user_id } });
    if (!userScore) {
      userScore = manager.create(UserScore, {
        user_id,
        score: UserScoreDefaultPoint,
      });
      return await manager.save(UserScore, userScore);
    }
    return userScore;
  }
  async reduceNoneSubmitScore(
    userIds: string[],
    queryRunner?: QueryRunner,
  ): Promise<void> {
    // create a manager for the query
    if (!queryRunner) {
      await Promise.all(
        userIds.map(async (user_id) => {
          const userScore = await this.getOrCreateUserScore(user_id);
          userScore.score = userScore.score + ActionScore.TASK_EXPIRED;
          return await this.userScoreRepository.save(userScore);
        }),
      );
     return;
    }
    const manager = queryRunner.manager;
    // Check if the user score already exists
    await Promise.all(
      userIds.map(async (user_id) => {
        const userScore = await this.getOrCreateUserScore(user_id);
        userScore.score = userScore.score + ActionScore.TASK_EXPIRED;
        return await manager.save(UserScore, userScore);
      }),
    );
  }
  async incrementReviewerScore(
    reviewerId: string,
    point: number,
    queryRunner: QueryRunner,
  ): Promise<void> {
    const manger = queryRunner.manager;
    const userScore = await this.getOrCreateUserScore(reviewerId);
    userScore.score += point;
    await manger.save(UserScore, userScore);
  }
  async reduceContributorScoreForRejectedDataSet(
    contributorId: string,
    queryRunner: QueryRunner,
  ): Promise<void> {
    const manager = queryRunner.manager;
    const userScore = await this.getOrCreateUserScore(contributorId);
    userScore.score += ActionScore.DATESET_REJECTED;
    await manager.save(UserScore, userScore);
  }
  async updateReviewersScore(
    reviewersWithUpdateScore: Map<string, number>,
    queryRunner: QueryRunner,
  ): Promise<void> {
    await Promise.all(
      Array.from(reviewersWithUpdateScore.entries()).map(
        async ([reviewerId, score]) =>
          this.incrementReviewerScore(reviewerId, score, queryRunner),
      ),
    );
  }
}
