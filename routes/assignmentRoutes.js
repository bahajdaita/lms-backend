import express from 'express';
import {
  createAssignmentController,
  getAssignmentByIdController,
  getAssignmentsByLessonController,
  updateAssignmentController,
  deleteAssignmentController,
  getAssignmentsByCourseController,
  getAssignmentStatsController
} from '../controllers/assignmentController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateAssignmentCreation,
  validateId
} from '../middleware/validation.js';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get assignments by lesson
router.get('/lesson/:lesson_id', getAssignmentsByLessonController);

// Get assignments by course
router.get('/course/:course_id', getAssignmentsByCourseController);

// Assignment CRUD operations
router.post('/', authorize(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), validateAssignmentCreation, createAssignmentController);

router.get('/:id', validateId, getAssignmentByIdController);

router.put('/:id', validateId, [
  body('title').optional().trim().isLength({ min: 3, max: 200 }).withMessage('Assignment title must be between 3 and 200 characters'),
  body('description').optional().trim().isLength({ max: 2000 }).withMessage('Description cannot exceed 2000 characters'),
  body('due_date').optional().isISO8601().withMessage('Due date must be a valid date'),
  body('max_points').optional().isInt({ min: 1, max: 1000 }).withMessage('Maximum points must be between 1 and 1000'),
  body('allow_late_submission').optional().isBoolean().withMessage('Allow late submission must be boolean'),
  body('late_penalty_percent').optional().isInt({ min: 0, max: 100 }).withMessage('Late penalty must be between 0 and 100 percent'),
  handleValidationErrors
], updateAssignmentController);

router.delete('/:id', validateId, deleteAssignmentController);

// Assignment analytics
router.get('/:id/stats', validateId, getAssignmentStatsController);

export default router;