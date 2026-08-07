import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { seedCountries, seedRegions, seedRejectionTypes, seedLanguages, seedDialects } from './seed.helper';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('Loading seed ...');

  try { await seedCountries(dataSource); } catch (e) { console.log('Countries already seeded, skipping...'); }
  try { await seedRegions(dataSource); } catch (e) { console.log('Regions already seeded, skipping...'); }
  try { await seedRejectionTypes(dataSource); } catch (e) { console.log('Rejection types already seeded, skipping...'); }
  try { await seedLanguages(dataSource); } catch (e) { console.log('Languages already seeded, skipping...'); }
  try { await seedDialects(dataSource); } catch (e) { console.log('Dialects already seeded, skipping...'); }

  console.log('Seeding completed successfully!');
  await app.close();
}

bootstrap();
