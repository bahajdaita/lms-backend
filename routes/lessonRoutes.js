import express from 'express';
import {
  createLessonController,
  getLessonByIdController,
  getLessonsByModuleController,
  updateLessonController,
  deleteLessonController,
  reorderLessonsController,
  getLessonStatsController,
  duplicateLessonController,
  toggleLessonPublishStatusController,
  getCourseLessonsNavigationController,
  searchLessonsInCourseController
} from '../controllers/lessonController.js';
import { authenticate, authorize, authorizeEnrolledStudent } from '../middleware/auth.js';
import {
  validateLessonCreation,
  validateId,
  validateSearch
} from '../middleware/validation.js';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get lessons by module
router.get('/module/:module_id', getLessonsByModuleController);

// Course navigation and search
router.get('/course/:course_id/navigation', getCourseLessonsNavigationController);
router.get('/course/:course_id/search', validateSearch, searchLessonsInCourseController);

// Lesson CRUD operations
router.post('/', authorize(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), validateLessonCreation, createLessonController);

router.get('/:id', validateId, getLessonByIdController);

router.put('/:id', validateId, [
  body('title').optional().trim().isLength({ min: 3, max: 200 }).withMessage('Lesson title must be between 3 and 200 characters'),
  body('content').optional().trim().isLength({ max: 10000 }).withMessage('Content cannot exceed 10000 characters'),
  body('video_url').optional().isURL().withMessage('Video URL must be a valid URL'),
  body('video_duration').optional().isInt({ min: 0 }).withMessage('Video duration must be a non-negative integer'),
  body('position').optional().isInt({ min: 1 }).withMessage('Position must be a positive integer'),
  body('is_published').optional().isBoolean().withMessage('Published status must be boolean'),
  handleValidationErrors
], updateLessonController);

router.delete('/:id', validateId, deleteLessonController);

// Lesson management operations
router.put('/:id/publish', validateId, toggleLessonPublishStatusController);

router.post('/:id/duplicate', validateId, [
  body('targetModuleId').isInt({ min: 1 }).withMessage('Target module ID is required'),
  handleValidationErrors
], duplicateLessonController);

// Lesson analytics
router.get('/:id/stats', validateId, getLessonStatsController);

// Reorder lessons in module
router.put('/module/:module_id/reorder', [
  body('lessonPositions').isArray({ min: 1 }).withMessage('Lesson positions array is required'),
  handleValidationErrors
], reorderLessonsController);

export default router;