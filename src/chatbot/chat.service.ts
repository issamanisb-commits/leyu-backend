import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, catchError } from 'rxjs';
import { AxiosError } from 'axios';
import { AskQuestionDto, ChatResponseDto } from './dto/ask-question.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly apiUrl = 'http://196.189.51.209:8100/api/v1/ask';

  constructor(private readonly httpService: HttpService) {}

  async ask(dto: AskQuestionDto): Promise<ChatResponseDto> {
    const payload = {
      question: dto.question,
      max_sources: dto.max_sources ?? 5,
      min_similarity: dto.min_similarity ?? 0.5,
    };

    this.logger.log(`Sending question to external API: "${payload.question}"`);

    const { data } = await firstValueFrom(
      this.httpService
        .post<ChatResponseDto>(this.apiUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
        .pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `External API error: ${error.message}`,
              error.response?.data,
            );

            const status =
              error.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

            const message =
              (error.response?.data as any)?.detail ??
              (error.response?.data as any)?.message ??
              error.message ??
              'Failed to reach the chat API';

            throw new HttpException({ message, status }, status);
          }),
        ),
    );

    this.logger.log(`Received response from external API`);
    return data;
  }
}