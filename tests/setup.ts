import { prisma } from '../src/config/database';

// Truncate all tables in dependency order before each test
beforeEach(async () => {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});
