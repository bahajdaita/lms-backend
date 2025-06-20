import { query, getClient } from '../database/connection.js';
import {
  successResponse,
  errorResponse,
  isDatePast
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES, USER_ROLES } from '../utils/constants.js';

// Submit assignment
export const submitAssignmentController = asyncHandler(async (req, res) => {
  const { assignment_id } = req.params;
  const { content, file_path } = req.body;
  const userId = req.user.id;

  // Get assignment details
  const assignmentResult = await query(
    `SELECT a.*, l.title as lesson_title, c.instructor_id, c.title as course_title
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE a.id = $1 AND c.is_deleted = FALSE`,
    [parseInt(assignment_id)]
  );

  if (assignmentResult.rows.length === 0) {
    throw new AppError('Assignment not found', HTTP_STATUS.NOT_FOUND);
  }

  const assignment = assignmentResult.rows[0];

  // Check if student is enrolled in the course
  // TODO: Add enrollment check

  // Check if assignment is past due
  const isLate = assignment.due_date && isDatePast(assignment.due_date);
  
  if (isLate && !assignment.allow_late_submission) {
    throw new AppError('Assignment submission deadline has passed', HTTP_STATUS.BAD_REQUEST);
  }

  // Check if student already submitted
  const existingSubmission = await query(
    'SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2',
    [parseInt(assignment_id), userId]
  );

  if (existingSubmission.rows.length > 0) {
    throw new AppError('You have already submitted this assignment', HTTP_STATUS.CONFLICT);
  }

  // Validate submission content
  if (!content && !file_path) {
    throw new AppError('Either content or file is required for submission', HTTP_STATUS.BAD_REQUEST);
  }

  // Create submission
  const result = await query(
    `INSERT INTO submissions (assignment_id, student_id, content, file_path, is_late, submitted_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     RETURNING id, assignment_id, student_id, content, file_path, is_late, submitted_at`,
    [parseInt(assignment_id), userId, content?.trim(), file_path, isLate]
  );

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    result.rows[0],
    'Assignment submitted successfully'
  ));
});

// Get submission by ID
export const getSubmissionByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const result = await query(
    `SELECT s.*, a.title as assignment_title, a.max_points, a.due_date,
            l.title as lesson_title, c.title as course_title, c.instructor_id,
            u.name as student_name, u.email as student_email, u.avatar as student_avatar,
            grader.name as grader_name
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     JOIN users u ON s.student_id = u.id
     LEFT JOIN users grader ON s.graded_by = grader.id
     WHERE s.id = $1 AND c.is_deleted = FALSE`,
    [parseInt(id)]
  );

  if (result.rows.length === 0) {
    throw new AppError('Submission not found', HTTP_STATUS.NOT_FOUND);
  }

  const submission = result.rows[0];

  // Check access permissions
  if (user.role === USER_ROLES.STUDENT && submission.student_id !== user.id) {
    throw new AppError('Access denied. You can only view your own submissions.', HTTP_STATUS.FORBIDDEN);
  }

  if (user.role === USER_ROLES.INSTRUCTOR && submission.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    submission,
    'Submission retrieved successfully'
  ));
});

