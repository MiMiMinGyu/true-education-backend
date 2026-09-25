import {
  BadRequestException,
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
import { currentYearKst } from '../common/utils/kst-date.util';
import {
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
    if (dto.guardianShareAgreed !== true) {
      throw new BadRequestException('보호자 전달 동의가 필요합니다.');
    }
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
          guardianShareAgreed: true,
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

  async signupParent(dto: SignupParentDto): Promise<SignupParentResponseDto> {
    if (dto.termsAgreed !== true) {
      throw new BadRequestException(
        '이용약관 및 개인정보 처리방침 동의가 필요합니다.',
      );
    }
    if (dto.guardianConsentAgreed !== true) {
      throw new BadRequestException(
        '자녀 개인정보 수집·이용 동의가 필요합니다.',
      );
    }
    const passwordHash = await hash(dto.password, PASSWORD_SALT_ROUNDS);

    try {
      const parent = await this.userRepository.createParentWithStudentLink(
        {
          loginId: dto.loginId,
          passwordHash,
          name: dto.name,
          termsAgreed: true,
          marketingAgreed: dto.marketingAgreed,
        },
        { studentCode: dto.studentCode, guardianConsentAgreed: true },
      );
      return { id: parent.id };
    } catch (error) {
      if (error instanceof LoginIdTakenError) {
        throw new ConflictException(LOGIN_ID_TAKEN_MESSAGE);
      }
      if (error instanceof StudentCodeNotFoundError) {
        throw new NotFoundException('일치하는 학생 코드를 찾을 수 없습니다.');
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
