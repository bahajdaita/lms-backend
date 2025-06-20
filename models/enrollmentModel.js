import { query, getClient } from '../database/connection.js';

// Create new enrollment
export const createEnrollment = async (userId, courseId) => {
  const result = await query(
    `INSERT INTO enrollments (user_id, course_id)
     VALUES ($1, $2)
     RETURNING id, user_id, course_id, progress, completed, enrolled_at`,
    [userId, courseId]
  );

  return result.rows[0];
};

// Get enrollment by ID
export const getEnrollmentById = async (id) => {
  const result = await query(
    `SELECT e.*, c.title as course_title, c.thumbnail, c.level,
            u.name as student_name, u.email as student_email,
            i.name as instructor_name
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     JOIN users u ON e.user_id = u.id
     JOIN users i ON c.instructor_id = i.id
     WHERE e.id = $1`,
    [id]
  );

  return result.rows[0] || null;
};

// Get user enrollments
export const getUserEnrollments = async (userId, options = {}) => {
  const {
    page = 1,
    limit = 10,
    completed = null,
    sortBy = 'enrolled_at',
    sortOrder = 'DESC'
  } = options;

  const offset = (page - 1) * limit;
  let whereConditions = ['e.user_id = $1', 'c.is_deleted = FALSE'];
  let params = [userId];
  let paramCount = 2;

  if (completed !== null) {
    whereConditions.push(`e.completed = $${paramCount}`);
    params.push(completed);
    paramCount++;
  }

  const whereClause = whereConditions.join(' AND ');

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total 
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     WHERE ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0].total);

  // Get enrollments
  params.push(limit, offset);
  const enrollmentsResult = await query(
    `SELECT e.id, e.progress, e.completed, e.enrolled_at, e.completed_at,
            c.id as course_id, c.title, c.description, c.thumbnail, c.level, c.duration_weeks,
            cat.name as category_name, u.name as instructor_name, u.avatar as instructor_avatar,
            COUNT(DISTINCT m.id) as total_modules,
            COUNT(DISTINCT l.id) as total_lessons
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     JOIN categories cat ON c.category_id = cat.id
     JOIN users u ON c.instructor_id = u.id
     LEFT JOIN modules m ON c.id = m.course_id AND m.is_published = TRUE
     LEFT JOIN lessons l ON m.id = l.module_id AND l.is_published = TRUE
     WHERE ${whereClause}
     GROUP BY e.id, c.id, cat.name, u.name, u.avatar
     ORDER BY e.${sortBy} ${sortOrder}
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    params
  );

  const enrollments = enrollmentsResult.rows.map(enrollment => ({
    ...enrollment,
    total_modules: parseInt(enrollment.total_modules),
    total_lessons: parseInt(enrollment.total_lessons)
  }));

  return {
    enrollments,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    hasNextPage: page < Math.ceil(totalCount / limit),
    hasPreviousPage: page > 1
  };
};

// Get course enrollments (for instructors)
export const getCourseEnrollments = async (courseId, options = {}) => {
  const {
    page = 1,
    limit = 10,
    sortBy = 'enrolled_at',
    sortOrder = 'DESC'
  } = options;

  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await query(
    'SELECT COUNT(*) as total FROM enrollments WHERE course_id = $1',
    [courseId]
  );
  const totalCount = parseInt(countResult.rows[0].total);

  // Get enrollments
  const enrollmentsResult = await query(
    `SELECT e.id, e.progress, e.completed, e.enrolled_at, e.completed_at,
            u.id as user_id, u.name, u.email, u.avatar
     FROM enrollments e
     JOIN users u ON e.user_id = u.id
     WHERE e.course_id = $1
     ORDER BY e.${sortBy} ${sortOrder}
     LIMIT $2 OFFSET $3`,
    [courseId, limit, offset]
  );

  return {
    enrollments: enrollmentsResult.rows,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    hasNextPage: page < Math.ceil(totalCount / limit),
    hasPreviousPage: page > 1
  };
};

// Update enrollment progress
export const updateEnrollmentProgress = async (userId, courseId, progress) => {
  const completed = progress >= 100;
  const completedAt = completed ? 'CURRENT_TIMESTAMP' : 'NULL';

  const result = await query(
    `UPDATE enrollments 
     SET progress = $1, completed = $2, completed_at = ${completedAt}
     WHERE user_id = $3 AND course_id = $4
     RETURNING id, progress, completed, completed_at`,
    [progress, completed, userId, courseId]
  );

  return result.rows[0] || null;
};

// Check if user is enrolled
export const isUserEnrolled = async (userId, courseId) => {
  const result = await query(
    'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );

  return result.rows.length > 0;
};

// Get enrollment by user and course
export const getEnrollmentByUserAndCourse = async (userId, courseId) => {
  const result = await query(
    `SELECT e.*, c.title as course_title
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     WHERE e.user_id = $1 AND e.course_id = $2`,
    [userId, courseId]
  );

  return result.rows[0] || null;
};

// Delete enrollment (unenroll)
export const deleteEnrollment = async (userId, courseId) => {
  const result = await query(
    'DELETE FROM enrollments WHERE user_id = $1 AND course_id = $2 RETURNING id',
    [userId, courseId]
  );

  return result.rows[0] || null;
};

// Get enrollment statistics
export const getEnrollmentStats = async () => {
  const result = await query(
    `SELECT 
       COUNT(*) as total_enrollments,
       COUNT(*) FILTER (WHERE completed = TRUE) as completed_enrollments,
       COUNT(DISTINCT user_id) as unique_students,
       COUNT(DISTINCT course_id) as courses_with_enrollments,
       AVG(progress) as average_progress
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     WHERE c.is_deleted = FALSE`
  );

  const stats = result.rows[0];
  return {
    totalEnrollments: parseInt(stats.total_enrollments),
    completedEnrollments: parseInt(stats.completed_enrollments),
    uniqueStudents: parseInt(stats.unique_students),
    coursesWithEnrollments: parseInt(stats.courses_with_enrollments),
    averageProgress: parseFloat(stats.average_progress) || 0,
    completionRate: stats.total_enrollments > 0 
      ? parseFloat((stats.completed_enrollments / stats.total_enrollments * 100).toFixed(2))
      : 0
  };
};

// Get recent enrollments
export const getRecentEnrollments = async (limit = 10) => {
  const result = await query(
    `SELECT e.enrolled_at, e.progress,
            u.name as student_name, u.avatar as student_avatar,
            c.title as course_title, c.thumbnail as course_thumbnail,
            i.name as instructor_name
     FROM enrollments e
     JOIN users u ON e.user_id = u.id
     JOIN courses c ON e.course_id = c.id
     JOIN users i ON c.instructor_id = i.id
     WHERE c.is_deleted = FALSE
     ORDER BY e.enrolled_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
};

