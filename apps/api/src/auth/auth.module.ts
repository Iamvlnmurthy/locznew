import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { EmailModule } from '../email/email.module';
import { PasswordResetService } from './password-reset.service';
import { FirebaseAuthService } from './firebase-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { AuthService } from './auth.service';
import { OtpModule } from './otp/otp.module';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [EmailModule, OtpModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    PasswordResetService,
    FirebaseAuthService,
    GoogleAuthService,
    AuthService,
    TokenService,
  ],
  exports: [AuthService, TokenService, JwtModule],
})
export class AuthModule {}
