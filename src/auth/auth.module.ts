import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ParentGuard, StudentGuard } from './guards/role.guards';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { MeController } from './me.controller';

@Module({
  imports: [UsersModule],
  controllers: [AuthController, MeController],
  providers: [AuthService, SessionAuthGuard, StudentGuard, ParentGuard],
  exports: [SessionAuthGuard, StudentGuard, ParentGuard],
})
export class AuthModule {}
