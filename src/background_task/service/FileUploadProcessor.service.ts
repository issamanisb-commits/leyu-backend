import { Processor, WorkerHost } from '@nestjs/bullmq';
import { createReadStream, unlink } from 'fs';
import { promisify } from 'util';
import { DataSetService } from 'src/data_set/service/DataSet.service';
import { FileService } from 'src/common/service/File.service';
import { promises as fs } from 'fs';
import { Job } from 'bullmq';
import { CacheService } from 'src/cache/CacheService.service';
export const unlinkAsync = promisify(unlink);
import * as mm from 'music-metadata';

@Processor('file-upload', {
  concurrency: 1, //  ensures one-by-one upload
})
export class FileUploadProcessor extends WorkerHost {
  constructor(
    private readonly fileService: FileService,
    private readonly dataSetService: DataSetService,
    private readonly cacheService: CacheService,
  ) {
    super();
  }

  /**
   * Process a job for uploading an audio file to MinIO.
   * The job data should contain the following properties:
   * - path: the path to the audio file to be uploaded
   * - filename: the name of the audio file
   * - mimetype: the MIME type of the audio file
   * - dataSetId: the ID of the data set to which the audio file belongs
   * If the upload is successful, the queue status of the data set will be updated to 'completed' and the file path will be added to the data set.
   * If the upload fails, the queue status of the data set will be updated to 'failed'.
   * @param job - the job to be processed
   * @param token - an optional token for authentication
   * @returns a promise that resolves to void
   */
 
async process(
  job: Job<{
    path: string;
    filename: string;
    mimetype: string;
    dataSetId: string;
  }>,
  token?: string,
): Promise<void> {
  const data = job.data;
  try {
    await fs.access(data.path);

    // ── Extract audio duration before streaming ──────────────────────────
    // const metadata = await mm.parseFile(data.path,{
    //   duration:true
    // });
    // const durationInSeconds = metadata.format.duration ?? 0;
    const stream = createReadStream(data.path);
    const folder = 'audios/';

    const result = await this.fileService.uploadAudioFiles(
      data.filename,
      stream,
      data.mimetype,
    );

    const filePath = folder + data.filename;

    await this.updateQueueStatus(data.dataSetId, 'completed', filePath);

    // ── Persist duration ─────────────────────────────────────────────────
    await this.dataSetService.update(data.dataSetId, {
      // audio_duration:durationInSeconds,
      file_path: filePath,
    });

    await unlinkAsync(data.path);
  } catch (e) {
    await this.dataSetService.update(data.dataSetId, {
      queue_status: 'failed',
    });
    console.error(e);
  }
}
  /**
   * Updates the queue status of a data set in the database.
   * If the data set is found, it will also update the cache.
   * @param id The id of the data set to update.
   * @param status The new queue status of the data set, either 'pending', 'completed', or 'failed'.
   * @param filePath The new file path of the data set.
   * @returns A promise resolving to void when the update is successful.
   */
  async updateQueueStatus(
    id: string,
    status: 'pending' | 'completed' | 'failed',
    filePath: string,
  ): Promise<void> {
    await this.dataSetService.update(id, {
      queue_status: status,
      file_path: filePath,
    });
    const d = await this.dataSetService.findOne({
      where: { id },
      select: {
        id: true,
        contributor_id: true,
        micro_task_id: true,
        microTask: { id: true, task_id: true },
      },
      relations: { microTask: true },
    });
    if (d) {
      await this.cacheService.updateDataSetFilPathAndQueueStatus(
        d.contributor_id,
        d.microTask.task_id,
        d.id,
        d.micro_task_id,
        filePath,
      );
    }
  }
}
