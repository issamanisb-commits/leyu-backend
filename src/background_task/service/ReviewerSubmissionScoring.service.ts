import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserScoreService } from 'src/auth/service/UserScore.service';
import { DataSet } from 'src/data_set/entities/DataSet.entity';
import { DataSetReview } from 'src/task_distribution/enitities/DataSetReview.entity';
import { ReviewerScore } from 'src/utils/constants/ActionScore.contant';
import { DataSource, QueryRunner, LessThan, In } from 'typeorm';

@Injectable()
export class ReviewerSubmissionScoringService {
  private readonly logger = new Logger(ReviewerSubmissionScoringService.name);
  constructor(
    // Inject necessary services here
    private readonly dataSource: DataSource,
    private readonly userScoreService: UserScoreService,
  ) {}
  // async onModuleInit() {
  //     await this.handleReviewSubmissionScoring();
  // }

  async getAllNonScoreGivenReviewsWithDataSet(): Promise<DataSet[]> {
    return await this.dataSource
      .getRepository(DataSet)
      .createQueryBuilder('dataset')
      .innerJoinAndSelect(
        'dataset.dataSetReviews',
        'review',
        'review.score_given IS NOT NULL',
      )
      .where('dataset.status != :pending', { pending: 'Pending' })
      .getMany();
  }
  async updateReviewerScores(
    reviewersWithUpdateScore: Map<string, number>,
    queryRunner: QueryRunner,
  ): Promise<void> {
    await this.userScoreService.updateReviewersScore(
      reviewersWithUpdateScore,
      queryRunner,
    );
  }
  async updateReviewsScoreGiven(
    reviewsWithUpdateScore: { reviewId: string; score: number }[],
    queryRunner: QueryRunner,
  ): Promise<void> {
    await Promise.all(
      reviewsWithUpdateScore.map(async ({ reviewId, score }) =>
        queryRunner.manager.update(
          DataSetReview,
          { id: reviewId },
          { score_given: score },
        ),
      ),
    );
  }
  async getExpiredReviewsWithIsExpiredFalse(): Promise<DataSetReview[]> {
    return await this.dataSource
      .getRepository(DataSetReview)
      .find({ where: { is_expired: false, expires_at: LessThan(new Date()) } });
  }
  /**
   * This function calculates and updates the reviewer scores.
   * It first gets all data sets which have reviews with no score given.
   * Then it loops through each data set and review, and if the review status is not the same as the data set status,
   * it adds the invalid review score to the reviewer's total score.
   * If the review status is the same as the data set status, it adds the valid review score to the reviewer's total score.
   * Finally, it updates the reviewer scores and the review scores given in the database.
   */
  // async calculateAndUpdateReviewerScoring(): Promise<void> {
  //   const queryRunner = this.dataSource.createQueryRunner();
  //   await queryRunner.connect();
  //   await queryRunner.startTransaction();
  //   try {
  //     const dataSets = await this.getAllNonScoreGivenReviewsWithDataSet();
  //     const reviewerScores: Map<string, number> = new Map();
  //     const reviewsWithScoreGiven: { reviewId: string; score: number }[] = [];
  //     for (const dataSet of dataSets) {
  //       for (const review of dataSet.dataSetReviews) {
  //         const reviewerId = review.reviewer_id;
  //         if (review.score_given != null) {
  //           continue;
  //         }
  //         if (
  //           review.status.toLowerCase() != dataSet.status.toLocaleLowerCase()
  //         ) {
  //           // get the review score or create one if it doesn't exist
  //           let reviewerScore = reviewerScores.get(reviewerId);
  //           if (!reviewerScore) {
  //             reviewerScore = 0;
  //             reviewerScores.set(reviewerId, reviewerScore);
  //           }
  //           reviewerScore += ReviewerScore.INVALID_REVIEW;
  //           reviewerScores.set(reviewerId, reviewerScore);
  //           reviewsWithScoreGiven.push({
  //             reviewId: review.id,
  //             score: ReviewerScore.INVALID_REVIEW,
  //           });
  //           this.logger.log(
  //             `Reviewer ${reviewerId} has a total score of ${reviewerScore} for dataset ${dataSet.id}`,
  //           );
  //         } else {
  //           // get the review score or create one if it doesn't exist
  //           let reviewerScore = reviewerScores.get(reviewerId);
  //           if (!reviewerScore) {
  //             reviewerScore = 0;
  //             reviewerScores.set(reviewerId, reviewerScore);
  //           }
  //           reviewerScore += ReviewerScore.VALID_REVIEW;
  //           reviewerScores.set(reviewerId, reviewerScore);
  //           reviewsWithScoreGiven.push({
  //             reviewId: review.id,
  //             score: ReviewerScore.VALID_REVIEW,
  //           });
  //           this.logger.log(
  //             `Reviewer ${reviewerId} has a total score of ${reviewerScore} for dataset ${dataSet.id}`,
  //           );
  //         }
  //       }
  //     }
  //     await this.updateReviewerScores(reviewerScores, queryRunner);
  //     await this.updateReviewsScoreGiven(reviewsWithScoreGiven, queryRunner);
  //     await queryRunner.commitTransaction();
  //   } catch (e) {
  //     await queryRunner.rollbackTransaction();
  //     this.logger.error(e);
  //   } finally {
  //     await queryRunner.release();
  //   }
  // }
  /**
   * Checks for expired reviews and updates the reviewer scores.
   * It first gets all reviews which have expired.
   * Then it loops through each review and adds the expired review score to the reviewer's total score.
   * Finally, it updates the reviewer scores and the review scores given in the database.
   */
  async checkExpiredReviewsAndUpdateScores(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const expiredReviews = await this.getExpiredReviewsWithIsExpiredFalse();

      if (expiredReviews.length === 0) {
        await queryRunner.commitTransaction();
        return;
      }

      const reviewersWithUpdateScore: Map<string, number> = new Map();

      for (const review of expiredReviews) {
        const reviewerId = review.reviewer_id;
        let reviewerScore = reviewersWithUpdateScore.get(reviewerId);

        if (reviewerScore === undefined) {
          // ✅ safe check  won't break on 0 or -0.5
          reviewerScore = 0;
          reviewersWithUpdateScore.set(reviewerId, reviewerScore);
        }

        reviewerScore += Number(ReviewerScore.TASK_EXPIRED);
        reviewersWithUpdateScore.set(reviewerId, reviewerScore);

        this.logger.log(
          `Reviewer ${reviewerId} score updated by ${ReviewerScore.TASK_EXPIRED} | running total: ${reviewerScore} | dataset: ${review.data_set_id}`,
        );
      }

      await this.updateReviewerScores(reviewersWithUpdateScore, queryRunner);

      // ✅ Mark only this batch as expired, with correct flag direction
      const expiredReviewIds = expiredReviews.map((review) => review.id);
      await queryRunner.manager.update(
        DataSetReview,
        { id: In(expiredReviewIds) },
        { is_expired: true },
      );

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      this.logger.error(e);
    } finally {
      await queryRunner.release();
    }
  }

  @Cron(CronExpression.EVERY_10_HOURS)
  /**
   * Handles reviewer submission scoring by calculating and updating the reviewer scores
   * and checking for expired reviews and updating the scores accordingly.
   * This function is called by a cron job every 10 hours.
   */
  async handleReviewSubmissionScoring(): Promise<void> {
    // await this.calculateAndUpdateReviewerScoring();
    await this.checkExpiredReviewsAndUpdateScores();
  }
}
