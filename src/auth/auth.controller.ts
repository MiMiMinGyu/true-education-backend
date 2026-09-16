import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/responses/login-response.dto';
import { LogoutResponseDto } from './dto/responses/logout-response.dto';
import { MeResponseDto } from './dto/responses/me-response.dto';
import { SignupParentResponseDto } from './dto/responses/signup-parent-response.dto';
import { SignupStudentResponseDto } from './dto/responses/signup-student-response.dto';
import { SignupParentDto } from './dto/signup-parent.dto';
import { SignupStudentDto } from './dto/signup-student.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import type { SessionUser } from './interfaces/session-user.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: '학생 회원가입', description: '서버가 랜덤 학생 코드를 발급합니다.' })
  @ApiOkResponse({ type: SignupStudentResponseDto })
  @ApiConflictResponse({ description: '이미 사용 중인 아이디' })
  @Post('signup/student')
  async signupStudent(@Body() dto: SignupStudentDto) {
    return this.authService.signupStudent(dto);
  }

  @ApiOperation({
    summary: '부모 회원가입',
    description: '학생 코드를 대조하여 부모-학생 관계를 매핑합니다.',
  })
  @ApiOkResponse({ type: SignupParentResponseDto })
  @ApiConflictResponse({ description: '이미 사용 중인 아이디' })
  @ApiNotFoundResponse({ description: '일치하는 학생 코드를 찾을 수 없음' })
  @Post('signup/parent')
  async signupParent(@Body() dto: SignupParentDto) {
    return this.authService.signupParent(dto);
  }

  @ApiOperation({
    summary: '로그인',
    description:
      '세션+쿠키(httpOnly) 기반 인증. 성공 시 role을 반환하며, 프론트는 이 값으로 화면을 자동 분기합니다.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: '아이디 또는 비밀번호 불일치' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const sessionUser = await this.authService.login(dto);

    // 세션 고정(session fixation) 공격 방지를 위해 로그인 시 세션 ID를 재발급
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });
    req.session.user = sessionUser;

    return { role: sessionUser.role };
  }

  @ApiOperation({ summary: '로그아웃' })
  @ApiOkResponse({ type: LogoutResponseDto })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    res.clearCookie('connect.sid');
    return { success: true };
  }

  @ApiOperation({
    summary: '현재 로그인 사용자 조회',
    description: '프론트는 role을 보고 보호자 대시보드/학생 메인 화면으로 자동 이동합니다.',
  })
  @ApiCookieAuth('connect.sid')
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ description: '로그인이 필요함' })
  @UseGuards(SessionAuthGuard)
  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return user;
  }
}
