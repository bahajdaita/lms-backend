import { query, getClient } from '../database/connection.js';
import { hashPassword } from '../utils/helpers.js';

// Create new user
export const createUser = async (userData) => {
  const {
    name,
    email,
    password,
    google_id = null,
    avatar = null,
    role = 'student'
  } = userData;

  // Hash password if provided
  const hashedPassword = password ? await hashPassword(password) : null;

  const result = await query(
    `INSERT INTO users (name, email, password, google_id, avatar, role, email_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, email, avatar, role, created_at`,
    [name, email, hashedPassword, google_id, avatar, role, google_id ? true : false]
  );

  return result.rows[0];
};

// Find user by email
export const findUserByEmail = async (email) => {
  const result = await query(
    'SELECT * FROM users WHERE email = $1 AND is_deleted = FALSE',
    [email]
  );

  return result.rows[0] || null;
};

// Find user by ID
export const findUserById = async (id) => {
  const result = await query(
    'SELECT id, name, email, avatar, role, email_verified, last_login, created_at FROM users WHERE id = $1 AND is_deleted = FALSE',
    [id]
  );

  return result.rows[0] || null;
};

// Find user by Google ID
export const findUserByGoogleId = async (googleId) => {
  const result = await query(
    'SELECT * FROM users WHERE google_id = $1 AND is_deleted = FALSE',
    [googleId]
  );

  return result.rows[0] || null;
};

// Update user
export const updateUser = async (id, updates) => {
  const fields = [];
  const values = [];
  let paramCount = 1;

  // Build dynamic update query
  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined) {
      fields.push(`${key} = $${paramCount}`);
      values.push(updates[key]);
      paramCount++;
    }
  });

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

  values.push(id);
  const query_text = `
    UPDATE users 
    SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${paramCount} AND is_deleted = FALSE
    RETURNING id, name, email, avatar, role, email_verified, updated_at
  `;

  const result = await query(query_text, values);
  return result.rows[0] || null;
};

// Update user password
export const updateUserPassword = async (id, newPassword) => {
  const hashedPassword = await hashPassword(newPassword);
  
  const result = await query(
    'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND is_deleted = FALSE RETURNING id',
    [hashedPassword, id]
  );

  return result.rows[0] || null;
};

// Update last login
export const updateLastLogin = async (id) => {
  await query(
    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
    [id]
  );
};

// Soft delete user
export const deleteUser = async (id) => {
  const result = await query(
    'UPDATE users SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
    [id]
  );

  return result.rows[0] || null;
};

// Get all users with pagination and filtering
export const getAllUsers = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    role = null,
    search = null,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = options;

  const offset = (page - 1) * limit;
  let whereConditions = ['is_deleted = FALSE'];
  let params = [];
  let paramCount = 1;

  // Add role filter
  if (role) {
    whereConditions.push(`role = $${paramCount}`);
    params.push(role);
    paramCount++;
  }

  // Add search filter
  if (search) {
    whereConditions.push(`(LOWER(name) LIKE $${paramCount} OR LOWER(email) LIKE $${paramCount})`);
    params.push(`%${search.toLowerCase()}%`);
    paramCount++;
  }

  const whereClause = whereConditions.join(' AND ');

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM users WHERE ${whereClause}`,
    params
  );
  const totalCount = parseInt(countResult.rows[0].total);

  // Get users
  params.push(limit, offset);
  const usersResult = await query(
    `SELECT id, name, email, avatar, role, email_verified, last_login, created_at 
     FROM users 
     WHERE ${whereClause}
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    params
  );

  return {
    users: usersResult.rows,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    hasNextPage: page < Math.ceil(totalCount / limit),
    hasPreviousPage: page > 1
  };
};

