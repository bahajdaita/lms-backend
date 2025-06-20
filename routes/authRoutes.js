import express from 'express';
import { body } from 'express-validator';
import {
  register,
  login,
  googleAuth,
  googleCallback,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  refreshToken,
  validateToken,
  checkEmailAvailability,
  getAuthStats
} from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateUserRegistration,
  validateUserLogin,
  validateUserUpdate,
  handleValidationErrors
} from '../middleware/validation.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// Public routes (NO authentication required)
router.post('/register', validateUserRegistration, register);
router.post('/login', validateUserLogin, login);
router.post('/logout', logout);

// Google OAuth routes (public)
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

// Email availability check (public)
router.post('/check-email', checkEmailAvailability);

// Token validation (requires auth)
router.get('/validate', authenticate, validateToken);

// Protected routes (require authentication)
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, validateUserUpdate, updateProfile);

// Password management (requires auth)
router.put('/change-password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number'),
  handleValidationErrors
], changePassword);

// Token refresh (requires auth)
router.post('/refresh', authenticate, refreshToken);

// Admin only routes
router.get('/stats', authenticate, authorize(USER_ROLES.ADMIN), getAuthStats);

export default router;