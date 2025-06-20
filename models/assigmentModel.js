import { query, getClient } from '../database/connection.js';

// Create new assignment
export const createAssignment = async (assignmentData) => {
  const {
    lesson_id,
    title,
    description = null,
    due_date = null,
    max_points = 100,
    allow_late_submission = true,
    late_penalty_percent = 10
  } = assignmentData;

  const result = await query(
    `INSERT INTO assignments (lesson_id, title, description, due_date, max_points, allow_late_submission, late_penalty_percent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, lesson_id, title, description, due_date, max_points, allow_late_submission, late_penalty_percent, created_at`,
    [lesson_id, title, description, due_date, max_points, allow_late_submission, late_penalty_percent]
  );

  return result.rows[0];
};

// Get assignment by ID
export const getAssignmentById = async (assignmentId, options = {}) => {
  const { includeSubmissions = false, includeLessonInfo = false } = options;

  let assignmentQuery = `
    SELECT a.id, a.lesson_id, a.title, a.description, a.due_date, a.max_points, 
           a.allow_late_submission, a.late_penalty_percent, a.created_at
  `;

  if (includeLessonInfo) {
    assignmentQuery += `, l.title as lesson_title, m.title as module_title, c.title as course_title`;
  }

  assignmentQuery += ` FROM assignments a`;

  if (includeLessonInfo) {
    assignmentQuery += `
      LEFT JOIN lessons l ON a.lesson_id = l.id
      LEFT JOIN modules m ON l.module_id = m.id
      LEFT JOIN courses c ON m.course_id = c.id
    `;
  }

  assignmentQuery += ` WHERE a.id = $1`;

  const result = await query(assignmentQuery, [assignmentId]);

  if (result.rows.length === 0) {
    return null;
  }

  const assignment = result.rows[0];

  if (includeSubmissions) {
    const submissionsResult = await query(
      `SELECT s.id, s.student_id, s.content, s.file_path, s.grade, s.feedback, 
              s.is_late, s.submitted_at, s.graded_at, s.graded_by,
              u.name as student_name, u.email as student_email
       FROM submissions s
       JOIN users u ON s.student_id = u.id
       WHERE s.assignment_id = $1
       ORDER BY s.submitted_at DESC`,
      [assignmentId]
    );
    
    assignment.submissions = submissionsResult.rows;
  }

  return assignment;
};

// Get assignments by lesson
export const getAssignmentsByLesson = async (lessonId, options = {}) => {
  const { includeSubmissionCount = true } = options;

  let assignmentsQuery = `
    SELECT a.id, a.lesson_id, a.title, a.description, a.due_date, a.max_points, 
           a.allow_late_submission, a.late_penalty_percent, a.created_at
  `;

  if (includeSubmissionCount) {
    assignmentsQuery += `, COUNT(DISTINCT s.id) as submission_count`;
  }

  assignmentsQuery += ` FROM assignments a`;

  if (includeSubmissionCount) {
    assignmentsQuery += ` LEFT JOIN submissions s ON a.id = s.assignment_id`;
  }

  assignmentsQuery += ` WHERE a.lesson_id = $1`;

  if (includeSubmissionCount) {
    assignmentsQuery += ` GROUP BY a.id`;
  }

  assignmentsQuery += ` ORDER BY a.created_at DESC`;

  const result = await query(assignmentsQuery, [lessonId]);
  return result.rows;
};

// Get assignments by course
export const getAssignmentsByCourse = async (courseId, options = {}) => {
  const { page = 1, limit = 10, includeSubmissionStats = true } = options;
  const offset = (page - 1) * limit;

  let assignmentsQuery = `
    SELECT a.id, a.lesson_id, a.title, a.description, a.due_date, a.max_points, 
           a.allow_late_submission, a.late_penalty_percent, a.created_at,
           l.title as lesson_title, m.title as module_title
  `;

  if (includeSubmissionStats) {
    assignmentsQuery += `,
      COUNT(DISTINCT s.id) as total_submissions,
      COUNT(DISTINCT CASE WHEN s.grade IS NOT NULL THEN s.id END) as graded_submissions,
      COALESCE(AVG(s.grade), 0) as average_grade
    `;
  }

  assignmentsQuery += `
    FROM assignments a
    JOIN lessons l ON a.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    JOIN courses c ON m.course_id = c.id
  `;

  if (includeSubmissionStats) {
    assignmentsQuery += ` LEFT JOIN submissions s ON a.id = s.assignment_id`;
  }

  assignmentsQuery += ` WHERE c.id = $1`;

  if (includeSubmissionStats) {
    assignmentsQuery += ` GROUP BY a.id, l.title, m.title`;
  }

  assignmentsQuery += ` ORDER BY a.created_at DESC LIMIT $2 OFFSET $3`;

  const result = await query(assignmentsQuery, [courseId, limit, offset]);
  return result.rows;
};

