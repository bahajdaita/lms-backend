import { query, getClient } from '../database/connection.js';
import { getLessonWithCourseInfo } from '../models/lessonModel.js';
import { getCourseById } from '../models/courseModel.js';
import {
  successResponse,
  errorResponse,
  isDatePast
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES, USER_ROLES } from '../utils/constants.js';

// Create new assignment
export const createAssignmentController = asyncHandler(async (req, res) => {
  const {
    lesson_id,
    title,
    description,
    due_date,
    max_points = 100,
    allow_late_submission = true,
    late_penalty_percent = 10
  } = req.body;
  const user = req.user;

  // Validate lesson exists and check ownership
  const lessonWithCourse = await getLessonWithCourseInfo(lesson_id);
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied. You can only add assignments to your own lessons.', HTTP_STATUS.FORBIDDEN);
  }

  // Validate due date if provided
  if (due_date && isDatePast(due_date)) {
    throw new AppError('Due date cannot be in the past', HTTP_STATUS.BAD_REQUEST);
  }

  const result = await query(
    `INSERT INTO assignments (lesson_id, title, description, due_date, max_points, allow_late_submission, late_penalty_percent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, lesson_id, title, description, due_date, max_points, allow_late_submission, late_penalty_percent, created_at`,
    [lesson_id, title.trim(), description?.trim(), due_date, max_points, allow_late_submission, late_penalty_percent]
  );

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    result.rows[0],
    'Assignment created successfully'
  ));
});

// Get assignment by ID
export const getAssignmentByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const result = await query(
    `SELECT a.*, l.title as lesson_title, l.module_id, m.title as module_title,
            m.course_id, c.title as course_title, c.instructor_id,
            COUNT(s.id) as submission_count,
            COUNT(s.id) FILTER (WHERE s.grade IS NOT NULL) as graded_count
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     LEFT JOIN submissions s ON a.id = s.assignment_id
     WHERE a.id = $1 AND c.is_deleted = FALSE
     GROUP BY a.id, l.title, l.module_id, m.title, m.course_id, c.title, c.instructor_id`,
    [parseInt(id)]
  );

  if (result.rows.length === 0) {
    throw new AppError('Assignment not found', HTTP_STATUS.NOT_FOUND);
  }

  const assignment = result.rows[0];

  // Check access permissions
  if (user.role === USER_ROLES.STUDENT) {
    // Students can view assignments of enrolled courses
    // TODO: Check if student is enrolled in the course
  } else if (user.role === USER_ROLES.INSTRUCTOR) {
    if (assignment.instructor_id !== user.id) {
      throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
    }
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      ...assignment,
      submission_count: parseInt(assignment.submission_count),
      graded_count: parseInt(assignment.graded_count)
    },
    'Assignment retrieved successfully'
  ));
});

