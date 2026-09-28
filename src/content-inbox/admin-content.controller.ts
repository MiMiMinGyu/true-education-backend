import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AiStoryImportService,
  type StoryImportStatus,
} from './ai-story-import.service';
import { ContentStockService } from './content-stock.service';
import {
  ContentImportResultDto,
  ContentStockDto,
} from './dto/content-inbox.dto';
import { ContentApiKeyGuard } from './guards/content-api-key.guard';

const HTTP_STATUS: Record<StoryImportStatus, number> = {
  CREATED: HttpStatus.CREATED,
  UPDATED: HttpStatus.OK,
  DRY_RUN: HttpStatus.OK,
  SKIPPED_ASSIGNED: HttpStatus.CONFLICT,
  SKIPPED: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID: HttpStatus.BAD_REQUEST,
};

@ApiTags('admin')
@ApiSecurity('contentApiKey')
@ApiUnauthorizedResponse({ description: 'X-API-Key가 없거나 틀림' })
@UseGuards(ContentApiKeyGuard)
@Controller('admin')
export class AdminContentController {
  constructor(
    private readonly importer: AiStoryImportService,
    private readonly stock: ContentStockService,
  ) {}

  @ApiOperation({
    summary: '동화 JSON 받기(AI 파트 → 서버)',
    description:
      'AI 파트 동화 JSON 1개를 받아 변환·검증 후 저장합니다(content:import와 같은 규칙). 받은 원본과 결과는 content_import_logs에 남습니다. ' +
      '같은 id면 갱신하고, 이미 학생에게 배정된 책은 바꾸지 않습니다(409, 덮어쓰기는 서버 명령줄 --force로만).',
  })
  @ApiBody({
    schema: { type: 'object' },
    description: 'AI 파트 동화 JSON(docs/samples/good-brothers.json 형식)',
  })
  @ApiResponse({
    status: 201,
    type: ContentImportResultDto,
    description: '새 책',
  })
  @ApiResponse({
    status: 200,
    type: ContentImportResultDto,
    description: '갱신',
  })
  @ApiResponse({
    status: 400,
    type: ContentImportResultDto,
    description: '검증 실패(errors)',
  })
  @ApiResponse({
    status: 409,
    type: ContentImportResultDto,
    description: '이미 배정된 책이라 바꾸지 않음',
  })
  @ApiResponse({
    status: 422,
    type: ContentImportResultDto,
    description: 'meta.rule_check.passed가 false',
  })
  @Post('books')
  async receive(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ContentImportResultDto> {
    const result = await this.importer.importJson(body, { source: 'API' });
    const status = HTTP_STATUS[result.status];
    if (status >= 400) throw new HttpException(result, status);
    res.status(status);
    return result;
  }

  @ApiOperation({
    summary: '동화 재고',
    description: `전체 동화 수와, 아직 배정받지 않은 책이 기준 이하인 학생 수. AI 파트가 직접 확인할 때 씁니다(부족하면 알림도 자동으로 감).`,
  })
  @ApiOkResponse({ type: ContentStockDto })
  @Get('content/stock')
  async stockSummary(): Promise<ContentStockDto> {
    return this.stock.summary();
  }
}
