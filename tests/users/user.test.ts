import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { hashPassword } from '../../src/utils/password.util';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createUserAndLogin(overrides: {
  email: string;
  username: string;
  role?: Role;
}): Promise<{ accessToken: string; userId: string }> {
  const password = 'Str0ng!Pass';
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email: overrides.email,
      username: overrides.username,
      passwordHash,
      role: overrides.role ?? Role.USER,
    },
  });

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: overrides.email,
    password,
  });

  return { accessToken: loginRes.body.data.tokens.accessToken, userId: user.id };
}

// ─── GET /api/v1/users ────────────────────────────────────────────────────────

describe('GET /api/v1/users', () => {
  const url = '/api/v1/users';

  it('should return paginated users for an Admin', async () => {
    const { accessToken } = await createUserAndLogin({
      email: 'admin@example.com',
      username: 'adminuser',
      role: Role.ADMIN,
    });

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('totalPages');
  });

  it('should return 403 for a regular USER', async () => {
    const { accessToken } = await createUserAndLogin({
      email: 'user@example.com',
      username: 'regularuser',
      role: Role.USER,
    });

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app).get(url);
    expect(res.status).toBe(401);
  });

  it('should support search filtering', async () => {
    const { accessToken } = await createUserAndLogin({
      email: 'admin2@example.com',
      username: 'adminuser2',
      role: Role.ADMIN,
    });

    const res = await request(app)
      .get(`${url}?search=admin2`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].email).toContain('admin2');
  });
});

// ─── GET /api/v1/users/:id ────────────────────────────────────────────────────

describe('GET /api/v1/users/:id', () => {
  it('should return a user by ID', async () => {
    const { accessToken, userId } = await createUserAndLogin({
      email: 'getbyid@example.com',
      username: 'getbyiduser',
    });

    const res = await request(app)
      .get(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(userId);
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('should return 404 for a non-existent user', async () => {
    const { accessToken } = await createUserAndLogin({
      email: 'finder@example.com',
      username: 'finderuser',
    });

    const res = await request(app)
      .get('/api/v1/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  it('should return 422 for a non-UUID id param', async () => {
    const { accessToken } = await createUserAndLogin({
      email: 'uuid@example.com',
      username: 'uuidchecker',
    });

    const res = await request(app)
      .get('/api/v1/users/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(422);
  });
});

// ─── PATCH /api/v1/users/:id ──────────────────────────────────────────────────

describe('PATCH /api/v1/users/:id', () => {
  it('should update a user as Admin', async () => {
    const { accessToken } = await createUserAndLogin({
      email: 'patchadmin@example.com',
      username: 'patchadmin',
      role: Role.ADMIN,
    });

    const target = await prisma.user.create({
      data: {
        email: 'patchme@example.com',
        username: 'patchme',
        passwordHash: await hashPassword('Str0ng!Pass'),
      },
    });

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('should return 403 for a non-Admin', async () => {
    const { accessToken } = await createUserAndLogin({
      email: 'noadmin@example.com',
      username: 'noadmin',
      role: Role.USER,
    });

    const res = await request(app)
      .patch(`/api/v1/users/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });
});

// ─── DELETE /api/v1/users/:id ─────────────────────────────────────────────────

describe('DELETE /api/v1/users/:id', () => {
  it('should delete a user as Admin and return 204', async () => {
    const { accessToken } = await createUserAndLogin({
      email: 'deleteadmin@example.com',
      username: 'deleteadmin',
      role: Role.ADMIN,
    });

    const target = await prisma.user.create({
      data: {
        email: 'deleteme@example.com',
        username: 'deleteme',
        passwordHash: await hashPassword('Str0ng!Pass'),
      },
    });

    const res = await request(app)
      .delete(`/api/v1/users/${target.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(204);

    const deleted = await prisma.user.findUnique({ where: { id: target.id } });
    expect(deleted).toBeNull();
  });
});
