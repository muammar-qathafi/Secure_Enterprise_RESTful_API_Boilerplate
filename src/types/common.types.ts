import { Role } from '@prisma/client';

export interface PaginationQuery {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  jti?: string;
}

export type UserRole = keyof typeof Role;
