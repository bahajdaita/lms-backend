import {
  createQuiz,
  getQuizById,
  getQuizzesByLesson,
  getQuizQuestionsForStudent,
  updateQuiz,
  deleteQuiz,
  submitQuizAnswers,
  getQuizStats,
  bulkCreateQuizzes,
  getQuizzesByCourse,
  searchQuizzesInCourse,
  duplicateQuiz,
  validateQuizAnswers,
  getRandomQuizQuestions
} from '../models/quizModel.js';
import { getLessonWithCourseInfo } from '../models/lessonModel.js';
import { getCourseById } from '../models/courseModel.js';
import {
  successResponse,
  errorResponse
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES, USER_ROLES, QUIZ_TYPES } from '../utils/constants.js';

// Create new quiz
export const createQuizController = asyncHandler(async (req, res) => {
  const {
    lesson_id,
    question,
    answer,
    options,
    quiz_type = 'text',
    points = 1
  } = req.body;
  const user = req.user;

  // Validate lesson exists and check ownership
  const lessonWithCourse = await getLessonWithCourseInfo(lesson_id);
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only add quizzes to your own lessons.', HTTP_STATUS.FORBIDDEN);
  }

  // Validate quiz type
  if (!Object.values(QUIZ_TYPES).includes(quiz_type)) {
    throw new AppError('Invalid quiz type', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate options for multiple choice quizzes
  if (quiz_type === QUIZ_TYPES.MULTIPLE_CHOICE && (!options || !Array.isArray(options))) {
    throw new AppError('Options are required for multiple choice quizzes', HTTP_STATUS.BAD_REQUEST);
  }

  const quizData = {
    lesson_id,
    question: question.trim(),
    answer: answer.trim(),
    options: quiz_type === QUIZ_TYPES.MULTIPLE_CHOICE ? JSON.stringify(options) : null,
    quiz_type,
    points
  };

  const quiz = await createQuiz(quizData);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    quiz,
    'Quiz created successfully'
  ));
});

// Get quiz by ID (instructor view)
export const getQuizByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const quiz = await getQuizById(parseInt(id));
  if (!quiz) {
    throw new AppError('Quiz not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && quiz.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    quiz,
    'Quiz retrieved successfully'
  ));
});

// Get quizzes by lesson
export const getQuizzesByLessonController = asyncHandler(async (req, res) => {
  const { lesson_id } = req.params;
  const { forStudent = false } = req.query;
  const user = req.user;

  // Validate lesson exists
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(lesson_id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  let quizzes;

  if (forStudent === 'true' && user.role === USER_ROLES.STUDENT) {
    // Students get questions only (no answers)
    quizzes = await getQuizQuestionsForStudent(parseInt(lesson_id));
  } else {
    // Instructors/admins get full quiz data
    if (user.role === USER_ROLES.INSTRUCTOR && lessonWithCourse.instructor_id !== user.id) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
    }
    quizzes = await getQuizzesByLesson(parseInt(lesson_id));
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      lessonId: parseInt(lesson_id),
      lessonTitle: lessonWithCourse.title,
      quizzes
    },
    'Quizzes retrieved successfully'
  ));
});

// Update quiz
export const updateQuizController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    question,
    answer,
    options,
    quiz_type,
    points
  } = req.body;
  const user = req.user;

  // Get quiz with course info
  const quiz = await getQuizById(parseInt(id));
  if (!quiz) {
    throw new AppError('Quiz not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && quiz.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const updates = {};

  if (question) {
    updates.question = question.trim();
  }

  if (answer) {
    updates.answer = answer.trim();
  }

  if (quiz_type && Object.values(QUIZ_TYPES).includes(quiz_type)) {
    updates.quiz_type = quiz_type;
  }

  if (options !== undefined) {
    updates.options = quiz_type === QUIZ_TYPES.MULTIPLE_CHOICE ? JSON.stringify(options) : null;
  }

  if (points) {
    updates.points = points;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', HTTP_STATUS.BAD_REQUEST);
  }

  const updatedQuiz = await updateQuiz(parseInt(id), updates);

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedQuiz,
    'Quiz updated successfully'
  ));
});

// Delete quiz
export const deleteQuizController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get quiz with course info
  const quiz = await getQuizById(parseInt(id));
  if (!quiz) {
    throw new AppError('Quiz not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && quiz.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  await deleteQuiz(parseInt(id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'Quiz deleted successfully'
  ));
});