// Get enrollments for instructor's courses
export const getInstructorEnrollments = async (instructorId, options = {}) => {
  const {
    page = 1,
    limit = 10,
    courseId = null,
    completed = null
  } = options;

  const offset = (page - 1) * limit;
  let whereConditions = ['c.instructor_id = $1', 'c.is_deleted = FALSE'];
  let params = [instructorId];
  let paramCount = 2;

  if (courseId) {
    whereConditions.push(`c.id = $${paramCount}`);
    params.push(courseId);
    paramCount++;
  }

  if (completed !== null) {
    whereConditions.push(`e.completed = $${paramCount}`);
    params.push(completed);
    paramCount++;
  }

  const whereClause = whereConditions.join(' AND ');

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total 
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     WHERE ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0].total);

  // Get enrollments
  params.push(limit, offset);
  const enrollmentsResult = await query(
    `SELECT e.id, e.progress, e.completed, e.enrolled_at, e.completed_at,
            u.name as student_name, u.email as student_email, u.avatar as student_avatar,
            c.id as course_id, c.title as course_title
     FROM enrollments e
     JOIN users u ON e.user_id = u.id
     JOIN courses c ON e.course_id = c.id
     WHERE ${whereClause}
     ORDER BY e.enrolled_at DESC
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    params
  );

  return {
    enrollments: enrollmentsResult.rows,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    hasNextPage: page < Math.ceil(totalCount / limit),
    hasPreviousPage: page > 1
  };
};

// Calculate detailed progress for user in course
export const calculateCourseProgress = async (userId, courseId) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Get total lessons in course
    const totalLessonsResult = await client.query(
      `SELECT COUNT(l.id) as total_lessons
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE m.course_id = $1 AND m.is_published = TRUE AND l.is_published = TRUE`,
      [courseId]
    );

    const totalLessons = parseInt(totalLessonsResult.rows[0].total_lessons);

    if (totalLessons === 0) {
      await client.query('COMMIT');
      return { progress: 0, completedLessons: 0, totalLessons: 0 };
    }

    // This is a simplified progress calculation
    // In a real system, you might track individual lesson completions
    // For now, we'll use the existing progress from enrollments table
    const enrollmentResult = await client.query(
      'SELECT progress FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );

    let progress = 0;
    if (enrollmentResult.rows.length > 0) {
      progress = parseFloat(enrollmentResult.rows[0].progress) || 0;
    }

    const completedLessons = Math.floor((progress / 100) * totalLessons);

    await client.query('COMMIT');
    
    return {
      progress,
      completedLessons,
      totalLessons,
      completionPercentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get enrollment activity (for admin dashboard)
export const getEnrollmentActivity = async (days = 30) => {
  const result = await query(
    `SELECT 
       DATE(enrolled_at) as date,
       COUNT(*) as enrollments
     FROM enrollments e
     JOIN courses c ON e.course_id = c.id
     WHERE e.enrolled_at >= CURRENT_DATE - INTERVAL '${days} days'
       AND c.is_deleted = FALSE
     GROUP BY DATE(enrolled_at)
     ORDER BY date DESC`,
    []
  );

  return result.rows.map(row => ({
    date: row.date,
    enrollments: parseInt(row.enrollments)
  }));
};

// Get top performing students in a course
export const getTopStudents = async (courseId, limit = 10) => {
  const result = await query(
    `SELECT u.id, u.name, u.avatar, e.progress, e.completed, e.enrolled_at,
            CASE WHEN e.completed THEN e.completed_at ELSE NULL END as completed_at
     FROM enrollments e
     JOIN users u ON e.user_id = u.id
     WHERE e.course_id = $1
     ORDER BY e.progress DESC, e.enrolled_at ASC
     LIMIT $2`,
    [courseId, limit]
  );

  return result.rows;
};

// Get courses user might like (based on enrollments)
export const getRecommendedCourses = async (userId, limit = 5) => {
  const result = await query(
    `SELECT DISTINCT c.id, c.title, c.description, c.thumbnail, c.level,
            cat.name as category_name, u.name as instructor_name,
            COUNT(e2.user_id) as enrolled_students
     FROM enrollments e1
     JOIN courses c1 ON e1.course_id = c1.id
     JOIN courses c ON c1.category_id = c.category_id
     JOIN categories cat ON c.category_id = cat.id
     JOIN users u ON c.instructor_id = u.id
     LEFT JOIN enrollments e2 ON c.id = e2.course_id
     WHERE e1.user_id = $1 
       AND c.id NOT IN (SELECT course_id FROM enrollments WHERE user_id = $1)
       AND c.is_published = TRUE 
       AND c.is_deleted = FALSE
     GROUP BY c.id, cat.name, u.name
     ORDER BY COUNT(e2.user_id) DESC, c.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows.map(course => ({
    ...course,
    enrolled_students: parseInt(course.enrolled_students)
  }));
};

export default {
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
  getEnrollmentActivity,
  getTopStudents,
  getRecommendedCourses
};