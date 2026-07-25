import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpModule } from './otp/otp.module';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [OtpModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  exports: [AuthService, TokenService, JwtModule],
})
export class AuthModule {}