// Get user profile with additional stats
export const getUserProfile = async (id) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Get user basic info
    const userResult = await client.query(
      'SELECT id, name, email, avatar, role, email_verified, last_login, created_at FROM users WHERE id = $1 AND is_deleted = FALSE',
      [id]
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    const user = userResult.rows[0];

    // Get enrollment stats for students
    if (user.role === 'student') {
      const enrollmentStats = await client.query(
        `SELECT 
           COUNT(*) as total_courses,
           COUNT(CASE WHEN completed = true THEN 1 END) as completed_courses,
           AVG(progress) as average_progress
         FROM enrollments 
         WHERE user_id = $1`,
        [id]
      );

      user.stats = {
        totalCourses: parseInt(enrollmentStats.rows[0].total_courses),
        completedCourses: parseInt(enrollmentStats.rows[0].completed_courses),
        averageProgress: parseFloat(enrollmentStats.rows[0].average_progress) || 0
      };
    }

    // Get instructor stats
    if (user.role === 'instructor') {
      const instructorStats = await client.query(
        `SELECT 
           COUNT(DISTINCT c.id) as total_courses,
           COUNT(DISTINCT e.user_id) as total_students
         FROM courses c
         LEFT JOIN enrollments e ON c.id = e.course_id
         WHERE c.instructor_id = $1 AND c.is_deleted = FALSE`,
        [id]
      );

      user.stats = {
        totalCourses: parseInt(instructorStats.rows[0].total_courses),
        totalStudents: parseInt(instructorStats.rows[0].total_students)
      };
    }

    await client.query('COMMIT');
    return user;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Check if email exists
export const emailExists = async (email, excludeId = null) => {
  let query_text = 'SELECT id FROM users WHERE email = $1 AND is_deleted = FALSE';
  let params = [email];

  if (excludeId) {
    query_text += ' AND id != $2';
    params.push(excludeId);
  }

  const result = await query(query_text, params);
  return result.rows.length > 0;
};

// Get users by role
export const getUsersByRole = async (role) => {
  const result = await query(
    'SELECT id, name, email, avatar, created_at FROM users WHERE role = $1 AND is_deleted = FALSE ORDER BY name',
    [role]
  );

  return result.rows;
};

// Search users
export const searchUsers = async (searchTerm, options = {}) => {
  const { limit = 10, role = null } = options;
  
  let whereConditions = ['is_deleted = FALSE'];
  let params = [`%${searchTerm.toLowerCase()}%`];
  let paramCount = 2;

  whereConditions.push('(LOWER(name) LIKE $1 OR LOWER(email) LIKE $1)');

  if (role) {
    whereConditions.push(`role = $${paramCount}`);
    params.push(role);
    paramCount++;
  }

  params.push(limit);
  const result = await query(
    `SELECT id, name, email, avatar, role 
     FROM users 
     WHERE ${whereConditions.join(' AND ')}
     ORDER BY name
     LIMIT $${paramCount}`,
    params
  );

  return result.rows;
};

// Verify email
export const verifyUserEmail = async (id) => {
  const result = await query(
    'UPDATE users SET email_verified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id',
    [id]
  );

  return result.rows[0] || null;
};

// Get user dashboard data
export const getUserDashboard = async (userId, role) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    let dashboardData = {};

    if (role === 'student') {
      // Student dashboard
      const enrollments = await client.query(
        `SELECT c.id, c.title, c.thumbnail, e.progress, e.enrolled_at, e.completed,
                cat.name as category_name, u.name as instructor_name
         FROM enrollments e
         JOIN courses c ON e.course_id = c.id
         JOIN categories cat ON c.category_id = cat.id
         JOIN users u ON c.instructor_id = u.id
         WHERE e.user_id = $1 AND c.is_deleted = FALSE
         ORDER BY e.enrolled_at DESC
         LIMIT 5`,
        [userId]
      );

      const stats = await client.query(
        `SELECT 
           COUNT(*) as total_enrollments,
           COUNT(CASE WHEN completed = true THEN 1 END) as completed_courses,
           AVG(progress) as avg_progress
         FROM enrollments 
         WHERE user_id = $1`,
        [userId]
      );

      dashboardData = {
        recentCourses: enrollments.rows,
        stats: {
          totalEnrollments: parseInt(stats.rows[0].total_enrollments),
          completedCourses: parseInt(stats.rows[0].completed_courses),
          averageProgress: parseFloat(stats.rows[0].avg_progress) || 0
        }
      };
    }

    if (role === 'instructor') {
      // Instructor dashboard
      const courses = await client.query(
        `SELECT c.id, c.title, c.thumbnail, c.created_at,
                COUNT(e.id) as enrolled_students,
                c.is_published
         FROM courses c
         LEFT JOIN enrollments e ON c.id = e.course_id
         WHERE c.instructor_id = $1 AND c.is_deleted = FALSE
         GROUP BY c.id
         ORDER BY c.created_at DESC
         LIMIT 5`,
        [userId]
      );

      const stats = await client.query(
        `SELECT 
           COUNT(DISTINCT c.id) as total_courses,
           COUNT(DISTINCT e.user_id) as total_students,
           COUNT(DISTINCT c.id) FILTER (WHERE c.is_published = true) as published_courses
         FROM courses c
         LEFT JOIN enrollments e ON c.id = e.course_id
         WHERE c.instructor_id = $1 AND c.is_deleted = FALSE`,
        [userId]
      );

      dashboardData = {
        recentCourses: courses.rows,
        stats: {
          totalCourses: parseInt(stats.rows[0].total_courses),
          totalStudents: parseInt(stats.rows[0].total_students),
          publishedCourses: parseInt(stats.rows[0].published_courses)
        }
      };
    }

    if (role === 'admin') {
      // Admin dashboard
      const systemStats = await client.query(
        `SELECT 
           (SELECT COUNT(*) FROM users WHERE is_deleted = FALSE) as total_users,
           (SELECT COUNT(*) FROM users WHERE role = 'student' AND is_deleted = FALSE) as total_students,
           (SELECT COUNT(*) FROM users WHERE role = 'instructor' AND is_deleted = FALSE) as total_instructors,
           (SELECT COUNT(*) FROM courses WHERE is_deleted = FALSE) as total_courses,
           (SELECT COUNT(*) FROM enrollments) as total_enrollments`
      );

      const recentUsers = await client.query(
        `SELECT id, name, email, role, created_at
         FROM users 
         WHERE is_deleted = FALSE
         ORDER BY created_at DESC
         LIMIT 5`
      );

      const recentCourses = await client.query(
        `SELECT c.id, c.title, c.created_at, u.name as instructor_name,
                COUNT(e.id) as enrolled_students
         FROM courses c
         JOIN users u ON c.instructor_id = u.id
         LEFT JOIN enrollments e ON c.id = e.course_id
         WHERE c.is_deleted = FALSE
         GROUP BY c.id, u.name
         ORDER BY c.created_at DESC
         LIMIT 5`
      );

      dashboardData = {
        stats: systemStats.rows[0],
        recentUsers: recentUsers.rows,
        recentCourses: recentCourses.rows
      };
    }

    await client.query('COMMIT');
    return dashboardData;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export default {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByGoogleId,
  updateUser,
  updateUserPassword,
  updateLastLogin,
  deleteUser,
  getAllUsers,
  getUserProfile,
  emailExists,
  getUsersByRole,
  searchUsers,
  verifyUserEmail,
  getUserDashboard
};