import { Request, Response, NextFunction } from 'express';
import { userService } from './user.service';
import { sendSuccess, sendNoContent } from '../../utils/apiResponse.util';
import type { GetUsersQuery } from './user.schema';

export class UserController {
  async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await userService.getUsers(req.query as unknown as GetUsersQuery);
      sendSuccess(res, result.data, 'Users retrieved successfully', 200, result.meta);
    } catch (error) {
      next(error);
    }
  }

  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await userService.getUserById(req.params.id);
      sendSuccess(res, user, 'User retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await userService.updateUser(req.params.id, req.body);
      sendSuccess(res, user, 'User updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await userService.deleteUser(req.params.id);
      sendNoContent(res);
    } catch (error) {
      next(error);
    }
  }

  async getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const logs = await userService.getAuditLogs();
      sendSuccess(res, logs, 'Audit logs retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
