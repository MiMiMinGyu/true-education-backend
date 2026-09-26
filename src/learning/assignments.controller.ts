import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { StudentGuard } from '../auth/guards/role.guards';
import { DRAWING_MAX_BYTES } from '../common/constants/learning.constants';
import { BookMakingService } from './book-making.service';
import {
  ChoiceAttemptDto,
  OrderingAttemptDto,
  SaveReadingPageDto,
  SaveReflectionDto,
  SaveTitleDto,
} from './dto/learning-requests.dto';
import {
  ChoiceAttemptResponseDto,
  OrderingAttemptResponseDto,
  OrderingResponseDto,
  QuestionDto,
  ReadingResponseDto,
  SaveDrawingResponseDto,
  SaveReadingPageResponseDto,
  SaveReflectionResponseDto,
  SaveTitleResponseDto,
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
    private readonly bookMakingService: BookMakingService,
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

  @ApiOperation({
    summary: '제목 짓기',
    description: '정답·평가 없음. 저장하면 그림 그리기 단계로 넘어갑니다.',
  })
  @ApiOkResponse({ type: SaveTitleResponseDto })
  @ApiBadRequestResponse({ description: '제목이 비었거나 50자 초과' })
  @ApiConflictResponse({ description: '제목 짓기 단계가 아님' })
  @Put('title')
  saveTitle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveTitleDto,
  ): Promise<SaveTitleResponseDto> {
    return this.bookMakingService.saveTitle(id, dto.title);
  }

  @ApiOperation({
    summary: '표지 그림 업로드',
    description:
      'multipart 필드명 image. PNG/WebP만(파일 시그니처로 확인), 최대 2MB. 저장하면 설명 말하기 단계로 넘어갑니다.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: { image: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: SaveDrawingResponseDto })
  @ApiBadRequestResponse({ description: '파일이 없거나 PNG/WebP가 아님' })
  @ApiPayloadTooLargeResponse({ description: '2MB 초과' })
  @ApiConflictResponse({ description: '그림 그리기 단계가 아님' })
  @Post('drawing')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: DRAWING_MAX_BYTES, files: 1 },
    }),
  )
  saveDrawing(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() image: { buffer: Buffer } | undefined,
  ): Promise<SaveDrawingResponseDto> {
    if (!image) throw new BadRequestException('image 파일이 필요합니다.');
    return this.bookMakingService.saveDrawing(id, image.buffer);
  }

  @ApiOperation({
    summary: '설명 말하기 저장',
    description:
      '브라우저 음성 인식으로 받아 적은 글과 말한 시간만 받습니다(음성은 보내지 않음). 마지막 단계라 저장과 함께 책을 완료하고 스탬프를 적립합니다.',
  })
  @ApiCreatedResponse({ type: SaveReflectionResponseDto })
  @ApiBadRequestResponse({ description: '입력 형식 오류(2,000자·2분 초과 등)' })
  @ApiUnprocessableEntityResponse({
    description: '받아 적은 글이 비어 있음(다시 말하기)',
  })
  @ApiConflictResponse({ description: '설명 말하기 단계가 아님' })
  @Post('reflection')
  saveReflection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveReflectionDto,
  ): Promise<SaveReflectionResponseDto> {
    return this.bookMakingService.saveReflection(
      id,
      dto.transcript,
      dto.durationMs,
    );
  }
}
