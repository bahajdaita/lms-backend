import { body, param, query, validationResult } from 'express-validator';
import { AppError } from './errorHandler.js';

// Handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    
    return next(new AppError(`Validation failed: ${errorMessages.map(e => e.message).join(', ')}`, 400));
  }
  
  next();
};

// User validation rules
export const validateUserRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('role')
    .optional()
    .isIn(['student', 'instructor', 'admin'])
    .withMessage('Role must be student, instructor, or admin'),
  
  handleValidationErrors
];

export const validateUserLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  handleValidationErrors
];

export const validateUserUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('role')
    .optional()
    .isIn(['student', 'instructor', 'admin'])
    .withMessage('Role must be student, instructor, or admin'),
  
  handleValidationErrors
];

// Course validation rules
export const validateCourseCreation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Course title must be between 3 and 200 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  
  body('category_id')
    .isInt({ min: 1 })
    .withMessage('Valid category ID is required'),
  
  body('level')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Level must be beginner, intermediate, or advanced'),
  
  body('duration_weeks')
    .optional()
    .isInt({ min: 1, max: 52 })
    .withMessage('Duration must be between 1 and 52 weeks'),
  
  handleValidationErrors
];

export const validateCourseUpdate = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Course title must be between 3 and 200 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  
  body('category_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid category ID is required'),
  
  body('level')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Level must be beginner, intermediate, or advanced'),
  
  body('duration_weeks')
    .optional()
    .isInt({ min: 1, max: 52 })
    .withMessage('Duration must be between 1 and 52 weeks'),
  
  body('is_published')
    .optional()
    .isBoolean()
    .withMessage('Published status must be boolean'),
  
  handleValidationErrors
];

// Module validation rules
export const validateModuleCreation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Module title must be between 3 and 200 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  
  body('course_id')
    .isInt({ min: 1 })
    .withMessage('Valid course ID is required'),
  
  body('position')
    .isInt({ min: 1 })
    .withMessage('Position must be a positive integer'),
  
  handleValidationErrors
];

// Lesson validation rules
export const validateLessonCreation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Lesson title must be between 3 and 200 characters'),
  
  body('content')
    .optional()
    .trim()
    .isLength({ max: 10000 })
    .withMessage('Content cannot exceed 10000 characters'),
  
  body('video_url')
    .optional()
    .isURL()
    .withMessage('Video URL must be a valid URL'),
  
  body('module_id')
    .isInt({ min: 1 })
    .withMessage('Valid module ID is required'),
  
  body('position')
    .isInt({ min: 1 })
    .withMessage('Position must be a positive integer'),
  
  body('video_duration')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Video duration must be a non-negative integer'),
  
  handleValidationErrors
];

// Quiz validation rules
export const validateQuizCreation = [
  body('question')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Question must be between 10 and 1000 characters'),
  
  body('answer')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Answer must be between 1 and 500 characters'),
  
  body('lesson_id')
    .isInt({ min: 1 })
    .withMessage('Valid lesson ID is required'),
  
  body('quiz_type')
    .optional()
    .isIn(['multiple_choice', 'true_false', 'text'])
    .withMessage('Quiz type must be multiple_choice, true_false, or text'),
  
  body('points')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Points must be between 1 and 100'),
  
  body('options')
    .optional()
    .custom((value) => {
      if (value && typeof value === 'string') {
        try {
          JSON.parse(value);
          return true;
        } catch (e) {
          throw new Error('Options must be valid JSON');
        }
      }
      return true;
    }),
  
  handleValidationErrors
];

// Assignment validation rules
export const validateAssignmentCreation = [
  body('title')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Assignment title must be between 3 and 200 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  
  body('lesson_id')
    .isInt({ min: 1 })
    .withMessage('Valid lesson ID is required'),
  
  body('due_date')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  
  body('max_points')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Maximum points must be between 1 and 1000'),
  
  body('allow_late_submission')
    .optional()
    .isBoolean()
    .withMessage('Allow late submission must be boolean'),
  
  body('late_penalty_percent')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Late penalty must be between 0 and 100 percent'),
  
  handleValidationErrors
];

// Submission validation rules
export const validateSubmissionCreation = [
  body('content')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Content cannot exceed 5000 characters'),
  
  body('assignment_id')
    .isInt({ min: 1 })
    .withMessage('Valid assignment ID is required'),
  
  handleValidationErrors
];

export const validateSubmissionGrading = [
  body('grade')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Grade must be between 0 and 100'),
  
  body('feedback')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Feedback cannot exceed 1000 characters'),
  
  handleValidationErrors
];

// Parameter validation
export const validateId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),
  
  handleValidationErrors
];

// Query validation
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

export const validateSearch = [
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be between 1 and 100 characters'),
  
  query('category')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Category must be a valid ID'),
  
  query('level')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Level must be beginner, intermediate, or advanced'),
  
  handleValidationErrors
];

export default {
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validateUserUpdate,
  validateCourseCreation,
  validateCourseUpdate,
  validateModuleCreation,
  validateLessonCreation,
  validateQuizCreation,
  validateAssignmentCreation,
  validateSubmissionCreation,
  validateSubmissionGrading,
  validateId,
  validatePagination,
  validateSearch
};