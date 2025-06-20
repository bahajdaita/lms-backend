import express from 'express';
import {
  getCourses,
  getCourseByIdController,
  createCourseController,
  updateCourseController,
  deleteCourseController,
  getInstructorCourses,
  getFeaturedCoursesController,
  searchCoursesController,
  getCourseStatsController,
  toggleCoursePublishStatus,
  getCoursesByCategoryController,
  getCourseProgress,
  duplicateCourse
} from '../controllers/courseController.js';
import { authenticate, authorize, authorizeInstructor, optionalAuth } from '../middleware/auth.js';
import {
  validateCourseCreation,
  validateCourseUpdate,
  validateId,
  validatePagination,
  validateSearch
} from '../middleware/validation.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// Public routes (no authentication required)
router.get('/', optionalAuth, validatePagination, getCourses);
router.get('/featured', getFeaturedCoursesController);
router.get('/search', validateSearch, searchCoursesController);
router.get('/category/:categoryId', getCoursesByCategoryController);

// Public course details (with optional auth for enrollment status)
router.get('/:id', optionalAuth, validateId, getCourseByIdController);

// Protected routes (authentication required)
router.use(authenticate);

// Instructor routes
router.post('/', authorize(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), validateCourseCreation, createCourseController);
router.get('/instructor/:instructorId?', getInstructorCourses);

// Course management routes (instructor/admin)
router.put('/:id', validateId, validateCourseUpdate, authorizeInstructor, updateCourseController);
router.delete('/:id', validateId, authorizeInstructor, deleteCourseController);
router.put('/:id/publish', validateId, authorizeInstructor, toggleCoursePublishStatus);
router.post('/:id/duplicate', validateId, authorizeInstructor, duplicateCourse);

// Course statistics and analytics (instructor/admin)
router.get('/:id/stats', validateId, authorizeInstructor, getCourseStatsController);
router.get('/:id/progress', validateId, authorizeInstructor, getCourseProgress);

export default router;