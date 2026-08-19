import { Request, Response, NextFunction } from 'express';
import { Injectable, NestMiddleware, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../auth/service/User.service';
import { ConfigService } from '@nestjs/config';
import { Role } from '../auth/decorators/roles.enum';

@Injectable()
export class AdminAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) { }

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('No valid authorization header found');
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify JWT token
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Get user from database with role information
      const user = await this.userService.findOne({
        where: { id: payload.id },
        relations: { role: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Check if user has admin privileges
      const allowedRoles = [Role.ADMIN, Role.SUPER_ADMIN];
      if (!allowedRoles.includes(user.role.name as Role)) {
        throw new ForbiddenException('Insufficient privileges to access admin dashboard');
      }

      // Attach user to request for potential future use
      (req as any).user = user;
      next();
    } catch (error:any) {
      // Return 401 for any authentication/authorization failures
      return res.status(401).json({
        statusCode: 401,
        message: error.message || 'Unauthorized access to admin dashboard',
        error: 'Unauthorized',
      });
    }
  }
}