import {
  NewParent,
  NewParentLink,
  NewStudent,
  ParentAccount,
  StudentAccount,
} from './user.interface';

// 서비스 계층은 이 인터페이스만 사용합니다. 운영 구현체는 PrismaUserRepository,
// 단위 테스트는 InMemoryUserRepository를 주입합니다.
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface IUserRepository {
  /** students·parents 두 테이블 중 어느 쪽에라도 있으면 true */
  isLoginIdTaken(loginId: string): Promise<boolean>;

  findStudentByLoginId(loginId: string): Promise<StudentAccount | null>;
  findParentByLoginId(loginId: string): Promise<ParentAccount | null>;
  findStudentById(id: number): Promise<StudentAccount | null>;
  findParentById(id: number): Promise<ParentAccount | null>;

  /**
   * 두 테이블 기준 아이디 중복을 원자적으로 확인하고 학생을 만듭니다.
   * @throws LoginIdTakenError, StudentCodeTakenError
   */
  createStudent(student: NewStudent): Promise<StudentAccount>;

  /**
   * 아이디 중복 확인과 보호자 생성을 한 트랜잭션으로 처리합니다.
   * link가 있으면 같은 트랜잭션에서 그 학생에게 연결 요청(PENDING)을 만들고, 자녀 관련 동의는 그 학생 대상으로 기록합니다.
   * @throws LoginIdTakenError, StudentCodeNotFoundError, LinkRequestLimitError
   */
  createParent(parent: NewParent, link?: NewParentLink): Promise<ParentAccount>;
}
