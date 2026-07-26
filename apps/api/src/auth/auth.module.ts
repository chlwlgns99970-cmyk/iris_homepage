import { Module } from '@nestjs/common';
import { AuthController, InternalAuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController, InternalAuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
