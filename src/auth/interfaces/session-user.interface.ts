import { UserRole } from '../../users/interfaces/user.interface';

/** 세션에는 식별 정보만 둡니다. 이름 등 나머지는 필요할 때 DB에서 읽습니다. */
export interface SessionUser {
  userId: number;
  role: UserRole;
}
