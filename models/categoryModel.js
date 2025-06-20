import { query } from '../database/connection.js';

// Get all categories
export const getAllCategories = async () => {
  const result = await query(
    'SELECT id, name, description, created_at FROM categories ORDER BY name'
  );

  return result.rows;
};

// Get category by ID
export const getCategoryById = async (id) => {
  const result = await query(
    'SELECT id, name, description, created_at FROM categories WHERE id = $1',
    [id]
  );

  return result.rows[0] || null;
};

// Create new category
export const createCategory = async (categoryData) => {
  const { name, description = null } = categoryData;

  const result = await query(
    'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
    [name, description]
  );

  return result.rows[0];
};

// Update category
export const updateCategory = async (id, updates) => {
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
    UPDATE categories 
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING id, name, description, created_at
  `;

  const result = await query(query_text, values);
  return result.rows[0] || null;
};

// Delete category
export const deleteCategory = async (id) => {
  // Check if category has courses
  const coursesResult = await query(
    'SELECT COUNT(*) as count FROM courses WHERE category_id = $1 AND is_deleted = FALSE',
    [id]
  );

  const courseCount = parseInt(coursesResult.rows[0].count);
  
  if (courseCount > 0) {
    throw new Error(`Cannot delete category. It has ${courseCount} associated courses.`);
  }

  const result = await query(
    'DELETE FROM categories WHERE id = $1 RETURNING id',
    [id]
  );

  return result.rows[0] || null;
};

// Check if category name exists
export const categoryNameExists = async (name, excludeId = null) => {
  let query_text = 'SELECT id FROM categories WHERE LOWER(name) = LOWER($1)';
  let params = [name];

  if (excludeId) {
    query_text += ' AND id != $2';
    params.push(excludeId);
  }

  const result = await query(query_text, params);
  return result.rows.length > 0;
};

// Get categories with course count
export const getCategoriesWithCourseCount = async () => {
  const result = await query(
    `SELECT c.id, c.name, c.description, c.created_at,
            COUNT(co.id) as course_count
     FROM categories c
     LEFT JOIN courses co ON c.id = co.category_id AND co.is_deleted = FALSE
     GROUP BY c.id, c.name, c.description, c.created_at
     ORDER BY c.name`
  );

  return result.rows.map(row => ({
    ...row,
    course_count: parseInt(row.course_count)
  }));
};

// Get popular categories (with most courses)
export const getPopularCategories = async (limit = 5) => {
  const result = await query(
    `SELECT c.id, c.name, c.description,
            COUNT(co.id) as course_count,
            COUNT(e.id) as total_enrollments
     FROM categories c
     LEFT JOIN courses co ON c.id = co.category_id AND co.is_deleted = FALSE AND co.is_published = TRUE
     LEFT JOIN enrollments e ON co.id = e.course_id
     GROUP BY c.id, c.name, c.description
     HAVING COUNT(co.id) > 0
     ORDER BY COUNT(co.id) DESC, COUNT(e.id) DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map(row => ({
    ...row,
    course_count: parseInt(row.course_count),
    total_enrollments: parseInt(row.total_enrollments)
  }));
};

// Search categories
export const searchCategories = async (searchTerm) => {
  const result = await query(
    `SELECT id, name, description, created_at
     FROM categories 
     WHERE LOWER(name) LIKE $1 OR LOWER(description) LIKE $1
     ORDER BY name`,
    [`%${searchTerm.toLowerCase()}%`]
  );

  return result.rows;
};

// Get category statistics
export const getCategoryStats = async (id) => {
  const result = await query(
    `SELECT 
       c.id,
       c.name,
       c.description,
       COUNT(DISTINCT co.id) as total_courses,
       COUNT(DISTINCT co.id) FILTER (WHERE co.is_published = TRUE) as published_courses,
       COUNT(DISTINCT e.user_id) as total_students,
       COUNT(DISTINCT co.instructor_id) as total_instructors,
       AVG(CASE WHEN e.completed = TRUE THEN 100 ELSE e.progress END) as avg_completion_rate
     FROM categories c
     LEFT JOIN courses co ON c.id = co.category_id AND co.is_deleted = FALSE
     LEFT JOIN enrollments e ON co.id = e.course_id
     WHERE c.id = $1
     GROUP BY c.id, c.name, c.description`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const stats = result.rows[0];
  return {
    ...stats,
    total_courses: parseInt(stats.total_courses),
    published_courses: parseInt(stats.published_courses),
    total_students: parseInt(stats.total_students),
    total_instructors: parseInt(stats.total_instructors),
    avg_completion_rate: parseFloat(stats.avg_completion_rate) || 0
  };
};

export default {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  categoryNameExists,
  getCategoriesWithCourseCount,
  getPopularCategories,
  searchCategories,
  getCategoryStats
};