// Update assignment
export const updateAssignment = async (assignmentId, assignmentData) => {
  const {
    title,
    description,
    due_date,
    max_points,
    allow_late_submission,
    late_penalty_percent
  } = assignmentData;

  const result = await query(
    `UPDATE assignments 
     SET title = $1, description = $2, due_date = $3, max_points = $4, 
         allow_late_submission = $5, late_penalty_percent = $6
     WHERE id = $7
     RETURNING id, lesson_id, title, description, due_date, max_points, allow_late_submission, late_penalty_percent, created_at`,
    [title, description, due_date, max_points, allow_late_submission, late_penalty_percent, assignmentId]
  );

  return result.rows[0];
};

// Delete assignment
export const deleteAssignment = async (assignmentId) => {
  const result = await query(
    'DELETE FROM assignments WHERE id = $1 RETURNING id',
    [assignmentId]
  );

  return result.rows[0];
};

// Get assignment statistics
export const getAssignmentStats = async (assignmentId) => {
  const result = await query(
    `SELECT 
       COUNT(DISTINCT s.id) as total_submissions,
       COUNT(DISTINCT CASE WHEN s.grade IS NOT NULL THEN s.id END) as graded_submissions,
       COUNT(DISTINCT CASE WHEN s.is_late = true THEN s.id END) as late_submissions,
       COALESCE(AVG(s.grade), 0) as average_grade,
       COALESCE(MIN(s.grade), 0) as min_grade,
       COALESCE(MAX(s.grade), 0) as max_grade,
       COUNT(DISTINCT s.student_id) as unique_students
     FROM assignments a
     LEFT JOIN submissions s ON a.id = s.assignment_id
     WHERE a.id = $1`,
    [assignmentId]
  );

  // Get grade distribution
  const gradeDistribution = await query(
    `SELECT 
       CASE 
         WHEN s.grade >= 90 THEN 'A'
         WHEN s.grade >= 80 THEN 'B'
         WHEN s.grade >= 70 THEN 'C'
         WHEN s.grade >= 60 THEN 'D'
         ELSE 'F'
       END as grade_letter,
       COUNT(*) as count
     FROM submissions s
     WHERE s.assignment_id = $1 AND s.grade IS NOT NULL
     GROUP BY 
       CASE 
         WHEN s.grade >= 90 THEN 'A'
         WHEN s.grade >= 80 THEN 'B'
         WHEN s.grade >= 70 THEN 'C'
         WHEN s.grade >= 60 THEN 'D'
         ELSE 'F'
       END
     ORDER BY grade_letter`,
    [assignmentId]
  );

  // Get recent submissions
  const recentSubmissions = await query(
    `SELECT s.id, s.student_id, s.grade, s.submitted_at, s.is_late,
            u.name as student_name
     FROM submissions s
     JOIN users u ON s.student_id = u.id
     WHERE s.assignment_id = $1
     ORDER BY s.submitted_at DESC
     LIMIT 5`,
    [assignmentId]
  );

  return {
    ...result.rows[0],
    gradeDistribution: gradeDistribution.rows,
    recentSubmissions: recentSubmissions.rows
  };
};

// Check if assignment title exists in lesson
export const assignmentTitleExistsInLesson = async (lessonId, title, excludeId = null) => {
  const params = [lessonId, title];
  let queryText = 'SELECT id FROM assignments WHERE lesson_id = $1 AND LOWER(title) = LOWER($2)';
  
  if (excludeId) {
    queryText += ' AND id != $3';
    params.push(excludeId);
  }

  const result = await query(queryText, params);
  return result.rows.length > 0;
};

// Get assignment with lesson and course info
export const getAssignmentWithCourseInfo = async (assignmentId) => {
  const result = await query(
    `SELECT a.*, l.title as lesson_title, l.module_id,
            m.title as module_title, m.course_id,
            c.title as course_title, c.instructor_id
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE a.id = $1`,
    [assignmentId]
  );

  return result.rows[0] || null;
};

// Get overdue assignments
export const getOverdueAssignments = async (courseId = null) => {
  let whereClause = 'WHERE a.due_date < CURRENT_DATE';
  const params = [];
  let paramCount = 0;

  if (courseId) {
    paramCount++;
    whereClause += ` AND c.id = $${paramCount}`;
    params.push(courseId);
  }

  const result = await query(
    `SELECT a.id, a.title, a.due_date, a.max_points,
            l.title as lesson_title, m.title as module_title, c.title as course_title,
            COUNT(DISTINCT s.id) as submissions_count
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     LEFT JOIN submissions s ON a.id = s.assignment_id
     ${whereClause}
     GROUP BY a.id, l.title, m.title, c.title
     ORDER BY a.due_date ASC`,
    params
  );

  return result.rows;
};

// Get upcoming assignments for a student
export const getUpcomingAssignments = async (studentId, limit = 5) => {
  const result = await query(
    `SELECT a.id, a.title, a.description, a.due_date, a.max_points,
            l.title as lesson_title, m.title as module_title, c.title as course_title,
            CASE WHEN s.id IS NOT NULL THEN true ELSE false END as submitted
     FROM assignments a
     JOIN lessons l ON a.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     JOIN enrollments e ON c.id = e.course_id
     LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = $1
     WHERE e.user_id = $1 
       AND a.due_date >= CURRENT_DATE
       AND s.id IS NULL
     ORDER BY a.due_date ASC
     LIMIT $2`,
    [studentId, limit]
  );

  return result.rows;
};