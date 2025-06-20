import { query, getClient } from '../database/connection.js';

// Create new submission
export const createSubmission = async (submissionData) => {
  const {
    assignment_id,
    student_id,
    content = null,
    file_path = null
  } = submissionData;

  // Check if assignment is overdue
  const assignmentResult = await query(
    'SELECT due_date, allow_late_submission FROM assignments WHERE id = $1',
    [assignment_id]
  );

  if (assignmentResult.rows.length === 0) {
    throw new Error('Assignment not found');
  }

  const assignment = assignmentResult.rows[0];
  const isLate = assignment.due_date && new Date() > new Date(assignment.due_date);

  if (isLate && !assignment.allow_late_submission) {
    throw new Error('Late submissions are not allowed for this assignment');
  }

  const result = await query(
    `INSERT INTO submissions (assignment_id, student_id, content, file_path, is_late)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, assignment_id, student_id, content, file_path, is_late, submitted_at`,
    [assignment_id, student_id, content, file_path, isLate]
  );

  return result.rows[0];
};

// Get submission by ID
export const getSubmissionById = async (submissionId, options = {}) => {
  const { includeAssignmentInfo = false, includeStudentInfo = false } = options;

  let submissionQuery = `
    SELECT s.id, s.assignment_id, s.student_id, s.content, s.file_path, 
           s.grade, s.feedback, s.is_late, s.submitted_at, s.graded_at, s.graded_by
  `;

  if (includeAssignmentInfo) {
    submissionQuery += `, a.title as assignment_title, a.max_points, a.due_date`;
  }

  if (includeStudentInfo) {
    submissionQuery += `, u.name as student_name, u.email as student_email`;
  }

  submissionQuery += ` FROM submissions s`;

  if (includeAssignmentInfo) {
    submissionQuery += ` LEFT JOIN assignments a ON s.assignment_id = a.id`;
  }

  if (includeStudentInfo) {
    submissionQuery += ` LEFT JOIN users u ON s.student_id = u.id`;
  }

  submissionQuery += ` WHERE s.id = $1`;

  const result = await query(submissionQuery, [submissionId]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Get submissions by assignment
export const getSubmissionsByAssignment = async (assignmentId, options = {}) => {
  const { page = 1, limit = 10, includeStudentInfo = true, graded = null } = options;
  const offset = (page - 1) * limit;

  let whereConditions = ['s.assignment_id = $1'];
  let params = [assignmentId];
  let paramCount = 1;

  if (graded !== null) {
    paramCount++;
    if (graded) {
      whereConditions.push(`s.grade IS NOT NULL`);
    } else {
      whereConditions.push(`s.grade IS NULL`);
    }
  }

  let submissionsQuery = `
    SELECT s.id, s.assignment_id, s.student_id, s.content, s.file_path, 
           s.grade, s.feedback, s.is_late, s.submitted_at, s.graded_at, s.graded_by
  `;

  if (includeStudentInfo) {
    submissionsQuery += `, u.name as student_name, u.email as student_email, u.avatar as student_avatar`;
  }

  submissionsQuery += ` FROM submissions s`;

  if (includeStudentInfo) {
    submissionsQuery += ` JOIN users u ON s.student_id = u.id`;
  }

  submissionsQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  submissionsQuery += ` ORDER BY s.submitted_at DESC`;
  submissionsQuery += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;

  params.push(limit, offset);

  const result = await query(submissionsQuery, params);
  return result.rows;
};

// Get submissions by student
export const getSubmissionsByStudent = async (studentId, options = {}) => {
  const { page = 1, limit = 10, includeAssignmentInfo = true, courseId = null } = options;
  const offset = (page - 1) * limit;

  let whereConditions = ['s.student_id = $1'];
  let params = [studentId];
  let paramCount = 1;

  if (courseId) {
    paramCount++;
    whereConditions.push(`c.id = $${paramCount}`);
    params.push(courseId);
  }

  let submissionsQuery = `
    SELECT s.id, s.assignment_id, s.student_id, s.content, s.file_path, 
           s.grade, s.feedback, s.is_late, s.submitted_at, s.graded_at
  `;

  if (includeAssignmentInfo) {
    submissionsQuery += `, a.title as assignment_title, a.max_points, a.due_date,
                           l.title as lesson_title, m.title as module_title, c.title as course_title`;
  }

  submissionsQuery += ` FROM submissions s`;

  if (includeAssignmentInfo) {
    submissionsQuery += `
      JOIN assignments a ON s.assignment_id = a.id
      JOIN lessons l ON a.lesson_id = l.id
      JOIN modules m ON l.module_id = m.id
      JOIN courses c ON m.course_id = c.id
    `;
  }

  submissionsQuery += ` WHERE ${whereConditions.join(' AND ')}`;
  submissionsQuery += ` ORDER BY s.submitted_at DESC`;
  submissionsQuery += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;

  params.push(limit, offset);

  const result = await query(submissionsQuery, params);
  return result.rows;
};

// Update submission
export const updateSubmission = async (submissionId, submissionData) => {
  const {
    content,
    file_path
  } = submissionData;

  // Check if assignment is still open for updates
  const submissionCheck = await query(
    `SELECT s.assignment_id, a.due_date, a.allow_late_submission
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     WHERE s.id = $1`,
    [submissionId]
  );

  if (submissionCheck.rows.length === 0) {
    throw new Error('Submission not found');
  }

  const assignment = submissionCheck.rows[0];
  const isLate = assignment.due_date && new Date() > new Date(assignment.due_date);

  const result = await query(
    `UPDATE submissions 
     SET content = $1, file_path = $2, is_late = $3, submitted_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING id, assignment_id, student_id, content, file_path, is_late, submitted_at`,
    [content, file_path, isLate, submissionId]
  );

  return result.rows[0];
};

// Grade submission
export const gradeSubmission = async (submissionId, gradeData, gradedBy) => {
  const {
    grade,
    feedback = null
  } = gradeData;

  const result = await query(
    `UPDATE submissions 
     SET grade = $1, feedback = $2, graded_at = CURRENT_TIMESTAMP, graded_by = $3
     WHERE id = $4
     RETURNING id, assignment_id, student_id, grade, feedback, graded_at, graded_by`,
    [grade, feedback, gradedBy, submissionId]
  );

  return result.rows[0];
};

// Delete submission
export const deleteSubmission = async (submissionId) => {
  const result = await query(
    'DELETE FROM submissions WHERE id = $1 RETURNING id',
    [submissionId]
  );

  return result.rows[0];
};

// Check if user has submitted assignment
export const hasUserSubmitted = async (assignmentId, studentId) => {
  const result = await query(
    'SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2',
    [assignmentId, studentId]
  );

  return result.rows.length > 0;
};

// Get submission by assignment and student
export const getSubmissionByAssignmentAndStudent = async (assignmentId, studentId) => {
  const result = await query(
    `SELECT s.*, a.title as assignment_title, a.max_points, a.due_date
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     WHERE s.assignment_id = $1 AND s.student_id = $2`,
    [assignmentId, studentId]
  );

  return result.rows[0] || null;
};

// Get submission statistics for assignment
export const getSubmissionStats = async (assignmentId) => {
  const result = await query(
    `SELECT 
       COUNT(*) as total_submissions,
       COUNT(CASE WHEN grade IS NOT NULL THEN 1 END) as graded_submissions,
       COUNT(CASE WHEN is_late = true THEN 1 END) as late_submissions,
       COALESCE(AVG(grade), 0) as average_grade,
       COALESCE(MIN(grade), 0) as min_grade,
       COALESCE(MAX(grade), 0) as max_grade
     FROM submissions
     WHERE assignment_id = $1`,
    [assignmentId]
  );

  return result.rows[0];
};

// Bulk grade submissions
export const bulkGradeSubmissions = async (gradeData, gradedBy) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    const results = [];
    
    for (const { submissionId, grade, feedback } of gradeData) {
      const result = await client.query(
        `UPDATE submissions 
         SET grade = $1, feedback = $2, graded_at = CURRENT_TIMESTAMP, graded_by = $3
         WHERE id = $4
         RETURNING id, assignment_id, student_id, grade`,
        [grade, feedback, gradedBy, submissionId]
      );
      
      if (result.rows.length > 0) {
        results.push(result.rows[0]);
      }
    }

    await client.query('COMMIT');
    return results;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get recent submissions for instructor
export const getRecentSubmissions = async (instructorId, limit = 10) => {
  const result = await query(
    `SELECT s.id, s.assignment_id, s.student_id, s.content, s.file_path,
            s.grade, s.is_late, s.submitted_at,
            a.title as assignment_title, a.max_points,
            u.name as student_name, u.email as student_email,
            c.title as course_title
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     JOIN users u ON s.student_id = u.id
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE c.instructor_id = $1
     ORDER BY s.submitted_at DESC
     LIMIT $2`,
    [instructorId, limit]
  );

  return result.rows;
};

// Get pending submissions (ungraded)
export const getPendingSubmissions = async (instructorId, options = {}) => {
  const { page = 1, limit = 10, courseId = null } = options;
  const offset = (page - 1) * limit;

  let whereConditions = ['c.instructor_id = $1', 's.grade IS NULL'];
  let params = [instructorId];
  let paramCount = 1;

  if (courseId) {
    paramCount++;
    whereConditions.push(`c.id = $${paramCount}`);
    params.push(courseId);
  }

  const result = await query(
    `SELECT s.id, s.assignment_id, s.student_id, s.content, s.file_path,
            s.is_late, s.submitted_at,
            a.title as assignment_title, a.max_points, a.due_date,
            u.name as student_name, u.email as student_email,
            c.title as course_title, c.id as course_id
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     JOIN users u ON s.student_id = u.id
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE ${whereConditions.join(' AND ')}
     ORDER BY s.submitted_at ASC
     LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset]
  );

  return result.rows;
};

// Get submission with full context
export const getSubmissionWithContext = async (submissionId) => {
  const result = await query(
    `SELECT s.*, 
            a.title as assignment_title, a.description as assignment_description,
            a.max_points, a.due_date, a.allow_late_submission,
            u.name as student_name, u.email as student_email,
            l.title as lesson_title,
            m.title as module_title,
            c.title as course_title, c.instructor_id,
            grader.name as grader_name
     FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     JOIN users u ON s.student_id = u.id
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     LEFT JOIN users grader ON s.graded_by = grader.id
     WHERE s.id = $1`,
    [submissionId]
  );

  return result.rows[0] || null;
};