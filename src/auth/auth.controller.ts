import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginIdAvailabilityQuery } from './dto/login-id-availability.query';
import { LoginDto } from './dto/login.dto';
import { LoginIdAvailabilityResponseDto } from './dto/responses/login-id-availability-response.dto';
import { LoginResponseDto } from './dto/responses/login-response.dto';
import { LogoutResponseDto } from './dto/responses/logout-response.dto';
import { SignupParentResponseDto } from './dto/responses/signup-parent-response.dto';
import { SignupStudentResponseDto } from './dto/responses/signup-student-response.dto';
import { SignupParentDto } from './dto/signup-parent.dto';
import { SignupStudentDto } from './dto/signup-student.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: '아이디 중복확인',
    description: '학생·보호자 계정 모두에서 확인합니다.',
  })
  @ApiOkResponse({ type: LoginIdAvailabilityResponseDto })
  @ApiBadRequestResponse({ description: '아이디 형식 오류' })
  @Get('login-id/availability')
  async checkLoginId(
    @Query() query: LoginIdAvailabilityQuery,
  ): Promise<LoginIdAvailabilityResponseDto> {
    return {
      available: await this.authService.isLoginIdAvailable(query.loginId),
    };
  }

  @ApiOperation({
    summary: '학생 회원가입',
    description: '서버가 6자리 학생 코드를 발급해 응답에 포함합니다.',
  })
  @ApiCreatedResponse({ type: SignupStudentResponseDto })
  @ApiBadRequestResponse({
    description: '입력 검증 실패, 보호자 전달 동의 누락',
  })
  @ApiConflictResponse({ description: '이미 사용 중인 아이디' })
  @Post('signup/student')
  signupStudent(
    @Body() dto: SignupStudentDto,
  ): Promise<SignupStudentResponseDto> {
    return this.authService.signupStudent(dto);
  }

  @ApiOperation({
    summary: '보호자 회원가입',
    description:
      '보호자 계정만 만듭니다. 자녀는 가입 후 POST /parents/me/link-requests로 연결 요청하고, 학생이 수락하면 연결됩니다. ' +
      '(전환용) studentCode를 함께 보내면 가입과 같은 트랜잭션에서 연결 요청을 만듭니다.',
  })
  @ApiCreatedResponse({ type: SignupParentResponseDto })
  @ApiBadRequestResponse({ description: '입력 검증 실패, 필수 동의 누락' })
  @ApiConflictResponse({
    description:
      '이미 사용 중인 아이디, (studentCode를 보낸 경우) 그 학생의 대기 요청이 너무 많음',
  })
  @ApiNotFoundResponse({
    description: '(studentCode를 보낸 경우) 일치하는 학생 코드 없음',
  })
  @Post('signup/parent')
  signupParent(@Body() dto: SignupParentDto): Promise<SignupParentResponseDto> {
    return this.authService.signupParent(dto);
  }

  @ApiOperation({
    summary: '로그인',
    description:
      '로그인 화면에서 고른 role에 해당하는 계정만 조회합니다. 성공 시 세션을 재발급하고 httpOnly 쿠키를 설정합니다.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: '아이디 또는 비밀번호 불일치' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<LoginResponseDto> {
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
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    res.clearCookie('connect.sid');
    return { success: true };
  }
}
