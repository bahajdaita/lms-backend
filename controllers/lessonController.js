import {
  createLesson,
  getLessonById,
  getLessonsByModule,
  updateLesson,
  deleteLesson,
  reorderLessons,
  getNextLessonPosition,
  lessonTitleExistsInModule,
  getLessonWithCourseInfo,
  getAdjacentLessons,
  getLessonStats,
  duplicateLesson,
  toggleLessonPublishStatus,
  getCourseLessonsNavigation,
  searchLessonsInCourse
} from '../models/lessonModel.js';
import { getModuleWithCourse } from '../models/moduleModel.js';
import { getCourseById } from '../models/courseModel.js';
import {
  successResponse,
  errorResponse
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES, USER_ROLES } from '../utils/constants.js';

// Create new lesson
export const createLessonController = asyncHandler(async (req, res) => {
  const {
    module_id,
    title,
    content,
    video_url,
    video_duration,
    position,
    is_published = true
  } = req.body;
  const user = req.user;

  // Validate module exists and check ownership
  const moduleWithCourse = await getModuleWithCourse(module_id);
  if (!moduleWithCourse) {
    throw new AppError('Module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && moduleWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only add lessons to your own modules.', HTTP_STATUS.FORBIDDEN);
  }

  // Check if lesson title already exists in this module
  const titleExists = await lessonTitleExistsInModule(title, module_id);
  if (titleExists) {
    throw new AppError('Lesson title already exists in this module', HTTP_STATUS.CONFLICT);
  }

  // Get next position if not provided
  const lessonPosition = position || await getNextLessonPosition(module_id);

  const lessonData = {
    module_id,
    title: title.trim(),
    content: content?.trim(),
    video_url,
    video_duration: video_duration || null,
    position: lessonPosition,
    is_published
  };

  const lesson = await createLesson(lessonData);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    lesson,
    'Lesson created successfully'
  ));
});

// Get lesson by ID
export const getLessonByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { includeAssessments = false } = req.query;
  const user = req.user;

  const lesson = await getLessonById(parseInt(id), includeAssessments === 'true');
  if (!lesson) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check access permissions
  if (user.role === USER_ROLES.STUDENT) {
    // Students can only view published lessons of enrolled courses
    if (!lesson.is_published) {
      throw new AppError('Lesson not available', HTTP_STATUS.FORBIDDEN);
    }
    // TODO: Check if student is enrolled in the course
  } else if (user.role === USER_ROLES.INSTRUCTOR) {
    // Instructors can only view lessons of their courses
    if (lesson.instructor_id !== user.id) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
    }
  }

  // Get adjacent lessons for navigation
  const adjacentLessons = await getAdjacentLessons(parseInt(id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      ...lesson,
      navigation: adjacentLessons
    },
    'Lesson retrieved successfully'
  ));
});

// Get lessons by module
export const getLessonsByModuleController = asyncHandler(async (req, res) => {
  const { module_id } = req.params;
  const { includeUnpublished = false, includeAssessments = false } = req.query;
  const user = req.user;

  // Validate module exists and check permissions
  const moduleWithCourse = await getModuleWithCourse(parseInt(module_id));
  if (!moduleWithCourse) {
    throw new AppError('Module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Determine access permissions
  const canIncludeUnpublished = user.role === USER_ROLES.ADMIN || 
                                (user.role === USER_ROLES.INSTRUCTOR && moduleWithCourse.instructor_id === user.id);

  const options = {
    includeUnpublished: includeUnpublished === 'true' && canIncludeUnpublished,
    includeAssessments: includeAssessments === 'true'
  };

  const lessons = await getLessonsByModule(parseInt(module_id), options);

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      moduleId: parseInt(module_id),
      moduleTitle: moduleWithCourse.title,
      courseTitle: moduleWithCourse.course_title,
      lessons
    },
    'Lessons retrieved successfully'
  ));
});

