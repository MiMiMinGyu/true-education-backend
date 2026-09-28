import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import {
  LOGIN_FAILED_MESSAGE,
  PASSWORD_SALT_ROUNDS,
} from '../common/constants/auth.constants';
import { consentsFor } from '../common/utils/consents.util';
import { currentYearKst } from '../common/utils/kst-date.util';
import { LINK_REQUEST_LIMIT_MESSAGE } from '../common/constants/link.constants';
import {
  LinkRequestLimitError,
  LoginIdTakenError,
  StudentCodeNotFoundError,
  StudentCodeTakenError,
} from '../users/errors/user-repository.errors';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../users/interfaces/user-repository.interface';
import { LoginDto } from './dto/login.dto';
import { MeResponseDto } from './dto/responses/me-response.dto';
import { SignupParentResponseDto } from './dto/responses/signup-parent-response.dto';
import { SignupStudentResponseDto } from './dto/responses/signup-student-response.dto';
import { SignupParentDto } from './dto/signup-parent.dto';
import { SignupStudentDto } from './dto/signup-student.dto';
import { SessionUser } from './interfaces/session-user.interface';
import { generateStudentCode } from './utils/student-code.util';

// 코드 공간(약 6×10^10)이 커서 사실상 충돌하지 않지만, 무한 재시도는 막습니다.
const STUDENT_CODE_MAX_ATTEMPTS = 5;
const LOGIN_ID_TAKEN_MESSAGE = '이미 사용 중인 아이디입니다.';

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async isLoginIdAvailable(loginId: string): Promise<boolean> {
    return !(await this.userRepository.isLoginIdTaken(loginId));
  }

  async signupStudent(
    dto: SignupStudentDto,
  ): Promise<SignupStudentResponseDto> {
    const consents = consentsFor('STUDENT', dto.agreements);
    const passwordHash = await hash(dto.password, PASSWORD_SALT_ROUNDS);
    const birthYear = dto.age === undefined ? null : currentYearKst() - dto.age;

    for (let attempt = 1; ; attempt++) {
      try {
        const student = await this.userRepository.createStudent({
          loginId: dto.loginId,
          passwordHash,
          name: dto.name,
          birthYear,
          studentCode: generateStudentCode(),
          guardianShareAgreed: dto.agreements.includes('guardianView'),
          consents,
        });
        return { id: student.id, studentCode: student.studentCode };
      } catch (error) {
        if (error instanceof LoginIdTakenError) {
          throw new ConflictException(LOGIN_ID_TAKEN_MESSAGE);
        }
        if (
          error instanceof StudentCodeTakenError &&
          attempt < STUDENT_CODE_MAX_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * 보호자 가입: 계정 동의(약관·개인정보, 마케팅 선택)만 받습니다. 자녀는 가입 후 연결 요청으로 추가합니다.
   * 전환용: studentCode를 함께 보내면 자녀 관련 동의까지 받아 가입과 함께 연결 요청(학생 수락 대기)을 만듭니다.
   */
  async signupParent(dto: SignupParentDto): Promise<SignupParentResponseDto> {
    const studentCode = dto.studentCode?.trim() || undefined;
    const consents = [
      ...consentsFor('PARENT', dto.agreements, false),
      ...(studentCode ? consentsFor('PARENT', dto.agreements, true) : []),
    ];
    const agreed = (key: string) => dto.agreements.includes(key);
    const passwordHash = await hash(dto.password, PASSWORD_SALT_ROUNDS);

    try {
      const parent = await this.userRepository.createParent(
        {
          loginId: dto.loginId,
          passwordHash,
          name: dto.name,
          // 항목별 기록은 user_consents에 남기고, 기존 요약 컬럼도 함께 채웁니다.
          termsAgreed: agreed('terms') && agreed('guardianPrivacy'),
          marketingAgreed: agreed('marketing'),
          consents,
        },
        studentCode ? { studentCode } : undefined,
      );
      return { id: parent.id };
    } catch (error) {
      if (error instanceof LoginIdTakenError) {
        throw new ConflictException(LOGIN_ID_TAKEN_MESSAGE);
      }
      if (error instanceof StudentCodeNotFoundError) {
        throw new NotFoundException('일치하는 학생 코드를 찾을 수 없습니다.');
      }
      if (error instanceof LinkRequestLimitError) {
        throw new ConflictException(LINK_REQUEST_LIMIT_MESSAGE);
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<SessionUser> {
    const account =
      dto.role === 'STUDENT'
        ? await this.userRepository.findStudentByLoginId(dto.loginId)
        : await this.userRepository.findParentByLoginId(dto.loginId);

    // 계정 존재 여부가 드러나지 않도록 실패 사유와 무관하게 같은 메시지를 씁니다.
    if (!account || !(await compare(dto.password, account.passwordHash))) {
      throw new UnauthorizedException(LOGIN_FAILED_MESSAGE);
    }
    return { userId: account.id, role: dto.role };
  }

  async getMe(user: SessionUser): Promise<MeResponseDto> {
    if (user.role === 'STUDENT') {
      const student = await this.userRepository.findStudentById(user.userId);
      if (!student) throw new UnauthorizedException('로그인이 필요합니다.');
      return {
        id: student.id,
        role: 'STUDENT',
        name: student.name,
        studentCode: student.studentCode,
      };
    }
    const parent = await this.userRepository.findParentById(user.userId);
    if (!parent) throw new UnauthorizedException('로그인이 필요합니다.');
    return { id: parent.id, role: 'PARENT', name: parent.name };
  }
}