// Submit quiz answers (students)
export const submitQuizAnswersController = asyncHandler(async (req, res) => {
  const { lesson_id } = req.params;
  const { answers } = req.body;
  const user = req.user;

  if (user.role !== USER_ROLES.STUDENT) {
    throw new AppError('Only students can submit quiz answers', HTTP_STATUS.FORBIDDEN);
  }

  // Validate lesson exists
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(lesson_id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // TODO: Check if student is enrolled in the course

  if (!answers || typeof answers !== 'object') {
    throw new AppError('Answers object is required', HTTP_STATUS.BAD_REQUEST);
  }

  // Get quizzes for validation
  const quizzes = await getQuizzesByLesson(parseInt(lesson_id));
  if (quizzes.length === 0) {
    throw new AppError('No quizzes found for this lesson', HTTP_STATUS.NOT_FOUND);
  }

  // Validate answers format
  const validationErrors = validateQuizAnswers(answers, quizzes);
  if (validationErrors.length > 0) {
    throw new AppError(validationErrors.join(', '), HTTP_STATUS.BAD_REQUEST);
  }

  // Submit and grade answers
  const results = await submitQuizAnswers(parseInt(lesson_id), answers, user.id);

  res.status(HTTP_STATUS.OK).json(successResponse(
    results,
    'Quiz submitted and graded successfully'
  ));
});

// Get quiz statistics
export const getQuizStatsController = asyncHandler(async (req, res) => {
  const { lesson_id } = req.params;
  const user = req.user;

  // Validate lesson exists and check ownership
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(lesson_id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const stats = await getQuizStats(parseInt(lesson_id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      lessonId: parseInt(lesson_id),
      lessonTitle: lessonWithCourse.title,
      stats
    },
    'Quiz statistics retrieved successfully'
  ));
});

// Bulk create quizzes
export const bulkCreateQuizzesController = asyncHandler(async (req, res) => {
  const { lesson_id } = req.params;
  const { quizzes } = req.body;
  const user = req.user;

  // Validate lesson exists and check ownership
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(lesson_id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  if (!Array.isArray(quizzes) || quizzes.length === 0) {
    throw new AppError('Quizzes array is required', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate each quiz
  for (const quiz of quizzes) {
    if (!quiz.question || !quiz.answer) {
      throw new AppError('Each quiz must have question and answer', HTTP_STATUS.BAD_REQUEST);
    }
    if (quiz.quiz_type && !Object.values(QUIZ_TYPES).includes(quiz.quiz_type)) {
      throw new AppError('Invalid quiz type', HTTP_STATUS.BAD_REQUEST);
    }
  }

  const createdQuizzes = await bulkCreateQuizzes(parseInt(lesson_id), quizzes);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    createdQuizzes,
    `${createdQuizzes.length} quizzes created successfully`
  ));
});

// Get quizzes by course (instructor view)
export const getQuizzesByCourseController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const user = req.user;

  // Validate course exists and check ownership
  const course = await getCourseById(parseInt(course_id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && course.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const quizzes = await getQuizzesByCourse(parseInt(course_id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      courseTitle: course.title,
      quizzes
    },
    'Course quizzes retrieved successfully'
  ));
});

// Search quizzes in course
export const searchQuizzesInCourseController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const { q: searchTerm } = req.query;
  const user = req.user;

  if (!searchTerm || searchTerm.trim().length < 2) {
    throw new AppError('Search term must be at least 2 characters', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate course exists and check ownership
  const course = await getCourseById(parseInt(course_id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && course.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const quizzes = await searchQuizzesInCourse(parseInt(course_id), searchTerm.trim());

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      searchTerm: searchTerm.trim(),
      results: quizzes
    },
    `Found ${quizzes.length} quizzes matching "${searchTerm}"`
  ));
});

// Duplicate quiz
export const duplicateQuizController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { targetLessonId } = req.body;
  const user = req.user;

  // Get original quiz
  const quiz = await getQuizById(parseInt(id));
  if (!quiz) {
    throw new AppError('Quiz not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the source course or is admin
  if (user.role !== USER_ROLES.ADMIN && quiz.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  // Validate target lesson exists and check ownership
  const targetLesson = await getLessonWithCourseInfo(targetLessonId);
  if (!targetLesson) {
    throw new AppError('Target lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the target course or is admin
  if (user.role !== USER_ROLES.ADMIN && targetLesson.instructor_id !== user.id) {
    throw new AppError('Access denied to target lesson', HTTP_STATUS.FORBIDDEN);
  }

  const duplicatedQuiz = await duplicateQuiz(parseInt(id), targetLessonId);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    duplicatedQuiz,
    'Quiz duplicated successfully'
  ));
});

// Get random quiz questions for practice
export const getRandomQuizQuestionsController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const { limit = 10 } = req.query;
  const user = req.user;

  // Validate course exists
  const course = await getCourseById(parseInt(course_id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // For students, check if enrolled (simplified check here)
  // TODO: Check enrollment status

  const questions = await getRandomQuizQuestions(parseInt(course_id), parseInt(limit));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      courseTitle: course.title,
      questions
    },
    'Random quiz questions retrieved successfully'
  ));
});

export default {
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
};