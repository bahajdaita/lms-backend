import {
  createEnrollment,
  getEnrollmentById,
  getUserEnrollments,
  getCourseEnrollments,
  updateEnrollmentProgress,
  isUserEnrolled,
  getEnrollmentByUserAndCourse,
  deleteEnrollment,
  getEnrollmentStats,
  getRecentEnrollments,
  getInstructorEnrollments,
  calculateCourseProgress,
  getTopStudents,
  getRecommendedCourses
} from '../models/enrollmentModel.js';
import { getCourseById } from '../models/courseModel.js';
import { query } from '../database/connection.js';
import {
  getPaginationParams,
  getPaginationMeta,
  successResponse,
  errorResponse
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES, USER_ROLES } from '../utils/constants.js';

// Enroll in course
export const enrollInCourse = asyncHandler(async (req, res) => {
  const { course_id } = req.body;
  const userId = req.user.id;

  // Validate course exists and is published
  const course = await getCourseById(course_id);
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  if (!course.is_published) {
    throw new AppError('Cannot enroll in unpublished course', HTTP_STATUS.BAD_REQUEST);
  }

  // Check if user is already enrolled
  const alreadyEnrolled = await isUserEnrolled(userId, course_id);
  if (alreadyEnrolled) {
    throw new AppError('You are already enrolled in this course', HTTP_STATUS.CONFLICT);
  }

  // Create enrollment
  const enrollment = await createEnrollment(userId, course_id);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    enrollment,
    'Successfully enrolled in course'
  ));
});

// Get user's enrollments
export const getMyEnrollments = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page, limit } = getPaginationParams(req);
  const { completed, sortBy, sortOrder } = req.query;

  const options = {
    page,
    limit,
    completed: completed !== undefined ? completed === 'true' : null,
    sortBy: sortBy || 'enrolled_at',
    sortOrder: sortOrder || 'DESC'
  };

  const result = await getUserEnrollments(userId, options);

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      enrollments: result.enrollments,
      meta: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: result.totalCount,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    },
    'Enrollments retrieved successfully'
  ));
});

// Get enrollment by ID
export const getEnrollmentByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const enrollment = await getEnrollmentById(parseInt(id));
  if (!enrollment) {
    throw new AppError('Enrollment not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user can access this enrollment
  if (user.role === USER_ROLES.STUDENT && enrollment.user_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  if (user.role === USER_ROLES.INSTRUCTOR && enrollment.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    enrollment,
    'Enrollment retrieved successfully'
  ));
});

// Update enrollment progress
export const updateProgress = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const { progress } = req.body;
  const userId = req.user.id;

  // Validate progress value
  if (progress < 0 || progress > 100) {
    throw new AppError('Progress must be between 0 and 100', HTTP_STATUS.BAD_REQUEST);
  }

  // Check if user is enrolled
  const enrollment = await getEnrollmentByUserAndCourse(userId, parseInt(course_id));
  if (!enrollment) {
    throw new AppError('You are not enrolled in this course', HTTP_STATUS.NOT_FOUND);
  }

  // Update progress
  const updatedEnrollment = await updateEnrollmentProgress(userId, parseInt(course_id), progress);

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedEnrollment,
    'Progress updated successfully'
  ));
});

// Unenroll from course
export const unenrollFromCourse = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const userId = req.user.id;

  // Check if user is enrolled
  const enrollment = await getEnrollmentByUserAndCourse(userId, parseInt(course_id));
  if (!enrollment) {
    throw new AppError('You are not enrolled in this course', HTTP_STATUS.NOT_FOUND);
  }

  // Delete enrollment
  await deleteEnrollment(userId, parseInt(course_id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'Successfully unenrolled from course'
  ));
});

// Get course enrollments (for instructors)
export const getCourseEnrollmentsController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const user = req.user;
  const { page, limit } = getPaginationParams(req);
  const { sortBy, sortOrder } = req.query;

  // Validate course exists and check ownership
  const course = await getCourseById(parseInt(course_id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && course.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const options = {
    page,
    limit,
    sortBy: sortBy || 'enrolled_at',
    sortOrder: sortOrder || 'DESC'
  };

  const result = await getCourseEnrollments(parseInt(course_id), options);

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      courseTitle: course.title,
      enrollments: result.enrollments,
      meta: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: result.totalCount,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    },
    'Course enrollments retrieved successfully'
  ));
});

// Get enrollment statistics (admin only)
export const getEnrollmentStatsController = asyncHandler(async (req, res) => {
  const stats = await getEnrollmentStats();

  res.status(HTTP_STATUS.OK).json(successResponse(
    stats,
    'Enrollment statistics retrieved successfully'
  ));
});

// Get recent enrollments (admin/instructor dashboard)
export const getRecentEnrollmentsController = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const user = req.user;

  let enrollments;

  if (user.role === USER_ROLES.ADMIN) {
    // Admin sees all recent enrollments
    enrollments = await getRecentEnrollments(parseInt(limit));
  } else if (user.role === USER_ROLES.INSTRUCTOR) {
    // Instructor sees enrollments for their courses
    const result = await getInstructorEnrollments(user.id, {
      limit: parseInt(limit),
      page: 1
    });
    enrollments = result.enrollments;
  } else {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    enrollments,
    'Recent enrollments retrieved successfully'
  ));
});

// Get instructor enrollments
export const getInstructorEnrollmentsController = asyncHandler(async (req, res) => {
  const instructorId = req.params.instructorId || req.user.id;
  const { page, limit } = getPaginationParams(req);
  const { course_id, completed } = req.query;
  const user = req.user;

  // Check if user can access these enrollments
  if (user.role !== USER_ROLES.ADMIN && parseInt(instructorId) !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const options = {
    page,
    limit,
    courseId: course_id ? parseInt(course_id) : null,
    completed: completed !== undefined ? completed === 'true' : null
  };

  const result = await getInstructorEnrollments(parseInt(instructorId), options);

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      instructorId: parseInt(instructorId),
      enrollments: result.enrollments,
      meta: {
        currentPage: result.currentPage,
        totalPages: result.totalPages,
        totalCount: result.totalCount,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    },
    'Instructor enrollments retrieved successfully'
  ));
});

