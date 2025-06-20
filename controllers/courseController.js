import {
  createCourse,
  getCourseById,
  getAllCourses,
  updateCourse,
  deleteCourse,
  getCoursesByInstructor,
  getFeaturedCourses,
  searchCourses,
  getCourseStats,
  isUserEnrolled,
  courseTitleExistsForInstructor,
  getCoursesByCategory
} from '../models/courseModel.js';
import { getCategoryById } from '../models/categoryModel.js';
import { query } from '../database/connection.js';
import {
  getPaginationParams,
  getPaginationMeta,
  successResponse,
  errorResponse
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES, USER_ROLES, COURSE_LEVELS } from '../utils/constants.js';

// Get all courses
export const getCourses = asyncHandler(async (req, res) => {
  const { page, limit } = getPaginationParams(req);
  const {
    category_id,
    level,
    search,
    instructor_id,
    is_published,
    sortBy,
    sortOrder
  } = req.query;

  const options = {
    page,
    limit,
    category_id: category_id ? parseInt(category_id) : null,
    level,
    search,
    instructor_id: instructor_id ? parseInt(instructor_id) : null,
    is_published: is_published !== undefined ? is_published === 'true' : null,
    sortBy: sortBy || 'created_at',
    sortOrder: sortOrder || 'DESC'
  };

  const result = await getAllCourses(options);

  const meta = getPaginationMeta(page, limit, result.totalCount);

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courses: result.courses,
      meta
    },
    'Courses retrieved successfully'
  ));
});

// Get course by ID
export const getCourseByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { includeModules = false } = req.query;
  const user = req.user;

  const course = await getCourseById(parseInt(id), includeModules === 'true');
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user is enrolled (for students)
  let isEnrolled = false;
  if (user && user.role === USER_ROLES.STUDENT) {
    isEnrolled = await isUserEnrolled(user.id, course.id);
  }

  // Include enrollment status in response
  const courseData = {
    ...course,
    isEnrolled
  };

  res.status(HTTP_STATUS.OK).json(successResponse(
    courseData,
    'Course retrieved successfully'
  ));
});

// Create new course (Instructors only)
export const createCourseController = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    category_id,
    level = 'beginner',
    duration_weeks = 1,
    is_published = false
  } = req.body;

  const instructor_id = req.user.id;

  // Validate category exists
  const category = await getCategoryById(category_id);
  if (!category) {
    throw new AppError('Invalid category selected', HTTP_STATUS.BAD_REQUEST);
  }

  // Check if course title already exists for this instructor
  const titleExists = await courseTitleExistsForInstructor(title, instructor_id);
  if (titleExists) {
    throw new AppError('You already have a course with this title', HTTP_STATUS.CONFLICT);
  }

  // Validate level
  if (!Object.values(COURSE_LEVELS).includes(level)) {
    throw new AppError('Invalid course level', HTTP_STATUS.BAD_REQUEST);
  }

  const courseData = {
    title: title.trim(),
    description: description?.trim(),
    category_id,
    instructor_id,
    price: 0.00, // All courses are free as requested
    level,
    duration_weeks,
    is_published
  };

  const course = await createCourse(courseData);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    course,
    'Course created successfully'
  ));
});

// Update course
export const updateCourseController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const {
    title,
    description,
    category_id,
    level,
    duration_weeks,
    is_published
  } = req.body;

  // Get course to check ownership
  const course = await getCourseById(parseInt(id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && course.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only update your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  const updates = {};

  if (title) {
    // Check if new title conflicts with instructor's other courses
    const titleExists = await courseTitleExistsForInstructor(title, course.instructor_id, parseInt(id));
    if (titleExists) {
      throw new AppError('You already have another course with this title', HTTP_STATUS.CONFLICT);
    }
    updates.title = title.trim();
  }

  if (description !== undefined) {
    updates.description = description?.trim();
  }

  if (category_id) {
    const category = await getCategoryById(category_id);
    if (!category) {
      throw new AppError('Invalid category selected', HTTP_STATUS.BAD_REQUEST);
    }
    updates.category_id = category_id;
  }

  if (level && Object.values(COURSE_LEVELS).includes(level)) {
    updates.level = level;
  }

  if (duration_weeks) {
    updates.duration_weeks = duration_weeks;
  }

  if (is_published !== undefined) {
    updates.is_published = is_published;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', HTTP_STATUS.BAD_REQUEST);
  }

  const updatedCourse = await updateCourse(parseInt(id), updates);

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedCourse,
    'Course updated successfully'
  ));
});

// Delete course
export const deleteCourseController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get course to check ownership
  const course = await getCourseById(parseInt(id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && course.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only delete your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  await deleteCourse(parseInt(id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'Course deleted successfully'
  ));
});