// Get submissions by assignment (instructor view)
export const getSubmissionsByAssignmentController = asyncHandler(async (req, res) => {
  const { assignment_id } = req.params;
  const { page = 1, limit = 10, graded, sortBy = 'submitted_at', sortOrder = 'DESC' } = req.query;
  const user = req.user;

  // Validate assignment exists and check ownership
  const assignmentResult = await query(
    `SELECT a.*, c.instructor_id, c.title as course_title
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE a.id = $1 AND c.is_deleted = FALSE`,
    [parseInt(assignment_id)]
  );

  if (assignmentResult.rows.length === 0) {
    throw new AppError('Assignment not found', HTTP_STATUS.NOT_FOUND);
  }

  const assignment = assignmentResult.rows[0];

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && assignment.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  let whereConditions = ['s.assignment_id = $1'];
  let params = [parseInt(assignment_id)];
  let paramCount = 2;

  if (graded !== undefined) {
    whereConditions.push(`(s.grade IS ${graded === 'true' ? 'NOT' : ''} NULL)`);
  }

  const whereClause = whereConditions.join(' AND ');

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM submissions s WHERE ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0].total);

  // Get submissions
  params.push(parseInt(limit), offset);
  const submissionsResult = await query(
    `SELECT s.id, s.content, s.file_path, s.grade, s.feedback, s.is_late, 
            s.submitted_at, s.graded_at,
            u.name as student_name, u.email as student_email, u.avatar as student_avatar,
            grader.name as grader_name
     FROM submissions s
     JOIN users u ON s.student_id = u.id
     LEFT JOIN users grader ON s.graded_by = grader.id
     WHERE ${whereClause}
     ORDER BY s.${sortBy} ${sortOrder}
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    params
  );

  const totalPages = Math.ceil(totalCount / parseInt(limit));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      assignmentId: parseInt(assignment_id),
      assignmentTitle: assignment.title,
      courseTitle: assignment.course_title,
      submissions: submissionsResult.rows,
      meta: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNextPage: parseInt(page) < totalPages,
        hasPreviousPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    },
    'Assignment submissions retrieved successfully'
  ));
});

// Grade submission
export const gradeSubmissionController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { grade, feedback } = req.body;
  const user = req.user;

  // Get submission with assignment info
  const submissionResult = await query(
    `SELECT s.*, a.max_points, c.instructor_id
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE s.id = $1 AND c.is_deleted = FALSE`,
    [parseInt(id)]
  );

  if (submissionResult.rows.length === 0) {
    throw new AppError('Submission not found', HTTP_STATUS.NOT_FOUND);
  }

  const submission = submissionResult.rows[0];

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && submission.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  // Validate grade
  if (grade < 0 || grade > submission.max_points) {
    throw new AppError(`Grade must be between 0 and ${submission.max_points}`, HTTP_STATUS.BAD_REQUEST);
  }

  // Calculate final grade with late penalty if applicable
  let finalGrade = grade;
  if (submission.is_late) {
    // Get assignment late penalty
    const assignmentResult = await query(
      'SELECT late_penalty_percent FROM assignments WHERE id = $1',
      [submission.assignment_id]
    );
    
    const latePenalty = assignmentResult.rows[0].late_penalty_percent || 0;
    finalGrade = grade * (1 - latePenalty / 100);
  }

  // Update submission with grade
  const result = await query(
    `UPDATE submissions 
     SET grade = $1, feedback = $2, graded_at = CURRENT_TIMESTAMP, graded_by = $3
     WHERE id = $4
     RETURNING id, grade, feedback, graded_at, graded_by`,
    [finalGrade, feedback?.trim(), user.id, parseInt(id)]
  );

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      ...result.rows[0],
      originalGrade: grade,
      finalGrade,
      latePenaltyApplied: submission.is_late,
      gradedBy: user.name
    },
    'Submission graded successfully'
  ));
});

// Get student submissions
export const getMySubmissionsController = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, course_id } = req.query;
  const userId = req.user.id;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  let whereConditions = ['s.student_id = $1'];
  let params = [userId];
  let paramCount = 2;

  if (course_id) {
    whereConditions.push(`c.id = $${paramCount}`);
    params.push(parseInt(course_id));
    paramCount++;
  }

  const whereClause = whereConditions.join(' AND ');

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total 
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE ${whereClause} AND c.is_deleted = FALSE`,
    params
  );
  const totalCount = parseInt(countResult.rows[0].total);

  // Get submissions
  params.push(parseInt(limit), offset);
  const submissionsResult = await query(
    `SELECT s.id, s.content, s.file_path, s.grade, s.feedback, s.is_late,
            s.submitted_at, s.graded_at,
            a.id as assignment_id, a.title as assignment_title, a.max_points, a.due_date,
            l.title as lesson_title, c.title as course_title,
            grader.name as grader_name
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     LEFT JOIN users grader ON s.graded_by = grader.id
     WHERE ${whereClause} AND c.is_deleted = FALSE
     ORDER BY s.submitted_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    params
  );

  const totalPages = Math.ceil(totalCount / parseInt(limit));

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      submissions: submissionsResult.rows,
      meta: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNextPage: parseInt(page) < totalPages,
        hasPreviousPage: parseInt(page) > 1,
        limit: parseInt(limit)
      }
    },
    'Your submissions retrieved successfully'
  ));
});

// Update submission (before grading)
export const updateSubmissionController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { content, file_path } = req.body;
  const userId = req.user.id;

  // Get submission with assignment info
  const submissionResult = await query(
    `SELECT s.*, a.due_date, a.allow_late_submission
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE s.id = $1 AND s.student_id = $2 AND c.is_deleted = FALSE`,
    [parseInt(id), userId]
  );

  if (submissionResult.rows.length === 0) {
    throw new AppError('Submission not found or access denied', HTTP_STATUS.NOT_FOUND);
  }

  const submission = submissionResult.rows[0];

  // Check if submission is already graded
  if (submission.grade !== null) {
    throw new AppError('Cannot update graded submission', HTTP_STATUS.BAD_REQUEST);
  }

  // Check if assignment is past due
  const isLate = submission.due_date && isDatePast(submission.due_date);
  
  if (isLate && !submission.allow_late_submission) {
    throw new AppError('Assignment submission deadline has passed', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate submission content
  if (!content && !file_path) {
    throw new AppError('Either content or file is required for submission', HTTP_STATUS.BAD_REQUEST);
  }

  // Update submission
  const result = await query(
    `UPDATE submissions 
     SET content = $1, file_path = $2, is_late = $3, submitted_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING id, content, file_path, is_late, submitted_at`,
    [content?.trim(), file_path, isLate, parseInt(id)]
  );

  res.status(HTTP_STATUS.OK).json(successResponse(
    result.rows[0],
    'Submission updated successfully'
  ));
});

// Delete submission (before grading)
export const deleteSubmissionController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  // Get submission
  const submissionResult = await query(
    `SELECT s.*, a.due_date, a.allow_late_submission
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     WHERE s.id = $1 AND s.student_id = $2`,
    [parseInt(id), userId]
  );

  if (submissionResult.rows.length === 0) {
    throw new AppError('Submission not found or access denied', HTTP_STATUS.NOT_FOUND);
  }

  const submission = submissionResult.rows[0];

  // Check if submission is already graded
  if (submission.grade !== null) {
    throw new AppError('Cannot delete graded submission', HTTP_STATUS.BAD_REQUEST);
  }

  await query('DELETE FROM submissions WHERE id = $1', [parseInt(id)]);

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'Submission deleted successfully'
  ));
});

// Bulk grade submissions
export const bulkGradeSubmissionsController = asyncHandler(async (req, res) => {
  const { assignment_id } = req.params;
  const { grades } = req.body; // Array of { submissionId, grade, feedback }
  const user = req.user;

  // Validate assignment exists and check ownership
  const assignmentResult = await query(
    `SELECT a.*, c.instructor_id, c.title as course_title
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE a.id = $1 AND c.is_deleted = FALSE`,
    [parseInt(assignment_id)]
  );

  if (assignmentResult.rows.length === 0) {
    throw new AppError('Assignment not found', HTTP_STATUS.NOT_FOUND);
  }

  const assignment = assignmentResult.rows[0];

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && assignment.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  if (!Array.isArray(grades) || grades.length === 0) {
    throw new AppError('Grades array is required', HTTP_STATUS.BAD_REQUEST);
  }

  const client = await getClient();
  const results = [];
  const errors = [];

  try {
    await client.query('BEGIN');

    for (const gradeData of grades) {
      const { submissionId, grade, feedback } = gradeData;

      try {
        // Validate grade
        if (grade < 0 || grade > assignment.max_points) {
          errors.push({
            submissionId,
            error: `Grade must be between 0 and ${assignment.max_points}`
          });
          continue;
        }

        // Get submission to check for late penalty
        const submissionResult = await client.query(
          'SELECT is_late FROM submissions WHERE id = $1 AND assignment_id = $2',
          [submissionId, parseInt(assignment_id)]
        );

        if (submissionResult.rows.length === 0) {
          errors.push({
            submissionId,
            error: 'Submission not found'
          });
          continue;
        }

        const isLate = submissionResult.rows[0].is_late;
        let finalGrade = grade;

        // Apply late penalty if applicable
        if (isLate && assignment.late_penalty_percent) {
          finalGrade = grade * (1 - assignment.late_penalty_percent / 100);
        }

        // Update submission
        const updateResult = await client.query(
          `UPDATE submissions 
           SET grade = $1, feedback = $2, graded_at = CURRENT_TIMESTAMP, graded_by = $3
           WHERE id = $4
           RETURNING id, grade`,
          [finalGrade, feedback?.trim(), user.id, submissionId]
        );

        results.push({
          submissionId,
          originalGrade: grade,
          finalGrade,
          latePenaltyApplied: isLate
        });

      } catch (error) {
        errors.push({
          submissionId,
          error: error.message
        });
      }
    }

    await client.query('COMMIT');

    res.status(HTTP_STATUS.OK).json(successResponse({
      gradedCount: results.length,
      errorCount: errors.length,
      results,
      errors
    }, `Bulk grading completed. ${results.length} submissions graded.`));

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Get submission statistics for assignment
export const getSubmissionStatsController = asyncHandler(async (req, res) => {
  const { assignment_id } = req.params;
  const user = req.user;

  // Validate assignment exists and check ownership
  const assignmentResult = await query(
    `SELECT a.*, c.instructor_id, c.title as course_title
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE a.id = $1 AND c.is_deleted = FALSE`,
    [parseInt(assignment_id)]
  );

  if (assignmentResult.rows.length === 0) {
    throw new AppError('Assignment not found', HTTP_STATUS.NOT_FOUND);
  }

  const assignment = assignmentResult.rows[0];

  // Check if user owns the course or is admin
  if (user.role !== USER_ROLES.ADMIN && assignment.instructor_id !== user.id) {
    throw new AppError('Access denied', HTTP_STATUS.FORBIDDEN);
  }

  // Get detailed statistics
  const statsResult = await query(
    `SELECT 
       COUNT(*) as total_submissions,
       COUNT(*) FILTER (WHERE grade IS NOT NULL) as graded_submissions,
       COUNT(*) FILTER (WHERE is_late = TRUE) as late_submissions,
       AVG(grade) FILTER (WHERE grade IS NOT NULL) as avg_grade,
       MIN(grade) FILTER (WHERE grade IS NOT NULL) as min_grade,
       MAX(grade) FILTER (WHERE grade IS NOT NULL) as max_grade,
       COUNT(*) FILTER (WHERE grade >= $2 * 0.9) as a_grades,
       COUNT(*) FILTER (WHERE grade >= $2 * 0.8 AND grade < $2 * 0.9) as b_grades,
       COUNT(*) FILTER (WHERE grade >= $2 * 0.7 AND grade < $2 * 0.8) as c_grades,
       COUNT(*) FILTER (WHERE grade >= $2 * 0.6 AND grade < $2 * 0.7) as d_grades,
       COUNT(*) FILTER (WHERE grade < $2 * 0.6) as f_grades
     FROM submissions
     WHERE assignment_id = $1`,
    [parseInt(assignment_id), assignment.max_points]
  );

  const stats = statsResult.rows[0];

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      assignmentId: parseInt(assignment_id),
      assignmentTitle: assignment.title,
      courseTitle: assignment.course_title,
      maxPoints: assignment.max_points,
      stats: {
        totalSubmissions: parseInt(stats.total_submissions),
        gradedSubmissions: parseInt(stats.graded_submissions),
        lateSubmissions: parseInt(stats.late_submissions),
        averageGrade: parseFloat(stats.avg_grade) || 0,
        minGrade: parseFloat(stats.min_grade) || 0,
        maxGrade: parseFloat(stats.max_grade) || 0,
        gradeDistribution: {
          aGrades: parseInt(stats.a_grades),
          bGrades: parseInt(stats.b_grades),
          cGrades: parseInt(stats.c_grades),
          dGrades: parseInt(stats.d_grades),
          fGrades: parseInt(stats.f_grades)
        },
        gradingProgress: stats.total_submissions > 0 
          ? Math.round((stats.graded_submissions / stats.total_submissions) * 100) 
          : 0
      }
    },
    'Submission statistics retrieved successfully'
  ));
});

export default {
  submitAssignmentController,
  getSubmissionByIdController,
  getSubmissionsByAssignmentController,
  gradeSubmissionController,
  getMySubmissionsController,
  updateSubmissionController,
  deleteSubmissionController,
  bulkGradeSubmissionsController,
  getSubmissionStatsController
};