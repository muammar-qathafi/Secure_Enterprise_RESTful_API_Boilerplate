import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { hashPassword } from '../../src/utils/password.util';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createUser(
  overrides: Partial<{
    email: string;
    username: string;
    password: string;
  }> = {},
) {
  const data = {
    email: overrides.email ?? 'test@example.com',
    username: overrides.username ?? 'testuser',
    password: overrides.password ?? 'Str0ng!Pass',
  };

  const passwordHash = await hashPassword(data.password);
  return prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash,
    },
  });
}

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  const url = '/api/v1/auth/register';

  it('should register a new user and return 201 with tokens', async () => {
    const res = await request(app).post(url).send({
      email: 'new@example.com',
      username: 'newuser',
      password: 'Str0ng!Pass',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
    expect(res.body.data.tokens).toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe('new@example.com');
    // passwordHash must never be exposed
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('should return 409 when email is already registered', async () => {
    await createUser({ email: 'dup@example.com', username: 'dupuser' });

    const res = await request(app).post(url).send({
      email: 'dup@example.com',
      username: 'anotheruser',
      password: 'Str0ng!Pass',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('should return 409 when username is already taken', async () => {
    await createUser({ email: 'unique@example.com', username: 'takenname' });

    const res = await request(app).post(url).send({
      email: 'another@example.com',
      username: 'takenname',
      password: 'Str0ng!Pass',
    });

    expect(res.status).toBe(409);
  });

  it('should return 422 for invalid email', async () => {
    const res = await request(app).post(url).send({
      email: 'not-an-email',
      username: 'validuser',
      password: 'Str0ng!Pass',
    });

    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('email');
  });

  it('should return 422 for a weak password', async () => {
    const res = await request(app).post(url).send({
      email: 'weak@example.com',
      username: 'weakpassuser',
      password: 'weakpass',
    });

    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveProperty('password');
  });

  it('should return 422 when required fields are missing', async () => {
    const res = await request(app).post(url).send({});
    expect(res.status).toBe(422);
  });
});

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  const url = '/api/v1/auth/login';

  beforeEach(async () => {
    await createUser({
      email: 'login@example.com',
      username: 'loginuser',
      password: 'Str0ng!Pass',
    });
  });

  it('should return 200 with tokens on valid credentials', async () => {
    const res = await request(app).post(url).send({
      email: 'login@example.com',
      password: 'Str0ng!Pass',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
    expect(res.body.data.tokens).toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe('login@example.com');
  });

  it('should return 401 for wrong password', async () => {
    const res = await request(app).post(url).send({
      email: 'login@example.com',
      password: 'WrongPass1!',
    });

    expect(res.status).toBe(401);
    // Generic message must not hint which field was wrong (OWASP A01)
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('should return 401 for non-existent email', async () => {
    const res = await request(app).post(url).send({
      email: 'nobody@example.com',
      password: 'Str0ng!Pass',
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });
});

// ─── POST /api/v1/auth/refresh ────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  const loginUrl = '/api/v1/auth/login';
  const refreshUrl = '/api/v1/auth/refresh';

  it('should issue new tokens given a valid refresh token', async () => {
    await createUser({
      email: 'refresh@example.com',
      username: 'refreshuser',
      password: 'Str0ng!Pass',
    });

    const loginRes = await request(app).post(loginUrl).send({
      email: 'refresh@example.com',
      password: 'Str0ng!Pass',
    });

    const { refreshToken } = loginRes.body.data.tokens;

    const res = await request(app).post(refreshUrl).send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    // Old token must be revoked (rotation)
    expect(res.body.data.refreshToken).not.toBe(refreshToken);
  });

  it('should return 401 for an invalid refresh token', async () => {
    const res = await request(app).post(refreshUrl).send({ refreshToken: 'invalid-token' });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/v1/auth/me ──────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  const meUrl = '/api/v1/auth/me';
  const loginUrl = '/api/v1/auth/login';

  it('should return current user info with a valid token', async () => {
    await createUser({ email: 'me@example.com', username: 'meuser', password: 'Str0ng!Pass' });

    const loginRes = await request(app).post(loginUrl).send({
      email: 'me@example.com',
      password: 'Str0ng!Pass',
    });

    const { accessToken } = loginRes.body.data.tokens;

    const res = await request(app).get(meUrl).set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('me@example.com');
  });

  it('should return 401 without an Authorization header', async () => {
    const res = await request(app).get(meUrl);
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  const logoutUrl = '/api/v1/auth/logout';
  const loginUrl = '/api/v1/auth/login';

  it('should logout and revoke the session', async () => {
    await createUser({
      email: 'logout@example.com',
      username: 'logoutuser',
      password: 'Str0ng!Pass',
    });

    const loginRes = await request(app).post(loginUrl).send({
      email: 'logout@example.com',
      password: 'Str0ng!Pass',
    });

    const { accessToken, refreshToken } = loginRes.body.data.tokens;

    const res = await request(app)
      .post(logoutUrl)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(res.status).toBe(200);

    // The refresh token should now be revoked in the DB
    const storedToken = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    expect(storedToken?.isRevoked).toBe(true);
  });
});
