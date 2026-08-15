// src/config/minio.config.ts
import { ConfigModule, ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';
import { diskStorage } from 'multer';
import multer from 'multer';
import { extname } from 'path';
import crypto from 'crypto';

ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true });
const configService = new ConfigService();

export const s3 = new S3Client({
  endpoint: configService.get<string>('MINIO_ENDPOINT'),
  credentials: {
    accessKeyId: configService.get<string>('MINIO_ACCESS_KEY') as string,
    secretAccessKey: configService.get<string>('MINIO_SECRET_KEY') as string,
  },
  region: 'us-east-1',
  forcePathStyle:true // configService.get<boolean>('MINIO_S3_FORCE_PATH_STYLE', true),
});

export const multerAudioS3Storage = multerS3({
  s3: s3,
  bucket: configService.get<string>('MINIO_BUCKET'),

  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: function (req, file, cb) {
    const folder = 'audios/';
    cb(null, folder + Date.now().toString() + '-' + file.originalname);
  },
});
export const multerCSVS3Storage = multerS3({
  s3: s3,
  bucket: configService.get<string>('MINIO_BUCKET'),
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: function (req, file, cb) {
    const folder = 'csv/';
    cb(null, folder + Date.now().toString() + '-' + file.originalname);
  },
});
export const multerImageS3Storage = multerS3({
  s3: s3,
  bucket: configService.get<string>('MINIO_BUCKET'),

  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: function (req, file, cb) {
    const folder = 'image/';
    cb(null, folder + Date.now().toString() + '-' + file.originalname);
  },
});
export const multerAudioDiskConfig = {
  storage: diskStorage({
    destination: './uploads',
    filename: (_req, file, cb) => {
      const uniqueName = `${crypto.randomUUID().split('-')[0]}-${crypto.randomUUID()}${extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
};

export const multerAudioMemoryStorage = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
};
