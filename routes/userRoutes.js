import express from 'express';
import {
  getUsers,
  getUserById,
  updateUserById,
  deleteUserById,
  getUsersByRoleType,
  searchUsersEndpoint,
  getDashboard,
  getUserStats,
  getUserActivity,
  promoteToInstructor,
  demoteToStudent,
  bulkUpdateUsers
} from '../controllers/userController.js';
import { authenticate, authorize, authorizeOwnerOrAdmin } from '../middleware/auth.js';
import {
  validateUserUpdate,
  validateId,
  validatePagination,
  validateSearch
} from '../middleware/validation.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get current user dashboard
router.get('/dashboard', getDashboard);

// Search users
router.get('/search', validateSearch, searchUsersEndpoint);

// Get users by role
router.get('/role/:role', getUsersByRoleType);

// Admin only routes
router.get('/', authorize(USER_ROLES.ADMIN), validatePagination, getUsers);
router.get('/stats', authorize(USER_ROLES.ADMIN), getUserStats);
router.post('/bulk-update', authorize(USER_ROLES.ADMIN), bulkUpdateUsers);

// User management routes
router.get('/:id', validateId, authorizeOwnerOrAdmin(), getUserById);
router.put('/:id', validateId, validateUserUpdate, authorizeOwnerOrAdmin(), updateUserById);
router.delete('/:id', validateId, authorize(USER_ROLES.ADMIN), deleteUserById);

// User activity (admin only)
router.get('/:id/activity', validateId, authorize(USER_ROLES.ADMIN), getUserActivity);

// Role management (admin only)
router.put('/:id/promote', validateId, authorize(USER_ROLES.ADMIN), promoteToInstructor);
router.put('/:id/demote', validateId, authorize(USER_ROLES.ADMIN), demoteToStudent);

export default router;