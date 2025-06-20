import { query, getClient } from '../database/connection.js';

// Create new course
export const createCourse = async (courseData) => {
  const {
    title,
    description = null,
    category_id,
    instructor_id,
    price = 0.00,
    thumbnail = null,
    level = 'beginner',
    duration_weeks = 1,
    is_published = false
  } = courseData;

  const result = await query(
    `INSERT INTO courses (title, description, category_id, instructor_id, price, thumbnail, level, duration_weeks, is_published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, title, description, category_id, instructor_id, price, thumbnail, level, duration_weeks, is_published, created_at`,
    [title, description, category_id, instructor_id, price, thumbnail, level, duration_weeks, is_published]
  );

  return result.rows[0];
};

// Get course by ID
export const getCourseById = async (courseId, options = {}) => {
  const { includeModules = false, includeEnrollmentCount = true } = options;

  let courseQuery = `
    SELECT 
      c.id, c.title, c.description, c.category_id, c.instructor_id, c.price, 
      c.thumbnail, c.level, c.duration_weeks, c.is_published, c.created_at,
      cat.name as category_name,
      u.name as instructor_name, u.avatar as instructor_avatar
  `;

  if (includeEnrollmentCount) {
    courseQuery += `, COUNT(DISTINCT e.id) as enrolled_students`;
  }

  courseQuery += `
    FROM courses c
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN users u ON c.instructor_id = u.id
  `;

  if (includeEnrollmentCount) {
    courseQuery += `LEFT JOIN enrollments e ON c.id = e.course_id`;
  }

  courseQuery += `
    WHERE c.id = $1 AND c.is_deleted = false
  `;

  if (includeEnrollmentCount) {
    courseQuery += `GROUP BY c.id, cat.name, u.name, u.avatar`;
  }

  const result = await query(courseQuery, [courseId]);

  if (result.rows.length === 0) {
    return null;
  }

  const course = result.rows[0];

  if (includeModules) {
    const modulesResult = await query(
      `SELECT id, title, description, position, is_published, created_at
       FROM modules
       WHERE course_id = $1 AND is_deleted = false
       ORDER BY position ASC`,
      [courseId]
    );
    course.modules = modulesResult.rows;
  }

  return course;
};

