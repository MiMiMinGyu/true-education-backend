import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StudentGuard } from '../auth/guards/role.guards';
import type { SessionUser } from '../auth/interfaces/session-user.interface';
import { AssignmentOwnerGuard } from '../learning/guards/assignment-owner.guard';
import { BookshelfService } from './bookshelf.service';
import { ShelfBookDto, ShelfItemDto } from './dto/bookshelf-responses.dto';

@ApiTags('bookshelf')
@ApiCookieAuth('connect.sid')
@ApiUnauthorizedResponse({ description: '로그인이 필요함' })
@ApiForbiddenResponse({ description: '학생 계정이 아니거나 다른 학생의 책' })
@UseGuards(StudentGuard)
@Controller('bookshelf')
export class BookshelfController {
  constructor(private readonly bookshelfService: BookshelfService) {}

  @ApiOperation({
    summary: '내 서재',
    description: '완료한 책만, 최근 완료 순입니다.',
  })
  @ApiOkResponse({ type: [ShelfItemDto] })
  @Get()
  list(@CurrentUser() user: SessionUser): Promise<ShelfItemDto[]> {
    return this.bookshelfService.list(user.userId);
  }

  @ApiOperation({
    summary: '서재 책 상세(다시 읽기)',
    description:
      '본문, 이해 질문 정답과 내 시도 기록, 순서 맞추기, 내가 지은 제목·표지·설명을 돌려줍니다. 열람 전용입니다.',
  })
  @ApiOkResponse({ type: ShelfBookDto })
  @ApiNotFoundResponse({ description: '없는 배정이거나 아직 완료하지 않은 책' })
  @UseGuards(AssignmentOwnerGuard)
  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number): Promise<ShelfBookDto> {
    return this.bookshelfService.detail(id);
  }
}
