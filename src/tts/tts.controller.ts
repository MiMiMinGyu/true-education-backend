import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { StudentGuard } from '../auth/guards/role.guards';
import { LINE_ID_MAX_LENGTH } from '../common/constants/content.constants';
import { TtsService } from './tts.service';

export class TtsResponseDto {
  @ApiProperty({
    example: 'http://localhost:4000/files/tts/3/p001-1-1a2b3c4d.mp3',
  })
  audioUrl: string;
}

@ApiTags('tts')
@ApiCookieAuth('connect.sid')
@ApiUnauthorizedResponse({ description: '로그인이 필요함' })
@ApiForbiddenResponse({ description: '학생 계정이 아님' })
@UseGuards(StudentGuard)
@Controller('books/:bookId/lines/:lineId')
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @ApiOperation({
    summary: '여울이 차례 줄 음성',
    description:
      '처음 요청 시 Typecast로 만들어 저장하고 이후에는 재사용합니다. 실패(503)해도 학습은 음성 없이 진행할 수 있어야 합니다.',
  })
  @ApiOkResponse({ type: TtsResponseDto })
  @ApiBadRequestResponse({ description: '학생 차례 줄' })
  @ApiNotFoundResponse({ description: '책 또는 줄이 없음' })
  @ApiServiceUnavailableResponse({ description: '음성을 불러오지 못했어요' })
  @Get('tts')
  async tts(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Param('lineId') lineId: string,
  ): Promise<TtsResponseDto> {
    if (lineId.length > LINE_ID_MAX_LENGTH) {
      throw new BadRequestException('잘못된 줄 id입니다.');
    }
    return { audioUrl: await this.ttsService.audioUrl(bookId, lineId) };
  }
}