// Update lesson
export const updateLessonController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    title,
    content,
    video_url,
    video_duration,
    position,
    is_published
  } = req.body;
  const user = req.user;

  // Get lesson with course info
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only update lessons in your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  const updates = {};

  if (title) {
    // Check if new title conflicts with other lessons in the same module
    const titleExists = await lessonTitleExistsInModule(title, lessonWithCourse.module_id, parseInt(id));
    if (titleExists) {
      throw new AppError('Lesson title already exists in this module', HTTP_STATUS.CONFLICT);
    }
    updates.title = title.trim();
  }

  if (content !== undefined) {
    updates.content = content?.trim();
  }

  if (video_url !== undefined) {
    updates.video_url = video_url;
  }

  if (video_duration !== undefined) {
    updates.video_duration = video_duration;
  }

  if (position) {
    updates.position = position;
  }

  if (is_published !== undefined) {
    updates.is_published = is_published;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', HTTP_STATUS.BAD_REQUEST);
  }

  const updatedLesson = await updateLesson(parseInt(id), updates);

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedLesson,
    'Lesson updated successfully'
  ));
});

// Delete lesson
export const deleteLessonController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get lesson with course info
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only delete lessons from your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  await deleteLesson(parseInt(id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'Lesson deleted successfully'
  ));
});

// Reorder lessons
export const reorderLessonsController = asyncHandler(async (req, res) => {
  const { module_id } = req.params;
  const { lessonPositions } = req.body;
  const user = req.user;

  // Validate module exists and check ownership
  const moduleWithCourse = await getModuleWithCourse(parseInt(module_id));
  if (!moduleWithCourse) {
    throw new AppError('Module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && moduleWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  // Validate lessonPositions array
  if (!Array.isArray(lessonPositions) || lessonPositions.length === 0) {
    throw new AppError('Lesson positions array is required', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate each position object
  for (const pos of lessonPositions) {
    if (!pos.id || !pos.position) {
      throw new AppError('Each position object must have id and position', HTTP_STATUS.BAD_REQUEST);
    }
  }

  await reorderLessons(parseInt(module_id), lessonPositions);

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'Lessons reordered successfully'
  ));
});

// Get lesson statistics
export const getLessonStatsController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get lesson with course info
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const stats = await getLessonStats(parseInt(id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      lessonId: parseInt(id),
      lessonTitle: lessonWithCourse.title,
      moduleTitle: lessonWithCourse.module_title,
      courseTitle: lessonWithCourse.course_title,
      stats
    },
    'Lesson statistics retrieved successfully'
  ));
});

// Duplicate lesson
export const duplicateLessonController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { targetModuleId } = req.body;
  const user = req.user;

  // Get original lesson with course info
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the source course or is admin
  if (user.role !== USER_ROLES.ADMIN && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  // Validate target module exists and check ownership
  const targetModule = await getModuleWithCourse(targetModuleId);
  if (!targetModule) {
    throw new AppError('Target module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the target course or is admin
  if (user.role !== USER_ROLES.ADMIN && targetModule.instructor_id !== user.id) {
    throw new AppError('Access denied to target module', HTTP_STATUS.FORBIDDEN);
  }

  const newLessonId = await duplicateLesson(parseInt(id), targetModuleId);
  const newLesson = await getLessonById(newLessonId);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    newLesson,
    'Lesson duplicated successfully'
  ));
});

// Toggle lesson publish status
export const toggleLessonPublishStatusController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get lesson with course info
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const updatedLesson = await toggleLessonPublishStatus(parseInt(id));
  const action = updatedLesson.is_published ? 'published' : 'unpublished';

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedLesson,
    `Lesson ${action} successfully`
  ));
});

// Get course lessons navigation
export const getCourseLessonsNavigationController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const user = req.user;

  // Get course to check access permissions
  const course = await getCourseById(parseInt(course_id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // For students, check if enrolled (simplified check here)
  // In a real implementation, you'd check enrollment status

  const navigation = await getCourseLessonsNavigation(parseInt(course_id), user.id);

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      courseTitle: course.title,
      navigation
    },
    'Course navigation retrieved successfully'
  ));
});

// Search lessons in course
export const searchLessonsInCourseController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const { q: searchTerm } = req.query;
  const user = req.user;

  if (!searchTerm || searchTerm.trim().length < 2) {
    throw new AppError('Search term must be at least 2 characters', HTTP_STATUS.BAD_REQUEST);
  }

  // Get course to check access permissions
  const course = await getCourseById(parseInt(course_id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  const lessons = await searchLessonsInCourse(parseInt(course_id), searchTerm.trim());

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      searchTerm: searchTerm.trim(),
      results: lessons
    },
    `Found ${lessons.length} lessons matching "${searchTerm}"`
  ));
});

export default {
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
};