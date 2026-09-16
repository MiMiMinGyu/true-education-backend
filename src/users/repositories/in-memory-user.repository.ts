import { Injectable } from '@nestjs/common';
import { IUserRepository } from '../interfaces/user-repository.interface';
import { StudentUser, User } from '../interfaces/user.interface';

@Injectable()
export class InMemoryUserRepository implements IUserRepository {
  private readonly usersById = new Map<string, User>();

  async save(user: User): Promise<User> {
    this.usersById.set(user.id, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    for (const user of this.usersById.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return null;
  }

  async findStudentByCode(code: string): Promise<StudentUser | null> {
    for (const user of this.usersById.values()) {
      if (user.role === 'student' && user.studentCode === code) {
        return user;
      }
    }
    return null;
  }
}
