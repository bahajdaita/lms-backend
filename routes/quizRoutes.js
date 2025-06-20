import express from 'express';
import {
  createQuizController,
  getQuizByIdController,
  getQuizzesByLessonController,
  updateQuizController,
  deleteQuizController,
  submitQuizAnswersController,
  getQuizStatsController,
  bulkCreateQuizzesController,
  getQuizzesByCourseController,
  searchQuizzesInCourseController,
  duplicateQuizController,
  getRandomQuizQuestionsController
} from '../controllers/quizController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateQuizCreation,
  validateId,
  validateSearch
} from '../middleware/validation.js';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get quizzes by lesson
router.get('/lesson/:lesson_id', getQuizzesByLessonController);

// Course quiz operations
router.get('/course/:course_id', getQuizzesByCourseController);
router.get('/course/:course_id/search', validateSearch, searchQuizzesInCourseController);
router.get('/course/:course_id/random', getRandomQuizQuestionsController);

// Quiz submission (students)
router.post('/lesson/:lesson_id/submit', authorize(USER_ROLES.STUDENT), [
  body('answers').isObject().withMessage('Answers object is required'),
  handleValidationErrors
], submitQuizAnswersController);

// Quiz CRUD operations (instructors/admins)
router.post('/', authorize(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), validateQuizCreation, createQuizController);

router.get('/:id', validateId, getQuizByIdController);

router.put('/:id', validateId, [
  body('question').optional().trim().isLength({ min: 10, max: 1000 }).withMessage('Question must be between 10 and 1000 characters'),
  body('answer').optional().trim().isLength({ min: 1, max: 500 }).withMessage('Answer must be between 1 and 500 characters'),
  body('quiz_type').optional().isIn(['multiple_choice', 'true_false', 'text']).withMessage('Invalid quiz type'),
  body('points').optional().isInt({ min: 1, max: 100 }).withMessage('Points must be between 1 and 100'),
  handleValidationErrors
], updateQuizController);

router.delete('/:id', validateId, deleteQuizController);

// Bulk operations
router.post('/lesson/:lesson_id/bulk', authorize(USER_ROLES.INSTRUCTOR, USER_ROLES.ADMIN), [
  body('quizzes').isArray({ min: 1 }).withMessage('Quizzes array is required'),
  handleValidationErrors
], bulkCreateQuizzesController);

// Quiz management
router.post('/:id/duplicate', validateId, [
  body('targetLessonId').isInt({ min: 1 }).withMessage('Target lesson ID is required'),
  handleValidationErrors
], duplicateQuizController);

// Quiz analytics
router.get('/lesson/:lesson_id/stats', validateId, getQuizStatsController);

export default router;