// Get instructor's courses
export const getInstructorCourses = asyncHandler(async (req, res) => {
  const instructorId = req.params.instructorId || req.user.id;
  const { page = 1, limit = 10, includeUnpublished = false } = req.query;

  // Non-admins can only view their own courses with unpublished ones
  const canViewUnpublished = req.user.role === USER_ROLES.ADMIN || 
                            parseInt(instructorId) === req.user.id;

  const options = {
    includeUnpublished: includeUnpublished === 'true' && canViewUnpublished,
    page: parseInt(page),
    limit: parseInt(limit)
  };

  const courses = await getCoursesByInstructor(parseInt(instructorId), options);

  res.status(HTTP_STATUS.OK).json(successResponse(
    courses,
    'Instructor courses retrieved successfully'
  ));
});

// Get featured courses
export const getFeaturedCoursesController = asyncHandler(async (req, res) => {
  const { limit = 6 } = req.query;

  const courses = await getFeaturedCourses(parseInt(limit));

  res.status(HTTP_STATUS.OK).json(successResponse(
    courses,
    'Featured courses retrieved successfully'
  ));
});

// Search courses
export const searchCoursesController = asyncHandler(async (req, res) => {
  const { q: searchTerm, category_id, level, limit = 20 } = req.query;

  if (!searchTerm || searchTerm.trim().length < 2) {
    throw new AppError('Search term must be at least 2 characters', HTTP_STATUS.BAD_REQUEST);
  }

  const options = {
    category_id: category_id ? parseInt(category_id) : null,
    level,
    limit: Math.min(parseInt(limit), 50) // Max 50 results
  };

  const courses = await searchCourses(searchTerm.trim(), options);

  res.status(HTTP_STATUS.OK).json(successResponse(
    courses,
    `Found ${courses.length} courses matching "${searchTerm}"`
  ));
});

// Get course statistics (for instructors/admins)
export const getCourseStatsController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get course to check ownership
  const course = await getCourseById(parseInt(id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && course.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only view stats for your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  const stats = await getCourseStats(parseInt(id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    stats,
    'Course statistics retrieved successfully'
  ));
});

// Publish/Unpublish course
export const toggleCoursePublishStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get course to check ownership
  const course = await getCourseById(parseInt(id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && course.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only publish/unpublish your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  const updatedCourse = await updateCourse(parseInt(id), {
    is_published: !course.is_published
  });

  const action = updatedCourse.is_published ? 'published' : 'unpublished';

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedCourse,
    `Course ${action} successfully`
  ));
});

// Get courses by category
export const getCoursesByCategoryController = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { limit = 10, excludeCourseId } = req.query;

  const options = {
    limit: Math.min(parseInt(limit), 20),
    excludeCourseId: excludeCourseId ? parseInt(excludeCourseId) : null
  };

  const courses = await getCoursesByCategory(parseInt(categoryId), options);

  res.status(HTTP_STATUS.OK).json(successResponse(
    courses,
    'Courses retrieved successfully'
  ));
});

// Get course progress overview (for instructors)
export const getCourseProgress = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get course to check ownership
  const course = await getCourseById(parseInt(id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && course.instructor_id !== user.id) {
    throw new AppError('Access denied.', HTTP_STATUS.FORBIDDEN);
  }

  // Get enrollment progress data
  const progressData = await query(`
    SELECT 
      e.progress,
      COUNT(*) as student_count,
      CASE 
        WHEN e.progress = 0 THEN 'Not Started'
        WHEN e.progress < 25 THEN '0-25%'
        WHEN e.progress < 50 THEN '25-50%'
        WHEN e.progress < 75 THEN '50-75%'
        WHEN e.progress < 100 THEN '75-99%'
        ELSE 'Completed'
      END as progress_range
    FROM enrollments e
    WHERE e.course_id = $1
    GROUP BY 
      CASE 
        WHEN e.progress = 0 THEN 'Not Started'
        WHEN e.progress < 25 THEN '0-25%'
        WHEN e.progress < 50 THEN '25-50%'
        WHEN e.progress < 75 THEN '50-75%'
        WHEN e.progress < 100 THEN '75-99%'
        ELSE 'Completed'
      END, e.progress
    ORDER BY e.progress
  `, [id]);

  const progressDistribution = progressData.rows.map(row => ({
    range: row.progress_range,
    count: parseInt(row.student_count)
  }));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(id),
      courseTitle: course.title,
      progressDistribution
    },
    'Course progress data retrieved successfully'
  ));
});

// Duplicate course
export const duplicateCourse = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get original course
  const originalCourse = await getCourseById(parseInt(id), true);
  if (!originalCourse) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && originalCourse.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only duplicate your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  // Create new course with copied data
  const newCourseData = {
    title: `${originalCourse.title} (Copy)`,
    description: originalCourse.description,
    category_id: originalCourse.category_id,
    instructor_id: user.id,
    price: 0.00,
    level: originalCourse.level,
    duration_weeks: originalCourse.duration_weeks,
    is_published: false // Always create as unpublished
  };

  const newCourse = await createCourse(newCourseData);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    newCourse,
    'Course duplicated successfully'
  ));
});

export default {
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
};