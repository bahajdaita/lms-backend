import express from 'express';
import {
  enrollInCourse,
  getMyEnrollments,
  getEnrollmentByIdController,
  updateProgress,
  unenrollFromCourse,
  getCourseEnrollmentsController,
  getEnrollmentStatsController,
  getRecentEnrollmentsController,
  getInstructorEnrollmentsController,
  getCourseProgressController,
  getTopStudentsController,
  getRecommendedCoursesController,
  checkEnrollmentStatus,
  bulkEnrollUsers,
  getEnrollmentAnalytics
} from '../controllers/enrollmentController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateSubmissionCreation,
  validateSubmissionGrading,
  validateId,
  validatePagination
} from '../middleware/validation.js';
import { body, param } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Admin routes (put these FIRST to avoid conflicts)
router.get('/stats', authorize(USER_ROLES.ADMIN), getEnrollmentStatsController);
router.get('/recent', authorize(USER_ROLES.ADMIN, USER_ROLES.INSTRUCTOR), getRecentEnrollmentsController);

router.post('/bulk', authorize(USER_ROLES.ADMIN), [
  body('userIds').isArray({ min: 1 }).withMessage('User IDs array is required'),
  body('courseId').isInt({ min: 1 }).withMessage('Valid course ID is required'),
  handleValidationErrors
], bulkEnrollUsers);

// Student enrollment routes
router.post('/', [
  body('course_id').isInt({ min: 1 }).withMessage('Valid course ID is required'),
  handleValidationErrors
], enrollInCourse);

router.get('/my', validatePagination, getMyEnrollments);
router.get('/recommended', getRecommendedCoursesController);

// Instructor enrollment views
router.get('/instructor/:instructorId?', validatePagination, getInstructorEnrollmentsController);

// Course-specific routes
router.get('/course/:course_id/students', [
  param('course_id').isInt({ min: 1 }).withMessage('Course ID must be a positive integer'),
  handleValidationErrors
], validatePagination, getCourseEnrollmentsController);

router.get('/course/:course_id/top-students', [
  param('course_id').isInt({ min: 1 }).withMessage('Course ID must be a positive integer'),
  handleValidationErrors
], getTopStudentsController);

router.get('/course/:course_id/analytics', [
  param('course_id').isInt({ min: 1 }).withMessage('Course ID must be a positive integer'),
  handleValidationErrors
], getEnrollmentAnalytics);

router.get('/course/:course_id/status', [
  param('course_id').isInt({ min: 1 }).withMessage('Course ID must be a positive integer'),
  handleValidationErrors
], checkEnrollmentStatus);

router.get('/course/:course_id/progress', [
  param('course_id').isInt({ min: 1 }).withMessage('Course ID must be a positive integer'),
  handleValidationErrors
], getCourseProgressController);

// Enrollment management
router.get('/:id', validateId, getEnrollmentByIdController);

router.put('/course/:course_id/progress', [
  param('course_id').isInt({ min: 1 }).withMessage('Course ID must be a positive integer'),
  body('progress').isFloat({ min: 0, max: 100 }).withMessage('Progress must be between 0 and 100'),
  handleValidationErrors
], updateProgress);

router.delete('/course/:course_id', [
  param('course_id').isInt({ min: 1 }).withMessage('Course ID must be a positive integer'),
  handleValidationErrors
], unenrollFromCourse);

export default router;