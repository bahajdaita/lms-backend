import {
  createModule,
  getModuleById,
  getModulesByCourse,
  updateModule,
  deleteModule,
  reorderModules,
  getNextModulePosition,
  moduleTitleExistsInCourse,
  getModuleWithCourse,
  getModuleStats,
  duplicateModule,
  toggleModulePublishStatus
} from '../models/moduleModel.js';
import { getCourseById } from '../models/courseModel.js';
import {
  successResponse,
  errorResponse
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES, USER_ROLES } from '../utils/constants.js';

// Create new module
export const createModuleController = asyncHandler(async (req, res) => {
  const { course_id, title, description, position, is_published = true } = req.body;
  const user = req.user;

  // Validate course exists and check ownership
  const course = await getCourseById(course_id);
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && course.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only add modules to your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  // Check if module title already exists in this course
  const titleExists = await moduleTitleExistsInCourse(title, course_id);
  if (titleExists) {
    throw new AppError('Module title already exists in this course', HTTP_STATUS.CONFLICT);
  }

  // Get next position if not provided
  const modulePosition = position || await getNextModulePosition(course_id);

  const moduleData = {
    course_id,
    title: title.trim(),
    description: description?.trim(),
    position: modulePosition,
    is_published
  };

  const module = await createModule(moduleData);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    module,
    'Module created successfully'
  ));
});

// Get module by ID
export const getModuleByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { includeLessons = false } = req.query;
  const user = req.user;

  const module = await getModuleById(parseInt(id), includeLessons === 'true');
  if (!module) {
    throw new AppError('Module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check access permissions
  if (user.role === USER_ROLES.STUDENT) {
    // Students can only view published modules of enrolled courses
    if (!module.is_published) {
      throw new AppError('Module not available', HTTP_STATUS.FORBIDDEN);
    }
    // TODO: Check if student is enrolled in the course
  } else if (user.role === USER_ROLES.INSTRUCTOR) {
    // Instructors can only view modules of their courses
    if (module.instructor_id !== user.id) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
    }
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    module,
    'Module retrieved successfully'
  ));
});

// Get modules by course
export const getModulesByCourseController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const { includeUnpublished = false, includeLessons = false } = req.query;
  const user = req.user;

  // Validate course exists
  const course = await getCourseById(parseInt(course_id));
  if (!course) {
    throw new AppError(MESSAGES.COURSE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Determine access permissions
  const canIncludeUnpublished = user.role === USER_ROLES.ADMIN || 
                                (user.role === USER_ROLES.INSTRUCTOR && course.instructor_id === user.id);

  const options = {
    includeUnpublished: includeUnpublished === 'true' && canIncludeUnpublished,
    includeLessons: includeLessons === 'true'
  };

  const modules = await getModulesByCourse(parseInt(course_id), options);

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      courseTitle: course.title,
      modules
    },
    'Modules retrieved successfully'
  ));
});

// Update module
export const updateModuleController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, position, is_published } = req.body;
  const user = req.user;

  // Get module with course info
  const moduleWithCourse = await getModuleWithCourse(parseInt(id));
  if (!moduleWithCourse) {
    throw new AppError('Module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && moduleWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only update modules in your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  const updates = {};

  if (title) {
    // Check if new title conflicts with other modules in the same course
    const titleExists = await moduleTitleExistsInCourse(title, moduleWithCourse.course_id, parseInt(id));
    if (titleExists) {
      throw new AppError('Module title already exists in this course', HTTP_STATUS.CONFLICT);
    }
    updates.title = title.trim();
  }

  if (description !== undefined) {
    updates.description = description?.trim();
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

  const updatedModule = await updateModule(parseInt(id), updates);

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedModule,
    'Module updated successfully'
  ));
});

// Delete module
export const deleteModuleController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get module with course info
  const moduleWithCourse = await getModuleWithCourse(parseInt(id));
  if (!moduleWithCourse) {
    throw new AppError('Module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && moduleWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only delete modules from your own courses.', HTTP_STATUS.FORBIDDEN);
  }

  try {
    await deleteModule(parseInt(id));

    res.status(HTTP_STATUS.OK).json(successResponse(
      null,
      'Module deleted successfully'
    ));
  } catch (error) {
    if (error.message.includes('associated lessons')) {
      throw new AppError(error.message, HTTP_STATUS.CONFLICT);
    }
    throw error;
  }
});

// Reorder modules
export const reorderModulesController = asyncHandler(async (req, res) => {
  const { course_id } = req.params;
  const { modulePositions } = req.body;
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

  // Validate modulePositions array
  if (!Array.isArray(modulePositions) || modulePositions.length === 0) {
    throw new AppError('Module positions array is required', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate each position object
  for (const pos of modulePositions) {
    if (!pos.id || !pos.position) {
      throw new AppError('Each position object must have id and position', HTTP_STATUS.BAD_REQUEST);
    }
  }

  await reorderModules(parseInt(course_id), modulePositions);

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'Modules reordered successfully'
  ));
});

// Get module statistics
export const getModuleStatsController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get module with course info
  const moduleWithCourse = await getModuleWithCourse(parseInt(id));
  if (!moduleWithCourse) {
    throw new AppError('Module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && moduleWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const stats = await getModuleStats(parseInt(id));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      moduleId: parseInt(id),
      moduleTitle: moduleWithCourse.title,
      courseTitle: moduleWithCourse.course_title,
      stats
    },
    'Module statistics retrieved successfully'
  ));
});

// Duplicate module
export const duplicateModuleController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { targetCourseId } = req.body;
  const user = req.user;

  // Get original module with course info
  const moduleWithCourse = await getModuleWithCourse(parseInt(id));
  if (!moduleWithCourse) {
    throw new AppError('Module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the source course or is admin
  if (user.role !== USER_ROLES.ADMIN && moduleWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  // Validate target course exists and check ownership
  const targetCourse = await getCourseById(targetCourseId);
  if (!targetCourse) {
    throw new AppError('Target course not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the target course or is admin
  if (user.role !== USER_ROLES.ADMIN && targetCourse.instructor_id !== user.id) {
    throw new AppError('Access denied to target course', HTTP_STATUS.FORBIDDEN);
  }

  const newModuleId = await duplicateModule(parseInt(id), targetCourseId);
  const newModule = await getModuleById(newModuleId);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    newModule,
    'Module duplicated successfully'
  ));
});

// Toggle module publish status
export const toggleModulePublishStatusController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get module with course info
  const moduleWithCourse = await getModuleWithCourse(parseInt(id));
  if (!moduleWithCourse) {
    throw new AppError('Module not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && moduleWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const updatedModule = await toggleModulePublishStatus(parseInt(id));
  const action = updatedModule.is_published ? 'published' : 'unpublished';

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedModule,
    `Module ${action} successfully`
  ));
});

export default {
  createModuleController,
  getModuleByIdController,
  getModulesByCourseController,
  updateModuleController,
  deleteModuleController,
  reorderModulesController,
  getModuleStatsController,
  duplicateModuleController,
  toggleModulePublishStatusController
};