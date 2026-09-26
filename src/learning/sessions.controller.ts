import { Controller, Get, UseGuards } from '@nestjs/common';
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
import { TodayResponseDto } from './dto/responses/learning-responses.dto';
import { SessionsService } from './sessions.service';

@ApiTags('learning')
@ApiCookieAuth('connect.sid')
@ApiUnauthorizedResponse({ description: '로그인이 필요함' })
@ApiForbiddenResponse({ description: '학생 계정이 아님' })
@UseGuards(StudentGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @ApiOperation({
    summary: '오늘의 학습(오솔길)',
    description:
      '진행 중인 책이 있으면 이어서, 없으면 새 책을 배정합니다. 오늘 이미 1권을 완료했으면 DONE, 배정할 책이 없으면 NO_BOOK.',
  })
  @ApiOkResponse({ type: TodayResponseDto })
  @Get('today')
  today(@CurrentUser() user: SessionUser): Promise<TodayResponseDto> {
    return this.sessionsService.today(user.userId);
  }
}