// Get all courses with filters
export const getAllCourses = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    category_id = null,
    level = null,
    search = null,
    instructor_id = null,
    is_published = null,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = options;

  const offset = (page - 1) * limit;
  let whereConditions = ['c.is_deleted = false'];
  let params = [];
  let paramCount = 0;

  // Add filters
  if (category_id) {
    paramCount++;
    whereConditions.push(`c.category_id = $${paramCount}`);
    params.push(category_id);
  }

  if (level) {
    paramCount++;
    whereConditions.push(`c.level = $${paramCount}`);
    params.push(level);
  }

  if (search) {
    paramCount++;
    whereConditions.push(`(LOWER(c.title) LIKE LOWER($${paramCount}) OR LOWER(c.description) LIKE LOWER($${paramCount}))`);
    params.push(`%${search}%`);
  }

  if (instructor_id) {
    paramCount++;
    whereConditions.push(`c.instructor_id = $${paramCount}`);
    params.push(instructor_id);
  }

  if (is_published !== null) {
    paramCount++;
    whereConditions.push(`c.is_published = $${paramCount}`);
    params.push(is_published);
  }

  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM courses c
    WHERE ${whereConditions.join(' AND ')}
  `;

  const countResult = await query(countQuery, params);
  const totalCount = parseInt(countResult.rows[0].total);

  // Main query
  const coursesQuery = `
    SELECT 
      c.id, c.title, c.description, c.price, c.thumbnail, c.level, 
      c.duration_weeks, c.is_published, c.created_at,
      cat.name as category_name,
      u.name as instructor_name, u.avatar as instructor_avatar,
      COUNT(DISTINCT e.id) as enrolled_students,
      COUNT(DISTINCT m.id) as module_count,
      COUNT(DISTINCT l.id) as lesson_count
    FROM courses c
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN users u ON c.instructor_id = u.id
    LEFT JOIN enrollments e ON c.id = e.course_id
    LEFT JOIN modules m ON c.id = m.course_id
    LEFT JOIN lessons l ON m.id = l.module_id
    WHERE ${whereConditions.join(' AND ')}
    GROUP BY c.id, cat.name, u.name, u.avatar
    ORDER BY c.${sortBy} ${sortOrder}
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `;

  params.push(limit, offset);
  const coursesResult = await query(coursesQuery, params);

  return {
    courses: coursesResult.rows,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      hasNextPage: page < Math.ceil(totalCount / limit),
      hasPreviousPage: page > 1,
      limit
    }
  };
};

// Update course
export const updateCourse = async (courseId, courseData) => {
  const {
    title,
    description,
    category_id,
    price,
    thumbnail,
    level,
    duration_weeks,
    is_published
  } = courseData;

  const result = await query(
    `UPDATE courses 
     SET title = $1, description = $2, category_id = $3, price = $4, 
         thumbnail = $5, level = $6, duration_weeks = $7, is_published = $8
     WHERE id = $9 AND is_deleted = false
     RETURNING id, title, description, category_id, instructor_id, price, thumbnail, level, duration_weeks, is_published, created_at`,
    [title, description, category_id, price, thumbnail, level, duration_weeks, is_published, courseId]
  );

  return result.rows[0];
};

// Delete course (soft delete)
export const deleteCourse = async (courseId) => {
  const result = await query(
    'UPDATE courses SET is_deleted = true WHERE id = $1 RETURNING id',
    [courseId]
  );

  return result.rows[0];
};

// Get courses by instructor
export const getCoursesByInstructor = async (instructorId, options = {}) => {
  const { page = 1, limit = 10, is_published = null } = options;
  const offset = (page - 1) * limit;

  let whereConditions = ['c.instructor_id = $1', 'c.is_deleted = false'];
  let params = [instructorId];
  let paramCount = 1;

  if (is_published !== null) {
    paramCount++;
    whereConditions.push(`c.is_published = $${paramCount}`);
    params.push(is_published);
  }

  const coursesQuery = `
    SELECT 
      c.id, c.title, c.description, c.price, c.thumbnail, c.level, 
      c.duration_weeks, c.is_published, c.created_at,
      cat.name as category_name,
      COUNT(DISTINCT e.id) as enrolled_students,
      COUNT(DISTINCT m.id) as module_count,
      COUNT(DISTINCT l.id) as lesson_count
    FROM courses c
    LEFT JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN enrollments e ON c.id = e.course_id
    LEFT JOIN modules m ON c.id = m.course_id
    LEFT JOIN lessons l ON m.id = l.module_id
    WHERE ${whereConditions.join(' AND ')}
    GROUP BY c.id, cat.name
    ORDER BY c.created_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `;

  params.push(limit, offset);
  const result = await query(coursesQuery, params);

  return result.rows;
};

// Get featured courses
export const getFeaturedCourses = async (limit = 6) => {
  const result = await query(
    `SELECT 
       c.id, c.title, c.description, c.price, c.thumbnail, c.level, 
       c.duration_weeks, c.created_at,
       cat.name as category_name,
       u.name as instructor_name, u.avatar as instructor_avatar,
       COUNT(DISTINCT e.id) as enrolled_students
     FROM courses c
     LEFT JOIN categories cat ON c.category_id = cat.id
     LEFT JOIN users u ON c.instructor_id = u.id
     LEFT JOIN enrollments e ON c.id = e.course_id
     WHERE c.is_published = true AND c.is_deleted = false
     GROUP BY c.id, cat.name, u.name, u.avatar
     ORDER BY enrolled_students DESC, c.created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
};

