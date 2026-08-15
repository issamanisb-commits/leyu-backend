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

const formatEndpoint = (url?: string) => {
  if (!url) return undefined;
  return url.startsWith('http://') || url.startsWith('https://') 
    ? url 
    : `https://${url}`;
};

const accessKeyId = configService.get<string>('MINIO_ACCESS_KEY');
const secretAccessKey = configService.get<string>('MINIO_SECRET_KEY');

if (!accessKeyId || !secretAccessKey) {
  console.warn('⚠️ WARNING: MINIO_ACCESS_KEY or MINIO_SECRET_KEY is missing from environment variables!');
}

export const s3 = new S3Client({
  endpoint: formatEndpoint(configService.get<string>('MINIO_ENDPOINT')),
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
  region: configService.get<string>('AWS_REGION') || 'eu-west-1',
  forcePathStyle: true,
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
