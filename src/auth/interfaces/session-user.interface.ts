import { UserRole } from '../../users/interfaces/user.interface';

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
}
