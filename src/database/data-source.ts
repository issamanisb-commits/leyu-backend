process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { DataSource } from 'typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SeederOptions } from 'typeorm-extension';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
const configService = new ConfigService();
ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true });
const schema = configService.get<string>('DATABASE_SCHEMA');
export const dataSourceOptions: PostgresConnectionOptions & SeederOptions = {
  type: 'postgres',
  url: configService.get<string>('DATABASE_URL'), // Use ConfigService process.env.DATABASE_URL,
  schema: schema,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  migrationsRun: process.env.NODE_ENV === 'production',
  seeds: [__dirname + '/../seeds/*{.ts,.js}'], //
  synchronize:false, //process.env.NODE_ENV === 'development',   //true, // Set this to false for production use
  connectTimeoutMS: 20000,
  logging: false,
  ssl: process.env.NODE_ENV === 'production',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
