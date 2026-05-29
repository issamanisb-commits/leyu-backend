import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { AskQuestionDto, ChatResponseDto } from './dto/ask-question.dto';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask a question',
    description:
      'Sends a question to the external AI API and returns the answer with relevant sources.',
  })
  @ApiBody({ type: AskQuestionDto })
  @ApiResponse({
    status: 200,
    description: 'Question answered successfully',
    type: ChatResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request – invalid input' })
  @ApiResponse({ status: 502, description: 'External API unreachable' })
  async ask(@Body() dto: AskQuestionDto): Promise<ChatResponseDto> {
    return this.chatService.ask(dto);
  }
}