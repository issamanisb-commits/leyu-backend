import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class SignInDto {
  @ApiProperty()
  @IsString({ message: 'Email or phone number must be a string' })
  @IsNotEmpty({ message: 'Email or phone number is required' })
  @MinLength(1, { message: 'Email or phone number cannot be empty' })
  username: string;

  @ApiProperty()
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}

export class MobileSignInDto {
  @ApiProperty()
  @IsString({ message: 'Email or phone number must be a string' })
  @IsNotEmpty({ message: 'Email or phone number is required' })
  @MinLength(1, { message: 'Email or phone number cannot be empty' })
  username: string;

  @ApiProperty()
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @ApiProperty()
  @IsOptional()
  @IsString({ message: 'Device token must be a string' })
  device_token?: string;

  @ApiProperty()
  @IsOptional()
  @IsEnum(['android', 'ios', 'web'], {
    message: 'Device type must be one of: android, ios, web',
  })
  device_type?: 'android' | 'ios' | 'web';
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsString({ message: 'Email or phone number must be a string' })
  @IsNotEmpty({ message: 'Email or phone number is required' })
  username: string;
}

export class SetNewPasswordDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  otp?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  token?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  newPassword?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  new_password?: string;
}

export class VerifyOtp {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;
}