// Search courses
export const searchCourses = async (searchTerm, options = {}) => {
  const { page = 1, limit = 10, category_id = null, level = null } = options;
  const offset = (page - 1) * limit;

  let whereConditions = [
    'c.is_deleted = false',
    'c.is_published = true',
    '(LOWER(c.title) LIKE LOWER($1) OR LOWER(c.description) LIKE LOWER($1))'
  ];
  let params = [`%${searchTerm}%`];
  let paramCount = 1;

  if (category_id) {
    paramCount++;
    whereConditions.push(`c.category_id = $${paramCount}`);
    params.push(category_id);
  }

  if (level) {
    paramCount++;
    whereConditions.push(`c.level = $${paramCount}`);
    params.push(level);
  }

  const result = await query(
    `SELECT 
       c.id, c.title, c.description, c.price, c.thumbnail, c.level, 
       c.duration_weeks, c.created_at,
       cat.name as category_name,
       u.name as instructor_name, u.avatar as instructor_avatar,
       COUNT(DISTINCT e.id) as enrolled_students
     FROM courses c
     LEFT JOIN categories cat ON c.category_id = cat.id
     LEFT JOIN users u ON c.instructor_id = u.id
     LEFT JOIN enrollments e ON c.id = e.course_id
     WHERE ${whereConditions.join(' AND ')}
     GROUP BY c.id, cat.name, u.name, u.avatar
     ORDER BY enrolled_students DESC, c.created_at DESC
     LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
    [...params, limit, offset]
  );

  return result.rows;
};

// Get course statistics
export const getCourseStats = async (courseId) => {
  const result = await query(
    `SELECT 
       COUNT(DISTINCT e.id) as total_students,
       COUNT(DISTINCT CASE WHEN e.completed = true THEN e.id END) as completed_students,
       COALESCE(AVG(e.progress), 0) as average_progress,
       COUNT(DISTINCT m.id) as total_modules,
       COUNT(DISTINCT l.id) as total_lessons,
       COUNT(DISTINCT q.id) as total_quizzes,
       COUNT(DISTINCT a.id) as total_assignments,
       COUNT(DISTINCT s.id) as total_submissions,
       COUNT(DISTINCT CASE WHEN s.grade IS NOT NULL THEN s.id END) as graded_submissions,
       COALESCE(AVG(s.grade), 0) as average_grade
     FROM courses c
     LEFT JOIN enrollments e ON c.id = e.course_id
     LEFT JOIN modules m ON c.id = m.course_id
     LEFT JOIN lessons l ON m.id = l.module_id
     LEFT JOIN quizzes q ON l.id = q.lesson_id
     LEFT JOIN assignments a ON l.id = a.lesson_id
     LEFT JOIN submissions s ON a.id = s.assignment_id
     WHERE c.id = $1`,
    [courseId]
  );

  // Get recent enrollments
  const recentEnrollments = await query(
    `SELECT u.name, u.avatar, e.enrolled_at, e.progress
     FROM enrollments e
     JOIN users u ON e.user_id = u.id
     WHERE e.course_id = $1
     ORDER BY e.enrolled_at DESC
     LIMIT 5`,
    [courseId]
  );

  return {
    ...result.rows[0],
    recentEnrollments: recentEnrollments.rows
  };
};

// Check if user is enrolled in course
export const isUserEnrolled = async (userId, courseId) => {
  const result = await query(
    'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );

  return result.rows.length > 0;
};

// Check if course title exists for instructor
export const courseTitleExistsForInstructor = async (instructorId, title, excludeId = null) => {
  const params = [instructorId, title];
  let queryText = 'SELECT id FROM courses WHERE instructor_id = $1 AND LOWER(title) = LOWER($2) AND is_deleted = false';
  
  if (excludeId) {
    queryText += ' AND id != $3';
    params.push(excludeId);
  }

  const result = await query(queryText, params);
  return result.rows.length > 0;
};

// Get courses by category
export const getCoursesByCategory = async (categoryId, options = {}) => {
  const {
    page = 1,
    limit = 10,
    level = null,
    instructor_id = null,
    is_published = null,
    search = null
  } = options;

  const offset = (page - 1) * limit;
  let whereConditions = ['c.category_id = $1', 'c.is_deleted = false'];
  let params = [categoryId];
  let paramCount = 1;

  // Add optional filters
  if (level) {
    paramCount++;
    whereConditions.push(`c.level = $${paramCount}`);
    params.push(level);
  }

  if (instructor_id) {
    paramCount++;
    whereConditions.push(`c.instructor_id = $${paramCount}`);
    params.push(instructor_id);
  }

  if (is_published !== null) {
    paramCount++;
    whereConditions.push(`c.is_published = $${paramCount}`);
    params.push(is_published);
  }

  if (search) {
    paramCount++;
    whereConditions.push(`(LOWER(c.title) LIKE LOWER($${paramCount}) OR LOWER(c.description) LIKE LOWER($${paramCount}))`);
    params.push(`%${search}%`);
  }

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM courses c
    JOIN categories cat ON c.category_id = cat.id
    WHERE ${whereConditions.join(' AND ')}
  `;

  const countResult = await query(countQuery, params);
  const totalCount = parseInt(countResult.rows[0].total);

  // Get courses with pagination
  const coursesQuery = `
    SELECT 
      c.id,
      c.title,
      c.description,
      c.price,
      c.thumbnail,
      c.level,
      c.duration_weeks,
      c.is_published,
      c.created_at,
      cat.name as category_name,
      u.name as instructor_name,
      u.avatar as instructor_avatar,
      COUNT(DISTINCT e.id) as enrolled_students
    FROM courses c
    JOIN categories cat ON c.category_id = cat.id
    JOIN users u ON c.instructor_id = u.id
    LEFT JOIN enrollments e ON c.id = e.course_id
    WHERE ${whereConditions.join(' AND ')}
    GROUP BY c.id, cat.name, u.name, u.avatar
    ORDER BY c.created_at DESC
    LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
  `;

  params.push(limit, offset);
  const coursesResult = await query(coursesQuery, params);

  return {
    courses: coursesResult.rows,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      hasNextPage: page < Math.ceil(totalCount / limit),
      hasPreviousPage: page > 1,
      limit
    }
  };
};