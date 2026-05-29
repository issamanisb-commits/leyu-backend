# Leyu API

A comprehensive data collection and task management platform built with NestJS, designed for managing crowdsourced data collection projects with multi-language support and role-based access control.

## Overview

Leyu API is a robust backend system that facilitates collaborative data collection projects. It enables organizations to create projects, define tasks, and manage contributors, reviewers, and facilitators in a structured workflow. The platform supports multiple languages and dialects, making it ideal for linguistic data collection and annotation projects.

## Key Features

### 🎯 Project & Task Management
- **Project Creation**: Create and manage data collection projects with detailed metadata
- **Task Distribution**: Automated task assignment to contributors based on skills and availability
- **Micro-task System**: Break down large tasks into manageable micro-tasks for efficient processing
- **Progress Tracking**: Real-time monitoring of project completion status

### 👥 User Management & Roles
- **Multi-role Support**: Contributors, Reviewers, Facilitators, and Project Managers
- **User Scoring System**: Performance-based scoring and reputation management
- **Geographic Organization**: Users organized by regions, zones, and administrative areas
- **Skill-based Assignment**: Task distribution based on user expertise and language proficiency

### 🌍 Multi-language Support
- **Language Management**: Support for multiple languages and dialects
- **Localized Content**: Language-specific task instructions and content
- **Regional Customization**: Adapt content based on geographic regions

### 📊 Data Collection & Quality Control
- **Dataset Management**: Structured data collection with validation and quality checks
- **Review Workflow**: Multi-stage review process with approval/rejection mechanisms
- **Flag System**: Quality control through flagging and review processes
- **Audio Support**: Handle audio data with duration tracking and file management

### 💰 Financial Management
- **Payment System**: Integrated wallet and transaction management
- **Contributor Compensation**: Automated payment processing for completed tasks
- **Financial Tracking**: Comprehensive transaction history and reporting

### 📱 Communication & Notifications
- **SMS Integration**: Multi-provider SMS support (Geez SMS, Afro Message)
- **Email Notifications**: Automated email communications
- **Activity Logging**: Comprehensive audit trail of user activities

## Architecture

### Core Modules

- **Auth Module**: JWT-based authentication, user management, and role-based access control
- **Project Module**: Project lifecycle management and task orchestration
- **Data Set Module**: Data collection, validation, and quality assurance
- **Task Distribution Module**: Intelligent task assignment and workload balancing
- **Finance Module**: Payment processing, wallet management, and transaction tracking
- **Communication Module**: Multi-channel messaging and notification system
- **Base Data Module**: Master data management for languages, dialects, and geographic regions
- **Statistics Module**: Analytics and reporting capabilities
- **Cache Module**: Redis-based caching and background job processing

### Technology Stack

- **Framework**: NestJS (Node.js)
- **Database**: PostgreSQL with TypeORM
- **Cache & Queue**: Redis with BullMQ
- **Authentication**: JWT with Passport
- **File Storage**: MinIO (S3-compatible)
- **Email**: Nodemailer with Gmail integration
- **SMS**: Multiple providers (Geez SMS, Afro Message)
- **Push Notifications**: Firebase Admin SDK
- **Payment**: Santim Pay integration
- **API Documentation**: Swagger/OpenAPI
- **Validation**: Zod schemas with class-validator

## Prerequisites

