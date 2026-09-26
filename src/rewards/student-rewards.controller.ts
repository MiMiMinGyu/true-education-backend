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
import { RewardBoardDto } from './dto/rewards.dto';
import { RewardsService } from './rewards.service';

@ApiTags('rewards')
@ApiCookieAuth('connect.sid')
@ApiUnauthorizedResponse({ description: '로그인이 필요함' })
@ApiForbiddenResponse({ description: '학생 계정이 아님' })
@UseGuards(StudentGuard)
@Controller('students/me')
export class StudentRewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @ApiOperation({
    summary: '내 보상판(읽기 전용)',
    description:
      '스탬프판에서 목표치 칸을 누르면 보호자가 정한 보상을 보여 줍니다.',
  })
  @ApiOkResponse({ type: RewardBoardDto })
  @Get('rewards')
  rewards(@CurrentUser() user: SessionUser): Promise<RewardBoardDto> {
    return this.rewardsService.board(user.userId);
  }
}
