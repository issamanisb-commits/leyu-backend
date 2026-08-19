import { Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards, BadRequestException } from '@nestjs/common';
import { AuthService } from '../service/auth.service';

import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { RolesGuard } from '../guard/role.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../decorators/roles.enum';
import { Throttle } from '@nestjs/throttler';
// import { OtpThrottlerGuard } from '../guard/otp-throttler.guard';
import {
  ForgotPasswordDto,
  MobileSignInDto,
  SetNewPasswordDto,
  SignInDto,
  VerifyOtp,
} from '../dto/SignIn.dto';

@ApiTags('Auth') // This makes it appear first in Swagger
@Controller('iam/auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: SignInDto) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }

  @Throttle({ default: { limit: 3, ttl: 600 } })
  @Post('mobile_login')
  mobileSignIn(@Body() signInDto: MobileSignInDto) {
    return this.authService.mobileSignIn(signInDto);
  }

  @Post('refresh-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refresh_token: {
          type: 'string',
        },
      },
    },
  })
  refreshToken(@Body() refreshTokenDto: { refresh_token: string }) {
    return this.authService.refreshToken(refreshTokenDto.refresh_token);
  }
  
  @Throttle({ default: { limit: 3, ttl: 600 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  // @UseGuards(OtpThrottlerGuard)
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.username);
  }
    @Post('reset-password/')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body()
    setPassword: SetNewPasswordDto,
  ) {
    const username = setPassword.username || setPassword.email;
    const code = setPassword.code || setPassword.otp || setPassword.token;
    const password = setPassword.password || setPassword.newPassword || setPassword.new_password;

    if (!username || !code || !password) {
      throw new BadRequestException('Username/email, code/OTP, and password are required.');
    }

    return this.authService.setNewPassword({ username, code, password });
  }
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body()
    verifyOtp: VerifyOtp,
  ) {
    await this.authService.verifyOtp(verifyOtp);
    return { message: 'OTP verified successfully' };
  }

  @Get('roles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  getRoles() {
    return this.authService.getAllRoles();
  }
  @Get('roles/:id')
  getRolePermissions(
    @Param(
      'id',
      new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE }),
    )
    id: string,
  ) {
    return this.authService.getRoleWithPermissions(id);
  }
}
