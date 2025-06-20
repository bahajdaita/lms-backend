import express from 'express';
import {
  submitAssignmentController,
  getSubmissionByIdController,
  getSubmissionsByAssignmentController,
  gradeSubmissionController,
  getMySubmissionsController,
  updateSubmissionController,
  deleteSubmissionController,
  bulkGradeSubmissionsController,
  getSubmissionStatsController
} from '../controllers/submissionController.js';
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

// Student submission routes
router.post('/assignment/:assignment_id', authorize(USER_ROLES.STUDENT), [
  param('assignment_id').isInt({ min: 1 }).withMessage('Valid assignment ID is required'),
  body('content').optional().trim().isLength({ max: 5000 }).withMessage('Content cannot exceed 5000 characters'),
  body('file_path').optional().isString().withMessage('File path must be a string'),
  handleValidationErrors
], submitAssignmentController);

router.get('/my', validatePagination, getMySubmissionsController);

router.put('/:id', authorize(USER_ROLES.STUDENT), validateId, [
  body('content').optional().trim().isLength({ max: 5000 }).withMessage('Content cannot exceed 5000 characters'),
  body('file_path').optional().isString().withMessage('File path must be a string'),
  handleValidationErrors
], updateSubmissionController);

router.delete('/:id', authorize(USER_ROLES.STUDENT), validateId, deleteSubmissionController);

// Instructor/Admin submission management
router.get('/:id', validateId, getSubmissionByIdController);

router.get('/assignment/:assignment_id', validatePagination, getSubmissionsByAssignmentController);

router.put('/:id/grade', authorize(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), validateId, validateSubmissionGrading, gradeSubmissionController);

// Bulk operations (instructors/admins)
router.post('/assignment/:assignment_id/bulk-grade', authorize(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), [
  body('grades').isArray({ min: 1 }).withMessage('Grades array is required'),
  handleValidationErrors
], bulkGradeSubmissionsController);

// Submission analytics
router.get('/assignment/:assignment_id/stats', authorize(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), validateId, getSubmissionStatsController);

export default router;