// Calculate detailed course progress
export const getCourseProgressController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const userId = req.user.id;

  // Check if user is enrolled
  const enrollment = await getEnrollmentByUserAndCourse(userId, parseInt(course_id));
  if (!enrollment) {
    throw new AppError('You are not enrolled in this course', HTTP_STATUS.NOT_FOUND);
  }

  const progressData = await calculateCourseProgress(userId, parseInt(course_id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      userId,
      enrollment: {
        progress: enrollment.progress,
        completed: enrollment.completed,
        enrolledAt: enrollment.enrolled_at,
        completedAt: enrollment.completed_at
      },
      detailedProgress: progressData
    },
    'Course progress retrieved successfully'
  ));
});

// Get top performing students (for instructors)
export const getTopStudentsController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const { limit = 10 } = req.query;
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

  const topStudents = await getTopStudents(parseInt(course_id), parseInt(limit));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      courseTitle: course.title,
      topStudents
    },
    'Top students retrieved successfully'
  ));
});

// Get recommended courses for user
export const getRecommendedCoursesController = asyncHandler(async (req, res) => {
  const { limit = 5 } = req.query;
  const userId = req.user.id;

  const recommendedCourses = await getRecommendedCourses(userId, parseInt(limit));

  res.status(HTTP_STATUS.OK).json(successResponse(
    recommendedCourses,
    'Recommended courses retrieved successfully'
  ));
});

// Check enrollment status
export const checkEnrollmentStatus = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const userId = req.user.id;

  const isEnrolled = await isUserEnrolled(userId, parseInt(course_id));
  let enrollment = null;

  if (isEnrolled) {
    enrollment = await getEnrollmentByUserAndCourse(userId, parseInt(course_id));
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      userId,
      isEnrolled,
      enrollment
    },
    'Enrollment status retrieved successfully'
  ));
});

// Bulk enroll users (Admin only)
export const bulkEnrollUsers = asyncHandler(async (req, res) => {
  const { userIds, courseId } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new AppError('User IDs array is required', HTTP_STATUS.BAD_REQUEST);
  }

  if (!courseId) {
    throw new AppError('Course ID is required', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate course exists
  const course = await getCourseById(courseId);
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  const results = [];
  const errors = [];

  for (const userId of userIds) {
    try {
      // Check if already enrolled
      const alreadyEnrolled = await isUserEnrolled(parseInt(userId), courseId);
      if (alreadyEnrolled) {
        errors.push({ userId, error: 'Already enrolled' });
        continue;
      }

      // Create enrollment
      const enrollment = await createEnrollment(parseInt(userId), courseId);
      results.push(enrollment);
    } catch (error) {
      errors.push({ userId, error: error.message });
    }
  }

  res.status(HTTP_STATUS.OK).json(successResponse({
    enrollments: results,
    errors,
    enrolledCount: results.length,
    errorCount: errors.length,
    courseTitle: course.title
  }, `Bulk enrollment completed. ${results.length} users enrolled.`));
});

// Get enrollment analytics for course (instructor/admin)
export const getEnrollmentAnalytics = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const { days = 30 } = req.query;
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

  // Get enrollment trends
  const enrollmentTrends = await query(`
    SELECT 
      DATE(enrolled_at) as date,
      COUNT(*) as enrollments
    FROM enrollments
    WHERE course_id = $1 
      AND enrolled_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    GROUP BY DATE(enrolled_at)
    ORDER BY date DESC
  `, [course_id]);

  // Get completion trends
  const completionTrends = await query(`
    SELECT 
      DATE(completed_at) as date,
      COUNT(*) as completions
    FROM enrollments
    WHERE course_id = $1 
      AND completed = TRUE
      AND completed_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
    GROUP BY DATE(completed_at)
    ORDER BY date DESC
  `, [course_id]);

  // Get progress distribution
  const progressDistribution = await query(`
    SELECT 
      CASE 
        WHEN progress = 0 THEN 'Not Started'
        WHEN progress <= 25 THEN '0-25%'
        WHEN progress <= 50 THEN '26-50%'
        WHEN progress <= 75 THEN '51-75%'
        WHEN progress <= 99 THEN '76-99%'
        ELSE 'Completed'
      END as progress_range,
      COUNT(*) as student_count
    FROM enrollments
    WHERE course_id = $1
    GROUP BY 
      CASE 
        WHEN progress = 0 THEN 'Not Started'
        WHEN progress <= 25 THEN '0-25%'
        WHEN progress <= 50 THEN '26-50%'
        WHEN progress <= 75 THEN '51-75%'
        WHEN progress <= 99 THEN '76-99%'
        ELSE 'Completed'
      END
    ORDER BY MIN(progress)
  `, [course_id]);

  res.status(HTTP_STATUS.OK).json(successResponse({
    courseId: parseInt(course_id),
    courseTitle: course.title,
    enrollmentTrends: enrollmentTrends.rows.map(row => ({
      date: row.date,
      enrollments: parseInt(row.enrollments)
    })),
    completionTrends: completionTrends.rows.map(row => ({
      date: row.date,
      completions: parseInt(row.completions)
    })),
    progressDistribution: progressDistribution.rows.map(row => ({
      range: row.progress_range,
      count: parseInt(row.student_count)
    }))
  }, 'Enrollment analytics retrieved successfully'));
});

export default {
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
};