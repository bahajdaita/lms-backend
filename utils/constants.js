// User roles
export const USER_ROLES = {
  STUDENT: 'student',
  INSTRUCTOR: 'instructor',
  ADMIN: 'admin'
};

// Course levels
export const COURSE_LEVELS = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced'
};

// Quiz types
export const QUIZ_TYPES = {
  MULTIPLE_CHOICE: 'multiple_choice',
  TRUE_FALSE: 'true_false',
  TEXT: 'text'
};

// File upload constants
export const FILE_UPLOAD = {
  MAX_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB
  ALLOWED_IMAGE_TYPES: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  ALLOWED_VIDEO_TYPES: ['mp4', 'mov', 'avi', 'mkv', 'webm'],
  ALLOWED_DOCUMENT_TYPES: ['pdf', 'doc', 'docx', 'txt', 'ppt', 'pptx'],
  ALLOWED_AUDIO_TYPES: ['mp3', 'wav', 'ogg', 'm4a'],
  AVATAR_PATH: 'uploads/avatars/',
  COURSE_CONTENT_PATH: 'uploads/courses/',
  ASSIGNMENT_PATH: 'uploads/assignments/'
};

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100
};

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Response messages
export const MESSAGES = {
  // Success messages
  SUCCESS: 'Operation completed successfully',
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  REGISTRATION_SUCCESS: 'Registration successful',
  
  // Error messages
  VALIDATION_ERROR: 'Validation failed',
  UNAUTHORIZED: 'Access denied. Please login.',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'Resource not found',
  INTERNAL_ERROR: 'An internal server error occurred',
  INVALID_CREDENTIALS: 'Invalid email or password',
  EMAIL_EXISTS: 'Email already exists',
  USER_NOT_FOUND: 'User not found',
  COURSE_NOT_FOUND: 'Course not found',
  ENROLLMENT_EXISTS: 'Already enrolled in this course',
  NOT_ENROLLED: 'You are not enrolled in this course',
  INVALID_TOKEN: 'Invalid or expired token',
  FILE_TOO_LARGE: 'File size exceeds maximum limit',
  INVALID_FILE_TYPE: 'File type not allowed'
};

// Grade constants
export const GRADES = {
  MIN_GRADE: 0,
  MAX_GRADE: 100,
  PASSING_GRADE: 60,
  LETTERS: {
    A: { min: 90, max: 100 },
    B: { min: 80, max: 89 },
    C: { min: 70, max: 79 },
    D: { min: 60, max: 69 },
    F: { min: 0, max: 59 }
  }
};

// Progress constants
export const PROGRESS = {
  MIN_PROGRESS: 0,
  MAX_PROGRESS: 100,
  COMPLETION_THRESHOLD: 100
};

// Time constants
export const TIME = {
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  HOURS_PER_DAY: 24,
  DAYS_PER_WEEK: 7,
  WEEKS_PER_MONTH: 4,
  MONTHS_PER_YEAR: 12
};

// Email templates
export const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  PASSWORD_RESET: 'password_reset',
  COURSE_ENROLLMENT: 'course_enrollment',
  ASSIGNMENT_DUE: 'assignment_due',
  GRADE_RECEIVED: 'grade_received'
};

// Course status
export const COURSE_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived'
};

// Enrollment status
export const ENROLLMENT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  DROPPED: 'dropped'
};

// Assignment status
export const ASSIGNMENT_STATUS = {
  NOT_SUBMITTED: 'not_submitted',
  SUBMITTED: 'submitted',
  GRADED: 'graded',
  LATE: 'late'
};

// API versioning
export const API_VERSION = {
  V1: 'v1'
};

// Cache durations (in seconds)
export const CACHE_DURATION = {
  SHORT: 300,    // 5 minutes
  MEDIUM: 1800,  // 30 minutes
  LONG: 3600,    // 1 hour
  DAILY: 86400   // 24 hours
};

// Rate limiting
export const RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS: 100,
  STRICT_WINDOW_MS: 5 * 60 * 1000, // 5 minutes for strict endpoints
  STRICT_MAX_REQUESTS: 20
};

// Search constants
export const SEARCH = {
  MIN_QUERY_LENGTH: 2,
  MAX_QUERY_LENGTH: 100,
  MAX_RESULTS: 50
};

// Content types
export const CONTENT_TYPES = {
  VIDEO: 'video',
  TEXT: 'text',
  QUIZ: 'quiz',
  ASSIGNMENT: 'assignment',
  DOCUMENT: 'document'
};

// Video constants
export const VIDEO = {
  MAX_DURATION: 7200, // 2 hours in seconds
  SUPPORTED_FORMATS: ['mp4', 'webm', 'mov', 'avi'],
  QUALITY_LEVELS: ['360p', '480p', '720p', '1080p']
};

// Database table names
export const TABLES = {
  USERS: 'users',
  CATEGORIES: 'categories',
  COURSES: 'courses',
  ENROLLMENTS: 'enrollments',
  MODULES: 'modules',
  LESSONS: 'lessons',
  QUIZZES: 'quizzes',
  ASSIGNMENTS: 'assignments',
  SUBMISSIONS: 'submissions'
};

// Default values
export const DEFAULTS = {
  COURSE_PRICE: 0.00,
  COURSE_DURATION: 1,
  COURSE_LEVEL: COURSE_LEVELS.BEGINNER,
  USER_ROLE: USER_ROLES.STUDENT,
  QUIZ_POINTS: 1,
  ASSIGNMENT_MAX_POINTS: 100,
  LATE_PENALTY_PERCENT: 10,
  PAGE_SIZE: 10,
  AVATAR_URL: '/uploads/avatars/default-avatar.png'
};

// Regular expressions
export const REGEX = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{6,}$/,
  PHONE: /^[\+]?[1-9][\d]{0,15}$/,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
};

// Error codes
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  FILE_UPLOAD_ERROR: 'FILE_UPLOAD_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR'
};

// Feature flags
export const FEATURES = {
  GOOGLE_AUTH: true,
  EMAIL_VERIFICATION: false,
  TWO_FACTOR_AUTH: false,
  COURSE_REVIEWS: true,
  DISCUSSION_FORUMS: false,
  LIVE_STREAMING: false,
  CERTIFICATES: true,
  NOTIFICATIONS: false
};

export default {
  USER_ROLES,
  COURSE_LEVELS,
  QUIZ_TYPES,
  FILE_UPLOAD,
  PAGINATION,
  HTTP_STATUS,
  MESSAGES,
  GRADES,
  PROGRESS,
  TIME,
  EMAIL_TEMPLATES,
  COURSE_STATUS,
  ENROLLMENT_STATUS,
  ASSIGNMENT_STATUS,
  API_VERSION,
  CACHE_DURATION,
  RATE_LIMIT,
  SEARCH,
  CONTENT_TYPES,
  VIDEO,
  TABLES,
  DEFAULTS,
  REGEX,
  ERROR_CODES,
  FEATURES
};