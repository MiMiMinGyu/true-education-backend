import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './interfaces/user-repository.interface';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository';

@Module({
  providers: [{ provide: USER_REPOSITORY, useClass: InMemoryUserRepository }],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
