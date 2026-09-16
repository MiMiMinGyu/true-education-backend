import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../users/interfaces/user-repository.interface';
import { ParentUser, StudentUser } from '../users/interfaces/user.interface';
import { LoginDto } from './dto/login.dto';
import { SignupParentResponseDto } from './dto/responses/signup-parent-response.dto';
import { SignupStudentResponseDto } from './dto/responses/signup-student-response.dto';
import { SignupParentDto } from './dto/signup-parent.dto';
import { SignupStudentDto } from './dto/signup-student.dto';
import { SessionUser } from './interfaces/session-user.interface';
import { generateStudentCode } from './utils/student-code.util';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async signupStudent(
    dto: SignupStudentDto,
  ): Promise<SignupStudentResponseDto> {
    const existing = await this.userRepository.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('이미 사용 중인 아이디입니다.');
    }

    let studentCode = generateStudentCode();
    while (await this.userRepository.findStudentByCode(studentCode)) {
      studentCode = generateStudentCode();
    }

    const passwordHash = await hash(dto.password, SALT_ROUNDS);
    const student: StudentUser = {
      id: randomUUID(),
      username: dto.username,
      passwordHash,
      role: 'student',
      studentCode,
      createdAt: new Date(),
    };
    await this.userRepository.save(student);

    return {
      id: student.id,
      username: student.username,
      studentCode: student.studentCode,
    };
  }

  async signupParent(dto: SignupParentDto): Promise<SignupParentResponseDto> {
    const existing = await this.userRepository.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('이미 사용 중인 아이디입니다.');
    }

    const student = await this.userRepository.findStudentByCode(
      dto.studentCode,
    );
    if (!student) {
      throw new NotFoundException('일치하는 학생 코드를 찾을 수 없습니다.');
    }

    const passwordHash = await hash(dto.password, SALT_ROUNDS);
    const parent: ParentUser = {
      id: randomUUID(),
      username: dto.username,
      passwordHash,
      role: 'parent',
      linkedStudentIds: [student.id],
      createdAt: new Date(),
    };
    await this.userRepository.save(parent);

    return { id: parent.id, username: parent.username };
  }

  async login(dto: LoginDto): Promise<SessionUser> {
    const user = await this.userRepository.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    const isMatch = await compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    return { id: user.id, username: user.username, role: user.role };
  }
}
