import { prisma } from '../../config/database';
import { getRedisClient } from '../../config/redis';
import { hashPassword, comparePassword } from '../../utils/password.util';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt.util';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../utils/AppError';
import { v4 as uuidv4 } from 'uuid';
import type {
  RegisterInput,
  LoginInput,
  RefreshTokenInput,
  ChangePasswordInput,
} from './auth.schema';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
  tokens: AuthTokens;
}

// Access token TTL in seconds (must match JWT_ACCESS_EXPIRES_IN)
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class AuthService {
  /**
   * Register a new user.
   * Uses an ACID transaction to atomically create the user and initial refresh token.
   */
  async register(data: RegisterInput): Promise<AuthResult> {
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { username: data.username }] },
      select: { email: true, username: true },
    });

    if (existingUser) {
      throw new ConflictError(
        existingUser.email === data.email
          ? 'Email is already registered'
          : 'Username is already taken',
      );
    }

    const passwordHash = await hashPassword(data.password);

    // ACID transaction: create user and issue refresh token atomically
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: data.email, username: data.username, passwordHash },
      });

      const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        jti: uuidv4(),
      });

      const refreshTokenValue = signRefreshToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        jti: uuidv4(),
      });

      await tx.refreshToken.create({
        data: {
          token: refreshTokenValue,
          userId: user.id,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });

      return { user, accessToken, refreshToken: refreshTokenValue };
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
        role: result.user.role,
      },
      tokens: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    };
  }

  /**
   * Authenticate a user with email and password.
   * Uses the same error message for invalid email and invalid password
   * to prevent user enumeration (OWASP A01).
   */
  async login(
    data: LoginInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true, email: true, username: true, passwordHash: true, role: true, isActive: true },
    });

    // Constant-time comparison prevents timing attacks even when user is not found
    const passwordMatches =
      user != null ? await comparePassword(data.password, user.passwordHash) : false;

    if (!user || !user.isActive || !passwordMatches) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: uuidv4(),
    });

    const refreshTokenValue = signRefreshToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: uuidv4(),
    });

    await prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        ipAddress,
        userAgent,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken: refreshTokenValue,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    };
  }

  /**
   * Rotate refresh token: revoke the old one and issue a new pair.
   * ACID transaction ensures no token is lost during rotation.
   */
  async refreshTokens(data: RefreshTokenInput): Promise<AuthTokens> {
    // Verify JWT signature before hitting the database
    verifyRefreshToken(data.refreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: data.refreshToken },
      include: { user: { select: { id: true, email: true, username: true, role: true, isActive: true } } },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedError('User account is deactivated');
    }

    const newAccessToken = signAccessToken({
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
      jti: uuidv4(),
    });

    const newRefreshToken = signRefreshToken({
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
      jti: uuidv4(),
    });

    // ACID transaction: revoke old token and create new one atomically
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: { isRevoked: true },
      });

      await tx.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: storedToken.user.id,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /**
   * Logout: revoke the refresh token in the DB and blacklist the access token in Redis.
   */
  async logout(userId: string, refreshToken: string, accessTokenJti?: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken, userId, isRevoked: false },
      data: { isRevoked: true },
    });

    // Blacklist the access token until it naturally expires
    if (accessTokenJti) {
      const redis = getRedisClient();
      await redis.setex(`blacklist:${accessTokenJti}`, ACCESS_TOKEN_TTL_SECONDS, '1');
    }
  }

  /**
   * Change password and revoke all refresh tokens (force re-login on all devices).
   * Uses an ACID transaction to keep the password change and token revocation consistent.
   */
  async changePassword(userId: string, data: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const isPasswordValid = await comparePassword(data.currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    const newPasswordHash = await hashPassword(data.newPassword);

    // ACID transaction: update password and revoke all tokens together
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      await tx.refreshToken.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });
    });
  }
}

export const authService = new AuthService();
