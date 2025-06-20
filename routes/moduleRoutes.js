import express from 'express';
import {
  createModuleController,
  getModuleByIdController,
  getModulesByCourseController,
  updateModuleController,
  deleteModuleController,
  reorderModulesController,
  getModuleStatsController,
  duplicateModuleController,
  toggleModulePublishStatusController
} from '../controllers/moduleController.js';
import { authenticate, authorize, authorizeInstructor } from '../middleware/auth.js';
import {
  validateModuleCreation,
  validateId
} from '../middleware/validation.js';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get modules by course
router.get('/course/:course_id', getModulesByCourseController);

// Module CRUD operations
router.post('/', authorize(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), validateModuleCreation, createModuleController);

router.get('/:id', validateId, getModuleByIdController);

router.put('/:id', validateId, [
  body('title').optional().trim().isLength({ min: 3, max: 200 }).withMessage('Module title must be between 3 and 200 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('position').optional().isInt({ min: 1 }).withMessage('Position must be a positive integer'),
  body('is_published').optional().isBoolean().withMessage('Published status must be boolean'),
  handleValidationErrors
], updateModuleController);

router.delete('/:id', validateId, deleteModuleController);

// Module management operations
router.put('/:id/publish', validateId, toggleModulePublishStatusController);

router.post('/:id/duplicate', validateId, [
  body('targetCourseId').isInt({ min: 1 }).withMessage('Target course ID is required'),
  handleValidationErrors
], duplicateModuleController);

// Module analytics
router.get('/:id/stats', validateId, getModuleStatsController);

// Reorder modules in course
router.put('/course/:course_id/reorder', [
  body('modulePositions').isArray({ min: 1 }).withMessage('Module positions array is required'),
  handleValidationErrors
], reorderModulesController);

export default router;