import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { SellerProfileService } from './seller-profile.service';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, SellerProfileService],
  exports: [UsersService],
})
export class UsersModule {}
