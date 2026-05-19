import { Role } from '@prisma/client';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../utils/AppError';
import type { GetUsersQuery, UpdateUserInput } from './user.schema';

// Columns safe to return — never exposes passwordHash
const safeUserSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

export class UserService {
  /**
   * Paginated, filterable, and sortable user list.
   * Uses a $transaction to guarantee consistent count and results (ACID read).
   */
  async getUsers(query: GetUsersQuery) {
    const { page, limit, sortBy, sortOrder, search, role } = query;
    const skip = (page - 1) * limit;

    const where: {
      role?: Role;
      OR?: Array<{ email?: { contains: string; mode: 'insensitive' }; username?: { contains: string; mode: 'insensitive' } }>;
    } = {};

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role as Role;
    }

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: safeUserSelect,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    return user;
  }

  async updateUser(id: string, data: UpdateUserInput) {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });

    if (!user) {
      throw new NotFoundError('User');
    }

    return prisma.user.update({
      where: { id },
      data: {
        ...(data.username !== undefined && { username: data.username }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.role !== undefined && { role: data.role as Role }),
      },
      select: safeUserSelect,
    });
  }

  async deleteUser(id: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Cascade delete handles refresh tokens via schema relation
    await prisma.user.delete({ where: { id } });
  }

  async getAuditLogs(limit = 100) {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        resource: true,
        ipAddress: true,
        statusCode: true,
        metadata: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, username: true },
        },
      },
    });
  }
}

export const userService = new UserService();
