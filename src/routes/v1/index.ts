import { Router, Request, Response } from 'express';
import authRoutes from '../../modules/auth/auth.routes';
import userRoutes from '../../modules/users/user.routes';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: API health check
 *     responses:
 *       200:
 *         description: API is healthy
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'API is healthy',
    data: {
      status: 'OK',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);

export default router;