- Node.js (v20 or higher)
- PostgreSQL (v12 or higher)
- Redis (v7 or higher)
- MinIO or S3-compatible storage

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd leyu-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Configure the following environment variables:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/leyu_db"
   DATABASE_SCHEMA="public"
   
   # JWT Configuration
   JWT_SECRET="your-secret-key"
   JWT_EXPIRES_IN="24h"
   JWT_REFRESH_EXPIRES_IN="10d"
   
   # Redis
   REDIS_URL="redis://localhost:6379"
   
   # MinIO/S3 Storage
   MINIO_ENDPOINT="localhost:9000"
   MINIO_ACCESS_KEY="your-access-key"
   MINIO_SECRET_KEY="your-secret-key"
   MINIO_BUCKET="leyu-bucket"
   
   # Email Configuration
   EMAIL_USER="your-email@gmail.com"
   EMAIL_PASS="your-app-password"
   
   # SMS Providers

   AFRO_SMS_BASE_URL="https://api.afromessage.com/api"
   AFRO_TOKEN="your-afro-token"
   
   # Payment Gateway
   SANTIM_PAY_MERCHANT_ID="your-merchant-id"
   SANTIM_PAY_PRIVATE_KEY_IN_PEM="your-private-key"
   ```

4. **Database Setup**
   ```bash
   # Run migrations
   npm run migration:run
   
   # Seed initial data
   npm run seed
   ```

## Development

### Running the Application

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run start:prod

# Debug mode
npm run start:debug
```

The API will be available at `http://localhost:3000/api`

### API Documentation

Access the interactive API documentation at:
- **Swagger UI**: `http://localhost:3000/doc`

### Database Operations

```bash
# Generate new migration
npm run migration:generate

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Create new seed
npm run seed:create

# Run seeds
npm run seed:run
```

### Testing

```bash
# Unit tests
npm run test

# End-to-end tests
npm run test:e2e

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format
```

## Docker Deployment

### Using Docker Compose

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Environment Variables for Docker

Create a `.env` file with Docker-specific configurations:

```env
DC_BACK_IMAGE_NAME=leyu-api
DC_BACK_IMAGE_TAG=latest
DC_BACK_APP_PORT=3000
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - User logout

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `GET /api/tasks/:id` - Get task details
- `PUT /api/tasks/:id` - Update task
- `POST /api/tasks/:id/assign` - Assign task to user

### Data Sets
- `GET /api/data-sets` - List data sets
- `POST /api/data-sets` - Submit data set
- `GET /api/data-sets/:id` - Get data set details
- `PUT /api/data-sets/:id/review` - Review data set
- `POST /api/data-sets/:id/flag` - Flag data set

### Users
- `GET /api/users` - List users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile
- `GET /api/users/:id/statistics` - Get user statistics

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: Fine-grained permissions system
- **Input Validation**: Comprehensive request validation using Zod
- **Rate Limiting**: API rate limiting to prevent abuse
- **CORS Configuration**: Configurable cross-origin resource sharing
- **SQL Injection Protection**: TypeORM query builder protection
- **Password Hashing**: Bcrypt password encryption

## Performance Optimizations

- **Redis Caching**: Intelligent caching strategy for frequently accessed data
- **Database Indexing**: Optimized database queries with proper indexing
- **Background Jobs**: Asynchronous processing using BullMQ
- **Connection Pooling**: Efficient database connection management
- **Response Compression**: Gzip compression for API responses

## Monitoring & Health Checks

- **Health Endpoint**: `/api/health` - Application health status
- **Database Health**: Database connectivity monitoring
- **Redis Health**: Cache service monitoring
- **Custom Metrics**: Application-specific performance metrics

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write comprehensive tests for new features
- Update documentation for API changes
- Follow the existing code style and conventions
- Ensure all tests pass before submitting PR

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   - Verify PostgreSQL is running
   - Check database credentials in `.env`
   - Ensure database exists and is accessible

2. **Redis Connection Issues**
   - Verify Redis server is running
   - Check Redis URL configuration
   - Ensure Redis is accessible from the application

3. **File Upload Issues**
   - Verify MinIO/S3 configuration
   - Check bucket permissions
   - Ensure storage service is accessible

4. **SMS/Email Issues**
   - Verify provider credentials
   - Check API endpoints and tokens
   - Review rate limits and quotas

## License

This project is licensed under the UNLICENSED License - see the package.json file for details.

## Support

For support and questions, please contact the development team or create an issue in the repository.