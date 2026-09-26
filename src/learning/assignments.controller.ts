import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { StudentGuard } from '../auth/guards/role.guards';
import {
  ChoiceAttemptDto,
  OrderingAttemptDto,
  SaveReadingPageDto,
} from './dto/learning-requests.dto';
import {
  ChoiceAttemptResponseDto,
  OrderingAttemptResponseDto,
  OrderingResponseDto,
  QuestionDto,
  ReadingResponseDto,
  SaveReadingPageResponseDto,
} from './dto/responses/learning-responses.dto';
import { AssignmentOwnerGuard } from './guards/assignment-owner.guard';
import { QuizService } from './quiz.service';
import { ReadingService } from './reading.service';

@ApiTags('learning')
@ApiCookieAuth('connect.sid')
@ApiUnauthorizedResponse({ description: '로그인이 필요함' })
@ApiForbiddenResponse({ description: '학생 계정이 아니거나 다른 학생의 배정' })
@ApiNotFoundResponse({ description: '배정(또는 문제·페이지)을 찾을 수 없음' })
@UseGuards(StudentGuard, AssignmentOwnerGuard)
@Controller('assignments/:id')
export class AssignmentsController {
  constructor(
    private readonly readingService: ReadingService,
    private readonly quizService: QuizService,
  ) {}

  @ApiOperation({
    summary: '번갈아 읽기 본문',
    description: '페이지당 3줄, 여울이가 먼저 한 줄씩 번갈아 읽습니다.',
  })
  @ApiOkResponse({ type: ReadingResponseDto })
  @Get('reading')
  getReading(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ReadingResponseDto> {
    return this.readingService.getReading(id);
  }

  @ApiOperation({
    summary: '읽기 페이지 저장',
    description:
      '순서대로만 저장합니다. 이미 저장한 페이지를 다시 보내면 그대로 현재 상태를 돌려줍니다. 마지막 페이지를 저장하면 다음 단계로 넘어갑니다.',
  })
  @ApiOkResponse({ type: SaveReadingPageResponseDto })
  @ApiConflictResponse({ description: '읽기 단계가 아니거나 페이지를 건너뜀' })
  @HttpCode(HttpStatus.OK)
  @Post('reading/pages/:page')
  savePage(
    @Param('id', ParseIntPipe) id: number,
    @Param('page', ParseIntPipe) page: number,
    @Body() dto: SaveReadingPageDto,
  ): Promise<SaveReadingPageResponseDto> {
    return this.readingService.savePage(id, page, dto.lines);
  }

  @ApiOperation({
    summary: '이해 질문 목록',
    description:
      '정답·힌트는 포함하지 않습니다. 이미 끝난 문제는 state에 정답을 포함합니다(이어하기).',
  })
  @ApiOkResponse({ type: [QuestionDto] })
  @ApiConflictResponse({ description: '아직 이해 질문 단계가 아님' })
  @Get('questions')
  getQuestions(@Param('id', ParseIntPipe) id: number): Promise<QuestionDto[]> {
    return this.quizService.getQuestions(id);
  }

  @ApiOperation({
    summary: '이해 질문 답 제출',
    description:
      '최대 2회. 1차 오답이면 힌트, 2차 오답이면 정답을 돌려줍니다. 시도 차수는 서버가 매깁니다.',
  })
  @ApiCreatedResponse({ type: ChoiceAttemptResponseDto })
  @ApiBadRequestResponse({ description: '보기 번호 범위 밖' })
  @ApiConflictResponse({
    description: '이해 질문 단계가 아니거나 이미 끝난 문제',
  })
  @Post('questions/:questionId/attempts')
  submitChoice(
    @Param('id', ParseIntPipe) id: number,
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() dto: ChoiceAttemptDto,
  ): Promise<ChoiceAttemptResponseDto> {
    return this.quizService.submitChoice(
      id,
      questionId,
      dto.answer,
      dto.responseTimeMs,
    );
  }

  @ApiOperation({
    summary: '순서 맞추기 문제',
    description: '카드는 서버가 섞어서 보냅니다.',
  })
  @ApiOkResponse({ type: OrderingResponseDto })
  @ApiConflictResponse({ description: '아직 순서 맞추기 단계가 아님' })
  @Get('ordering')
  getOrdering(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderingResponseDto> {
    return this.quizService.getOrdering(id);
  }

  @ApiOperation({
    summary: '순서 맞추기 제출',
    description:
      '최대 3회, 힌트 없음. 3회 오답이면 정답 순서를 돌려주고 다음 단계로 넘어갑니다.',
  })
  @ApiCreatedResponse({ type: OrderingAttemptResponseDto })
  @ApiBadRequestResponse({ description: '카드 id가 빠졌거나 중복됨' })
  @ApiConflictResponse({ description: '순서 맞추기 단계가 아니거나 이미 끝남' })
  @Post('ordering/attempts')
  submitOrdering(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OrderingAttemptDto,
  ): Promise<OrderingAttemptResponseDto> {
    return this.quizService.submitOrdering(id, dto.order, dto.responseTimeMs);
  }
}
