import { IsString, IsNotEmpty, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AskQuestionDto {
  @ApiProperty({
    description: 'The question to ask',
    example: 'Akkam jirta ?',
  })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiPropertyOptional({
    description: 'Maximum number of sources to return',
    example: 5,
    default: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  max_sources?: number = 5;

  @ApiPropertyOptional({
    description: 'Minimum similarity threshold (0.0 - 1.0)',
    example: 0.5,
    default: 0.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  min_similarity?: number = 0.5;
}

export class ChatResponseDto {
  @ApiProperty({ description: 'The answer from the API' })
  answer: string;

  @ApiPropertyOptional({ description: 'Sources used to generate the answer' })
  sources?: any[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  metadata?: Record<string, any>;
}