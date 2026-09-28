import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParentGuard } from '../auth/guards/role.guards';
import type { SessionUser } from '../auth/interfaces/session-user.interface';
import { RewardBoardDto, SetRewardDto } from '../rewards/dto/rewards.dto';
import { RewardsService } from '../rewards/rewards.service';
import { DashboardService } from './dashboard.service';
import {
  DashboardDto,
  DashboardQueryDto,
  LinkedStudentDto,
} from './dto/parents.dto';
import { LinkedStudentGuard } from './guards/linked-student.guard';
import {
  PARENT_REPOSITORY,
  type IParentRepository,
} from './interfaces/parent-repository.interface';

@ApiTags('parents')
@ApiCookieAuth('connect.sid')
@ApiUnauthorizedResponse({ description: '로그인이 필요함' })
@ApiForbiddenResponse({
  description: '보호자 계정이 아니거나 연결되지 않은 학생',
})
@UseGuards(ParentGuard)
@Controller('parents/me/students')
export class ParentsController {
  constructor(
    @Inject(PARENT_REPOSITORY)
    private readonly repository: IParentRepository,
    private readonly dashboardService: DashboardService,
    private readonly rewardsService: RewardsService,
  ) {}

  @ApiOperation({ summary: '연결된 자녀 목록' })
  @ApiOkResponse({ type: [LinkedStudentDto] })
  @Get()
  students(@CurrentUser() user: SessionUser): Promise<LinkedStudentDto[]> {
    return this.repository.listStudents(user.userId);
  }

  @ApiOperation({
    summary: '자녀 학습 대시보드',
    description:
      'AI 파트 명세 v3. 기간(기본 최근 14일) 안에 완료한 책으로 영역별 상태(함께 연습·연습하며 관찰·스스로 해결·기록 부족·판정 불가·활동 없음)를 판정하고, 표시할 문구를 함께 돌려줍니다.',
  })
  @ApiOkResponse({ type: DashboardDto })
  @ApiBadRequestResponse({
    description: '날짜 형식 오류, 시작일 > 종료일, 92일 초과',
  })
  @UseGuards(LinkedStudentGuard)
  @Get(':studentId/dashboard')
  dashboard(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardDto> {
    return this.dashboardService.dashboard(studentId, query);
  }

  @ApiOperation({
    summary: '자녀 보상판',
    description: '누적 스탬프 5개마다 정한 보상과 달성 여부.',
  })
  @ApiOkResponse({ type: RewardBoardDto })
  @UseGuards(LinkedStudentGuard)
  @Get(':studentId/rewards')
  rewards(
    @Param('studentId', ParseIntPipe) studentId: number,
  ): Promise<RewardBoardDto> {
    return this.rewardsService.board(studentId);
  }

  @ApiOperation({
    summary: '보상 등록·수정',
    description:
      '목표치(5의 배수)의 보상 글을 정합니다. 달성한 뒤에도 아이에게 전하기 전까지는 바꿀 수 있고, 선물한 뒤에는 바꿀 수 없습니다.',
  })
  @ApiOkResponse({ type: RewardBoardDto, description: '갱신된 보상판' })
  @ApiBadRequestResponse({
    description: '목표치가 5의 배수가 아니거나 글이 비었음',
  })
  @ApiConflictResponse({ description: '이미 선물한 보상' })
  @UseGuards(LinkedStudentGuard)
  @Put(':studentId/rewards/:milestone')
  setReward(
    @CurrentUser() user: SessionUser,
    @Param('studentId', ParseIntPipe) studentId: number,
    @Param('milestone', ParseIntPipe) milestone: number,
    @Body() dto: SetRewardDto,
  ): Promise<RewardBoardDto> {
    return this.rewardsService.set(user.userId, studentId, milestone, dto.name);
  }

  @ApiOperation({
    summary: '보상 삭제',
    description:
      '아이에게 전하기 전까지 지울 수 있습니다. 없는 보상을 지워도 204입니다.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ description: '목표치가 5의 배수가 아님' })
  @ApiConflictResponse({ description: '이미 선물한 보상' })
  @UseGuards(LinkedStudentGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':studentId/rewards/:milestone')
  deleteReward(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Param('milestone', ParseIntPipe) milestone: number,
  ): Promise<void> {
    return this.rewardsService.remove(studentId, milestone);
  }

  @ApiOperation({
    summary: '보상 선물했어요',
    description:
      '보호자가 아이에게 보상을 전했다고 기록합니다(givenAt). 보상을 정했고 스탬프를 다 모은 목표치만 되며, 다시 눌러도 처음 시각이 유지됩니다.',
  })
  @ApiOkResponse({ type: RewardBoardDto, description: '갱신된 보상판' })
  @ApiNotFoundResponse({ description: '정해 둔 보상이 없음' })
  @ApiConflictResponse({ description: '아직 스탬프를 다 모으지 않음' })
  @UseGuards(LinkedStudentGuard)
  @Put(':studentId/rewards/:milestone/given')
  markRewardGiven(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Param('milestone', ParseIntPipe) milestone: number,
  ): Promise<RewardBoardDto> {
    return this.rewardsService.markGiven(studentId, milestone);
  }

  @ApiOperation({
    summary: '보상 선물 기록 취소',
    description: '선물했어요를 잘못 눌렀을 때 되돌립니다.',
  })
  @ApiOkResponse({ type: RewardBoardDto, description: '갱신된 보상판' })
  @ApiNotFoundResponse({ description: '정해 둔 보상이 없음' })
  @UseGuards(LinkedStudentGuard)
  @Delete(':studentId/rewards/:milestone/given')
  unmarkRewardGiven(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Param('milestone', ParseIntPipe) milestone: number,
  ): Promise<RewardBoardDto> {
    return this.rewardsService.unmarkGiven(studentId, milestone);
  }
}
