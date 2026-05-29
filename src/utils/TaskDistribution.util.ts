import { MicroTaskStatistics } from 'src/task_distribution/enitities/MicroTaskStatistics.entity';
import { ContributorMicroTasksConstantStatus } from './constants/ContributorMicroTasks.constant';
import { GENDER_CONSTANT } from './constants/Gender.constant';

export const distributeTaskAmongNewContributors = (
  contributor_ids: {contributor_id: string, submission_count: string}[],
  micro_task_statistics: MicroTaskStatistics[],
  task_id: string,
  expected_micro_task_for_contributor: number,
  expected_no_of_contributors_per_micro_task: number,
  batch: number,
  dead_line?: Date,
): {
  contributor_micro_tasks: {
    contributor_id: string;
    micro_task_ids: string[];
    status: string;
    task_id: string;
    expected_micro_task_for_contributor: number;
    total_micro_tasks: number;
    batch: number;
    dead_line: Date | undefined;
  }[];
  micro_task_statistics: MicroTaskStatistics[];
} => {
  const contributor_micro_tasks: {
    contributor_id: string;
    micro_task_ids: string[];
    status: string;
    task_id: string;
    expected_micro_task_for_contributor: number;
    total_micro_tasks: number;
    batch: number;
    dead_line: Date | undefined;
  }[] = [];
  let micro_task_index = 0;

  for (let index = 0; index < contributor_ids.length; index++) {
    let micro_task_count = contributor_ids[index].submission_count ? parseInt(contributor_ids[index].submission_count) : 0;
    let iterator = 0;
    const contributor_micro_task_ids: string[] = [];

    while (iterator < micro_task_statistics.length) {
      if (micro_task_count >= expected_micro_task_for_contributor) {
        break;
      }
      if (
        micro_task_statistics[micro_task_index].no_of_contributors <
        expected_no_of_contributors_per_micro_task
      ) {
        contributor_micro_task_ids.push(
          micro_task_statistics[micro_task_index].micro_task_id,
        );
        micro_task_statistics[micro_task_index].no_of_contributors++;
        micro_task_count++;
      }

      micro_task_index++;
      iterator++;
      if (micro_task_index >= micro_task_statistics.length) {
        micro_task_index = 0;
      }
    }

    contributor_micro_tasks.push({
      contributor_id: contributor_ids[index].contributor_id,
      micro_task_ids: contributor_micro_task_ids,
      task_id: task_id,
      status: ContributorMicroTasksConstantStatus.NEW,
      expected_micro_task_for_contributor: expected_micro_task_for_contributor,
      total_micro_tasks: contributor_micro_task_ids.length,
      batch: batch,
      dead_line: dead_line,
    });
  }
  return { contributor_micro_tasks, micro_task_statistics };
};
export const distributeTaskAmongNewContributorsGenderBased = (
  contributor_ids: { id: string; gender: string }[],
  micro_task_statistics: MicroTaskStatistics[],
  task_id: string,
  expected_micro_task_for_contributor: number,
  expected_no_of_contributors_per_micro_task: number,
  batch: number,
  male_expected_no_of_contributor: number,
  female_expected_no_of_contributor: number,
  dead_line: Date | undefined,
): {
  contributor_micro_tasks: {
    contributor_id: { id: string; gender: string };
    micro_task_ids: string[];
    status: string;
    task_id: string;
    gender: string;
    expected_micro_task_for_contributor: number;
    total_micro_tasks: number;
    batch: number;
    dead_line: Date | undefined;
  }[];
  micro_task_statistics: MicroTaskStatistics[];
} => {
  const contributor_micro_tasks: {
    contributor_id: { id: string; gender: string };
    micro_task_ids: string[];
    status: string;
    task_id: string;
    expected_micro_task_for_contributor: number;
    total_micro_tasks: number;
    batch: number;
    gender: string;
    dead_line: Date | undefined;
  }[] = [];
  let micro_task_index = 0;
  for (let index = 0; index < contributor_ids.length; index++) {
    let micro_task_count = 0;
    let iterator = 0;
    const contributor_micro_task_ids: string[] = [];
    while (iterator < micro_task_statistics.length) {
      if (micro_task_count >= expected_micro_task_for_contributor) {
        break;
      }
      if (
        micro_task_statistics[iterator].no_of_contributors <
        expected_no_of_contributors_per_micro_task
      ) {
        // check if the contributor gender matches the expected no of gender
        if (
          contributor_ids[index].gender === GENDER_CONSTANT.MALE &&
          micro_task_statistics[iterator].total_male <
            male_expected_no_of_contributor
        ) {
          contributor_micro_task_ids.push(
            micro_task_statistics[iterator].micro_task_id,
          );
          micro_task_statistics[iterator].no_of_contributors++;
          micro_task_count++;
          micro_task_statistics[iterator].total_male++;
        } else if (
          contributor_ids[index].gender === GENDER_CONSTANT.FEMALE &&
          micro_task_statistics[iterator].total_female <
            female_expected_no_of_contributor
        ) {
          contributor_micro_task_ids.push(
            micro_task_statistics[iterator].micro_task_id,
          );
          micro_task_statistics[iterator].no_of_contributors++;
          micro_task_count++;
          micro_task_statistics[iterator].total_female++;
        }
      }

      micro_task_index++;

      if (micro_task_index >= micro_task_statistics.length) {
        micro_task_index = 0;
      }
      iterator++;
    }
    contributor_micro_tasks.push({
      contributor_id: contributor_ids[index],
      micro_task_ids: contributor_micro_task_ids,
      task_id: task_id,
      status: ContributorMicroTasksConstantStatus.NEW,
      expected_micro_task_for_contributor: expected_micro_task_for_contributor,
      total_micro_tasks: contributor_micro_task_ids.length,
      batch: batch,
      dead_line: dead_line,
      gender: contributor_ids[index].gender,
    });
  }
  return { contributor_micro_tasks, micro_task_statistics };
};
