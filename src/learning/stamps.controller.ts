import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StudentGuard } from '../auth/guards/role.guards';
import type { SessionUser } from '../auth/interfaces/session-user.interface';
import { StampTotalResponseDto } from './dto/responses/learning-responses.dto';
import {
  LEARNING_REPOSITORY,
  type ILearningRepository,
} from './interfaces/learning-repository.interface';

@ApiTags('stamps')
@ApiCookieAuth('connect.sid')
@ApiUnauthorizedResponse({ description: '로그인이 필요함' })
@ApiForbiddenResponse({ description: '학생 계정이 아님' })
@UseGuards(StudentGuard)
@Controller('students/me')
export class StampsController {
  constructor(
    @Inject(LEARNING_REPOSITORY)
    private readonly repository: ILearningRepository,
  ) {}

  @ApiOperation({
    summary: '내 스탬프 수',
    description: '책을 완료할 때마다 서버가 적립한 스탬프의 합계입니다.',
  })
  @ApiOkResponse({ type: StampTotalResponseDto })
  @Get('stamps')
  async stamps(
    @CurrentUser() user: SessionUser,
  ): Promise<StampTotalResponseDto> {
    return { total: await this.repository.sumStamps(user.userId) };
  }
}
