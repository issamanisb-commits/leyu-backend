import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/auth/service/User.service';
import { PermissionService } from 'src/auth/service/Permission.service';
import { RoleService } from 'src/auth/service/Role.service';
import { Permission } from 'src/auth/entities/Permission.entity';
import { Role } from 'src/auth/entities/Role.entity';
import { Role as RoleEnum } from '../decorators/roles.enum';
import { verifyPassword } from 'src/utils/security/credential.util';
import { UserVerificationCodeService } from './UserVerificationCode.service';
import { SmsService } from 'src/sms/sms.service';
import { EmailService } from 'src/email/email.service';
import { User } from '../entities/User.entity';
import { FileService } from 'src/common/service/File.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserSanitize } from '../sanitize';
import Redis from 'ioredis';
import { I18nService } from 'nestjs-i18n';
import { NotificationService } from 'src/common/service/Notification.service';
import { UserVerificationCode } from '../entities/UserVerificationCode.entity';

const OTP_MAX_ATTEMPTS = 3;
const OTP_ATTEMPTS_TTL_SECONDS = 300; // 5 minutes  matches OTP expiry

@Injectable()
export class AuthService {
  private readonly redis: Redis;

  constructor(
    private usersService: UserService,
    private permissionsService: PermissionService,
    private rolesService: RoleService,
    private userVerificationService: UserVerificationCodeService,
    private smsService: SmsService,
    private mailService: EmailService,
    private fileService: FileService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private readonly i18n: I18nService,
    private readonly notificationService:NotificationService,
  ) {
    this.redis = new Redis(
      this.configService.get<string>('REDIS_URL') as string,
    );
  }
  /**
   * Signs in a user based on the username and password
   * @param {string} username - The username of the user
   * @param {string} pass - The password of the user
   * @returns {Promise<any>} - The signed-in user with the access token and refresh token
   * @throws {UnauthorizedException} - If the user is not found, or if the password is incorrect, or if the user is not active
   * @throws {UnauthorizedException} - If the user is a contributor
   */
  async signIn(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneWithPassword({
      where: [{ email: username }, { phone_number: username }],
      relations: { role: true },
    });
    let valid_password = false;
    if (!user) {
      throw new UnauthorizedException();
    }
    valid_password = await verifyPassword(pass, user.password);
    if (!valid_password) {
      throw new UnauthorizedException();
    }
    if (!user.is_active) {
      throw new UnauthorizedException('User is not active');
    }
    if (user.profile_picture) {
      const pic_url = await this.fileService.getPreSignedUrl(
        user.profile_picture,
      );
      user.profile_picture = pic_url;
    }
    if (user.role.name == RoleEnum.CONTRIBUTOR) {
      throw new UnauthorizedException(
        'Contributors are not allowed to sign in',
      );
    }
    const { access_token, refresh_token } = await this.generateToken(
      user.id,
      user.email,
    );
    await this.usersService.markAsLoggedIn(user.id);
    const userDetail = UserSanitize.from(user);
    return { user: userDetail, access_token, refresh_token };
  }
  /**
   * Signs in a user based on the username and password
   * @param {string} credential.username - The username of the user
   * @param {string} credential.password - The password of the user
   * @param {string} [credential.device_token] - The device token of the user
   * @param {string} [credential.device_type] - The device type of the user
   * @returns {Promise<any>} - The signed-in user with the access token and refresh token
   * @throws {UnauthorizedException} - If the user is not found, or if the password is incorrect, or if the user is not active
   * @throws {UnauthorizedException} - If the user is not a contributor or reviewer
   */
  async mobileSignIn(credential: {
    username: string;
    password: string;
    device_token?: string;
    device_type?: string;
  }): Promise<any> {
    const user = await this.usersService.findOneWithPassword({
      where: [
        { email: credential.username },
        { phone_number: credential.username },
      ],
      relations: { role: true },
    });
    let valid_password = false;
    if (!user) {
      throw new UnauthorizedException('Account not found');
    }
    valid_password = await verifyPassword(credential.password, user.password);
    if (!valid_password) {
      throw new UnauthorizedException('Invalid password');
    }
    if (!user.is_active) {
      throw new UnauthorizedException('User is not active');
    }
    if (user.profile_picture) {
      const pic_url = await this.fileService.getPreSignedUrl(
        user.profile_picture,
      );
      user.profile_picture = pic_url;
    }
    if (
      user.role.name !== RoleEnum.CONTRIBUTOR &&
      user.role.name !== RoleEnum.REVIEWER
    ) {
      throw new UnauthorizedException(
        'Only contributors and reviewers can sign in',
      );
    }
    const { access_token, refresh_token } = await this.generateToken(
      user.id,
      user.email,
    );
    await this.usersService.markAsLoggedIn(user.id);
    // this.eventEmitter.emit(ActionEvents.USER_LOGGED_IN, {
    //   user_id: user.id,
    //   device_token: credential.device_token,
    //   device_type: credential.device_type,
    // });
    const { password, ...basic } = user;
    return {
      user: basic,
      access_token,
      refresh_token,
    };
  }
  /**
   * Refreshes an access token and refresh token based on the given refresh token
   * @param {string} refresh_token - The refresh token to be refreshed
   * @returns {Promise<any>} - The new access token and refresh token
   * @throws {UnauthorizedException} - If the refresh token is invalid
   */
  async refreshToken(refresh_token: string): Promise<any> {
    try {
      const user = await this.jwtService.verify(refresh_token, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      const access_token = this.jwtService.sign({
        sub: user?.sub,
        email: user?.email,
      });
      const new_refresh_token = this.jwtService.sign({
        sub: user?.sub,
        email: user?.email,
      });
      return { access_token, new_refresh_token };
    } catch (error) {
      throw new UnauthorizedException();
    }
  }
  /**
   * Gets all permissions
   * @returns {Promise<Permission[]>} - The list of permissions
   */
  async getAllPermissions(): Promise<Permission[]> {
    const permissions = await this.permissionsService.findMany({});
    return permissions;
  }
  /**
   * Gets all roles
   * @returns {Promise<Role[]>} - The list of roles
   */
  async getAllRoles(): Promise<Role[]> {
    const roles = await this.rolesService.findMany({});
    return roles;
  }
  /**
   * Gets a role with its permissions
   * @param {string} roleId - The id of the role to be retrieved
   * @returns {Promise<Role | null>} - The role with its permissions, or null if the role does not exist
   */
  async getRoleWithPermissions(roleId: string): Promise<Role | null> {
    const role = await this.rolesService.findOne({ id: roleId });
    // const permissions = await this.permissionsService.findMany({roleId:roleId});
    return role;
  }
  /**
   * Sends a verification code to the user's email or phone number
   * @param {string} username - The username or phone number of the user
   * @returns {Promise<string>} - A message indicating the status of the operation
   * @throws {UnauthorizedException} - If the user does not exist or is not active
   */
  async forgotPassword(username: string): Promise<string> {
    const user = await this.usersService.findOneWithPassword({
      where: [{ email: username }, { phone_number: username }],
      relations: { role: true },
    });
    if (!user) {
      return 'If an account with the provided username exists, a verification code has been sent to the registered email or phone number';
    }
    if (!user.is_active) {
      throw new BadRequestException(
        'User is not active, please contact support',
      );
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const code_expiration_date = new Date();
    code_expiration_date.setMinutes(code_expiration_date.getMinutes() + 5);

    const message = `Your verification code is ${code}`;
    if (username == user.email) {
      await this.mailService.sendEmail(
        user.email,
        'Welcome to Leyu platform',
        message,
      );
    } else {
      await this.smsService.sendVerificationCode(user.phone_number, code);
    }
    // SAVE ON REDIS
    const uv = await this.userVerificationService.create({
      username: username,
      code: code,
      expiration_date: code_expiration_date,
      status: 'pending',
    });
    return 'Code sent successfully';
  }
  /**
   * Resets a user's password given a verification code
   * @param {username: string, code: string, password: string} body - The username, verification code and new password of the user
   * @returns {Promise<string>} - A message indicating the status of the operation
   * @throws {UnauthorizedException} - If the user does not exist, or if the verification code is invalid, or if the user is not active
   */
    async setNewPassword(body: {
    username: string;
    code: string;
    password: string;
  }): Promise<string> {
    const cleanUsername = body.username ? body.username.trim() : '';
    const cleanCode = body.code ? body.code.trim() : '';

    console.log('[RESET-PASSWORD] Attempting reset for:', cleanUsername, 'with code:', cleanCode);

    let record: any = null;
    try {
      record = await this.verifyOtp({ username: cleanUsername, code: cleanCode });
    } catch (err) {
      console.log('[RESET-PASSWORD] verifyOtp failed, checking fallback records...');
      record = await this.userVerificationService.findOne({
        where: [
          { username: cleanUsername, code: cleanCode },
          { username: cleanUsername.toLowerCase(), code: cleanCode },
        ],
        order: { created_date: 'DESC' },
      });

      if (!record) {
        console.error('[RESET-PASSWORD] No verification record matched for:', cleanUsername);
        throw err;
      }
    }

    if (record && record.id) {
      await this.userVerificationService.markVerified(record.id);
    }

    const user: User | null = await this.usersService.findOneWithPassword({
      where: [{ email: cleanUsername }, { phone_number: cleanUsername }],
      relations: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.is_active) {
      throw new UnauthorizedException('User is not active');
    }

    await this.usersService.changePasswordFromVerification(
      user.id,
      body.password,
    );

    return 'Password changed successfully';
  }
  /**
   * Verifies a user's OTP given a verification code.
   * Failed attempt tracking is handled in Redis; after 3 failures the session is invalidated.
   * @throws {BadRequestException} - If the session is expired, code is invalid, or max attempts reached
   */
  async verifyOtp(body: { username: string; code: string }): Promise<UserVerificationCode> {
    const attemptsKey = `otp:attempts:${body.username}`;

    const record =
      await this.userVerificationService.findLatestPendingByUsername(
        body.username,
      );

    if (!record) {
      const expiredRecord = await this.userVerificationService.findOne({
        where: { username: body.username, status: 'expired' },
        order: { created_date: 'DESC' },
      });
      if (expiredRecord) {
        throw new BadRequestException(
          'OTP session expired. Please request a new OTP.',
        );
      }
      throw new BadRequestException('Invalid code');
    }

    if (record.status === 'expired') {
      throw new BadRequestException(
        'OTP session expired. Please request a new OTP.',
      );
    }

    if (record.expiration_date < new Date()) {
      await this.userVerificationService.expireSession(record.id);
      await this.redis.del(attemptsKey);
      throw new BadRequestException('Code expired');
    }

    if (record.code !== body.code) {
      const attempts = await this.redis.incr(attemptsKey);
      // Set TTL only on first increment so the key auto-expires with the OTP window
      if (attempts === 1) {
        await this.redis.expire(attemptsKey, OTP_ATTEMPTS_TTL_SECONDS);
      }

      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.userVerificationService.expireSession(record.id);
        await this.redis.del(attemptsKey);
        throw new BadRequestException(
          'Session invalidated after 3 failed attempts. Please request a new OTP.',
        );
      }

      const remaining = OTP_MAX_ATTEMPTS - attempts;
      throw new BadRequestException(
        `Invalid code. ${remaining} attempt(s) remaining.`,
      );
    }
    await this.redis.del(attemptsKey);
    return record;
  }
  /**
   * Generates an access token and a refresh token for a user
   * @param {string} id - The id of the user
   * @param {string} [email] - The email of the user
   * @returns {Promise<{access_token:string,refresh_token:string}>} - The access token and refresh token
   */
  async generateToken(
    id: string,
    email?: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const access_token = this.jwtService.sign({ sub: id, email: email });
    const refresh_token = this.jwtService.sign(
      { sub: id, email: email },
      { expiresIn: '7d', secret: process.env.JWT_REFRESH_SECRET },
    );
    return { access_token, refresh_token };
  }
}
