import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ParentGuard, StudentGuard } from '../auth/guards/role.guards';
import type { SessionUser } from '../auth/interfaces/session-user.interface';
import {
  LINK_REREQUEST_COOLDOWN_HOURS,
  MAX_PENDING_LINK_REQUESTS,
} from '../common/constants/link.constants';
import {
  CreateLinkRequestDto,
  LinkResponseDto,
  ParentLinkRequestDto,
  StudentLinkRequestDto,
} from './dto/links.dto';
import { LinksService } from './links.service';

@ApiTags('links')
@ApiCookieAuth('connect.sid')
@ApiUnauthorizedResponse({ description: '로그인이 필요함' })
@ApiForbiddenResponse({ description: '보호자 계정이 아님' })
@UseGuards(ParentGuard)
@Controller('parents/me/link-requests')
export class ParentLinksController {
  constructor(private readonly linksService: LinksService) {}

  @ApiOperation({
    summary: '아이 연결 요청(보호자)',
    description:
      '학생 코드로 아이에게 연결을 요청합니다. 아이가 수락해야 연결되며, 그 전에는 대시보드·보상에 접근할 수 없습니다. ' +
      '자녀 관련 동의 3개를 이 아이 대상으로 기록합니다.',
  })
  @ApiCreatedResponse({ type: ParentLinkRequestDto })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 필수 동의 누락' })
  @ApiNotFoundResponse({ description: '일치하는 학생 코드 없음' })
  @ApiConflictResponse({
    description: `이미 연결됨, 이미 요청함, 거절 후 ${LINK_REREQUEST_COOLDOWN_HOURS}시간 안, 그 아이의 대기 요청이 ${MAX_PENDING_LINK_REQUESTS}개 이상`,
  })
  @Post()
  request(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateLinkRequestDto,
  ): Promise<ParentLinkRequestDto> {
    return this.linksService.request(user.userId, dto);
  }

  @ApiOperation({
    summary: '보낸 연결 요청 목록(보호자)',
    description:
      '아직 연결되지 않은 요청(대기·거절)만, 최근 요청 순. 연결된 아이는 GET /parents/me/students.',
  })
  @ApiOkResponse({ type: [ParentLinkRequestDto] })
  @Get()
  list(@CurrentUser() user: SessionUser): Promise<ParentLinkRequestDto[]> {
    return this.linksService.parentRequests(user.userId);
  }

  @ApiOperation({ summary: '연결 요청 취소(보호자, 대기 중인 것만)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: '대기 중인 요청 없음' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':studentId')
  cancel(
    @CurrentUser() user: SessionUser,
    @Param('studentId', ParseIntPipe) studentId: number,
  ): Promise<void> {
    return this.linksService.cancel(user.userId, studentId);
  }
}

@ApiTags('links')
@ApiCookieAuth('connect.sid')
@ApiUnauthorizedResponse({ description: '로그인이 필요함' })
@ApiForbiddenResponse({ description: '학생 계정이 아님' })
@UseGuards(StudentGuard)
@Controller('students/me/link-requests')
export class StudentLinksController {
  constructor(private readonly linksService: LinksService) {}

  @ApiOperation({
    summary: '나에게 온 보호자 연결 요청(학생)',
    description:
      '대기 중인 요청만, 오래된 순. 목록이 비어 있지 않으면 메뉴에 새 소식(N) 표시에 씁니다.',
  })
  @ApiOkResponse({ type: [StudentLinkRequestDto] })
  @Get()
  list(@CurrentUser() user: SessionUser): Promise<StudentLinkRequestDto[]> {
    return this.linksService.studentRequests(user.userId);
  }

  @ApiOperation({ summary: '연결 요청 수락(학생) — 이때 연결이 성립합니다' })
  @ApiOkResponse({ type: LinkResponseDto })
  @ApiNotFoundResponse({ description: '대기 중인 요청 없음' })
  @HttpCode(HttpStatus.OK)
  @Post(':parentId/accept')
  accept(
    @CurrentUser() user: SessionUser,
    @Param('parentId', ParseIntPipe) parentId: number,
  ): Promise<LinkResponseDto> {
    return this.linksService.respond(user.userId, parentId, 'ACCEPTED');
  }

  @ApiOperation({
    summary: '연결 요청 거절(학생)',
    description: `거절하면 그 보호자는 ${LINK_REREQUEST_COOLDOWN_HOURS}시간 뒤에 다시 요청할 수 있습니다.`,
  })
  @ApiOkResponse({ type: LinkResponseDto })
  @ApiNotFoundResponse({ description: '대기 중인 요청 없음' })
  @HttpCode(HttpStatus.OK)
  @Post(':parentId/reject')
  reject(
    @CurrentUser() user: SessionUser,
    @Param('parentId', ParseIntPipe) parentId: number,
  ): Promise<LinkResponseDto> {
    return this.linksService.respond(user.userId, parentId, 'REJECTED');
  }
}