// Get assignments by lesson
export const getAssignmentsByLessonController = asyncHandler(async (req, res) => {
  const { lesson_id } = req.params;
  const user = req.user;

  // Validate lesson exists
  const lessonWithCourse = await getLessonWithCourseInfo(parseInt(lesson_id));
  if (!lessonWithCourse) {
    throw new AppError('Lesson not found', HTTP_STATUS.NOT_FOUND);
  }

  // Check access permissions
  if (user.role === USER_ROLES.INSTRUCTOR && lessonWithCourse.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const result = await query(
    `SELECT a.*, COUNT(s.id) as submission_count,
            COUNT(s.id) FILTER (WHERE s.grade IS NOT NULL) as graded_count,
            AVG(s.grade) as avg_grade
     FROM assignments a
     LEFT JOIN submissions s ON a.id = s.assignment_id
     WHERE a.lesson_id = $1
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
    [parseInt(lesson_id)]
  );

  const assignments = result.rows.map(assignment => ({
    ...assignment,
    submission_count: parseInt(assignment.submission_count),
    graded_count: parseInt(assignment.graded_count),
    avg_grade: parseFloat(assignment.avg_grade) || 0
  }));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      lessonId: parseInt(lesson_id),
      lessonTitle: lessonWithCourse.title,
      assignments
    },
    'Assignments retrieved successfully'
  ));
});

// Update assignment
export const updateAssignmentController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description,
    due_date,
    max_points,
    allow_late_submission,
    late_penalty_percent
  } = req.body;
  const user = req.user;

  // Get assignment with course info
  const assignmentResult = await query(
    `SELECT a.*, c.instructor_id
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE a.id = $1 AND c.is_deleted = FALSE`,
    [parseInt(id)]
  );

  if (assignmentResult.rows.length === 0) {
    throw new AppError('Assignment not found', HTTP_STATUS.NOT_FOUND);
  }

  const assignment = assignmentResult.rows[0];

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && assignment.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const updates = {};

  if (title) {
    updates.title = title.trim();
  }

  if (description !== undefined) {
    updates.description = description?.trim();
  }

  if (due_date !== undefined) {
    if (due_date && isDatePast(due_date)) {
      throw new AppError('Due date cannot be in the past', HTTP_STATUS.BAD_REQUEST);
    }
    updates.due_date = due_date;
  }

  if (max_points) {
    updates.max_points = max_points;
  }

  if (allow_late_submission !== undefined) {
    updates.allow_late_submission = allow_late_submission;
  }

  if (late_penalty_percent !== undefined) {
    updates.late_penalty_percent = late_penalty_percent;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', HTTP_STATUS.BAD_REQUEST);
  }

  // Build dynamic update query
  const fields = [];
  const values = [];
  let paramCount = 1;

  Object.keys(updates).forEach(key => {
    fields.push(`${key} = $${paramCount}`);
    values.push(updates[key]);
    paramCount++;
  });

  values.push(parseInt(id));
  const updateResult = await query(
    `UPDATE assignments 
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING id, lesson_id, title, description, due_date, max_points, allow_late_submission, late_penalty_percent, created_at`,
    values
  );

  res.status(HTTP_STATUS.OK).json(successResponse(
    updateResult.rows[0],
    'Assignment updated successfully'
  ));
});

// Delete assignment
export const deleteAssignmentController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get assignment with course info
  const assignmentResult = await query(
    `SELECT a.*, c.instructor_id
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE a.id = $1 AND c.is_deleted = FALSE`,
    [parseInt(id)]
  );

  if (assignmentResult.rows.length === 0) {
    throw new AppError('Assignment not found', HTTP_STATUS.NOT_FOUND);
  }

  const assignment = assignmentResult.rows[0];

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && assignment.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  // Check if assignment has submissions
  const submissionCount = await query(
    'SELECT COUNT(*) as count FROM submissions WHERE assignment_id = $1',
    [parseInt(id)]
  );

  if (parseInt(submissionCount.rows[0].count) > 0) {
    throw new AppError('Cannot delete assignment that has submissions', HTTP_STATUS.CONFLICT);
  }

  await query('DELETE FROM assignments WHERE id = $1', [parseInt(id)]);

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'Assignment deleted successfully'
  ));
});

// Get assignments by course (instructor view)
export const getAssignmentsByCourseController = asyncHandler(async (req, res) => {
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

  const result = await query(
    `SELECT a.id, a.title, a.description, a.due_date, a.max_points, a.created_at,
            l.id as lesson_id, l.title as lesson_title,
            m.id as module_id, m.title as module_title,
            COUNT(s.id) as submission_count,
            COUNT(s.id) FILTER (WHERE s.grade IS NOT NULL) as graded_count
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     LEFT JOIN submissions s ON a.id = s.assignment_id
     WHERE m.course_id = $1
     GROUP BY a.id, l.id, l.title, m.id, m.title
     ORDER BY m.position, l.position, a.created_at`,
    [parseInt(course_id)]
  );

  const assignments = result.rows.map(assignment => ({
    ...assignment,
    submission_count: parseInt(assignment.submission_count),
    graded_count: parseInt(assignment.graded_count)
  }));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      courseId: parseInt(course_id),
      courseTitle: course.title,
      assignments
    },
    'Course assignments retrieved successfully'
  ));
});

// Get assignment statistics
export const getAssignmentStatsController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  // Get assignment with course info
  const assignmentResult = await query(
    `SELECT a.*, l.title as lesson_title, c.instructor_id, c.title as course_title
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE a.id = $1 AND c.is_deleted = FALSE`,
    [parseInt(id)]
  );

  if (assignmentResult.rows.length === 0) {
    throw new AppError('Assignment not found', HTTP_STATUS.NOT_FOUND);
  }

  const assignment = assignmentResult.rows[0];

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && assignment.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  // Get submission statistics
  const statsResult = await query(
    `SELECT 
       COUNT(*) as total_submissions,
       COUNT(*) FILTER (WHERE grade IS NOT NULL) as graded_submissions,
       COUNT(*) FILTER (WHERE is_late = TRUE) as late_submissions,
       AVG(grade) as avg_grade,
       MIN(grade) as min_grade,
       MAX(grade) as max_grade
     FROM submissions
     WHERE assignment_id = $1`,
    [parseInt(id)]
  );

  const stats = statsResult.rows[0];

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      assignmentId: parseInt(id),
      assignmentTitle: assignment.title,
      lessonTitle: assignment.lesson_title,
      courseTitle: assignment.course_title,
      stats: {
        totalSubmissions: parseInt(stats.total_submissions),
        gradedSubmissions: parseInt(stats.graded_submissions),
        lateSubmissions: parseInt(stats.late_submissions),
        averageGrade: parseFloat(stats.avg_grade) || 0,
        minGrade: parseFloat(stats.min_grade) || 0,
        maxGrade: parseFloat(stats.max_grade) || 0,
        gradingProgress: stats.total_submissions > 0 
          ? Math.round((stats.graded_submissions / stats.total_submissions) * 100) 
          : 0
      }
    },
    'Assignment statistics retrieved successfully'
  ));
});

export default {
  createAssignmentController,
  getAssignmentByIdController,
  getAssignmentsByLessonController,
  updateAssignmentController,
  deleteAssignmentController,
  getAssignmentsByCourseController,
  getAssignmentStatsController
};