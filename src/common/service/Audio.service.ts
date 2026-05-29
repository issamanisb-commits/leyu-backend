import { Injectable } from '@nestjs/common';
import { parseFile } from 'music-metadata';

@Injectable()
export class AudioService {
  async getAudioDuration(filePath: string): Promise<number> {
    console.log('filepath:', filePath);
    // check file exists
    // if (!fs.existsSync(filePath)) {
    //   throw new Error(`File does not exist: ${filePath}`);
    // }

    // // check file size
    // const stats = fs.statSync(filePath);

    // if (stats.size === 0) {
    //   throw new Error('Uploaded file is empty');
    // }

    try {
      const metadata = await parseFile(filePath, {
        duration: true, // IMPORTANT for some mp3 files
      });

      console.log('metadata:', metadata.format);

      const duration = metadata.format.duration;

      if (!duration || isNaN(duration)) {
        return 0;
        // throw new Error('Unable to retrieve audio duration');
      }

      return parseFloat(duration.toFixed(4));
    } catch (error) {
      console.error('Audio metadata error:', error);
      throw error;
    }
  }
}