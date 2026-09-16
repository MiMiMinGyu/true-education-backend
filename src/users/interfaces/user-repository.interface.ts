import { StudentUser, User } from './user.interface';

// DB 스키마 확정 전까지 인메모리 Mock 구현체(InMemoryUserRepository)를 주입하고,
// 확정 후에는 이 인터페이스를 그대로 유지한 채 실제 구현체로 교체합니다. (CLAUDE.md E 항목)
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface IUserRepository {
  save(user: User): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findStudentByCode(code: string): Promise<StudentUser | null>;
}
