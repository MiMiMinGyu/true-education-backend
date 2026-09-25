import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { MeResponseDto } from './dto/responses/me-response.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import type { SessionUser } from './interfaces/session-user.interface';

@ApiTags('auth')
@Controller('me')
export class MeController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: '현재 로그인 사용자 조회',
    description:
      '프론트는 role을 보고 보호자 대시보드/학생 메인 공간으로 이동합니다. 학생이면 studentCode를 포함합니다.',
  })
  @ApiCookieAuth('connect.sid')
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ description: '로그인이 필요함' })
  @UseGuards(SessionAuthGuard)
  @Get()
  me(@CurrentUser() user: SessionUser): Promise<MeResponseDto> {
    return this.authService.getMe(user);
  }
}
