import { query, getClient } from '../database/connection.js';

// Create new module
export const createModule = async (moduleData) => {
  const {
    course_id,
    title,
    description = null,
    position,
    is_published = true
  } = moduleData;

  const result = await query(
    `INSERT INTO modules (course_id, title, description, position, is_published)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, course_id, title, description, position, is_published, created_at`,
    [course_id, title, description, position, is_published]
  );

  return result.rows[0];
};

// Get module by ID with lessons
export const getModuleById = async (id, includeLessons = false) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Get module basic info
    const moduleResult = await client.query(
      `SELECT m.*, c.title as course_title, c.instructor_id
       FROM modules m
       JOIN courses c ON m.course_id = c.id
       WHERE m.id = $1`,
      [id]
    );

    if (moduleResult.rows.length === 0) {
      return null;
    }

    const module = moduleResult.rows[0];

    if (includeLessons) {
      // Get lessons for this module
      const lessonsResult = await client.query(
        `SELECT l.id, l.title, l.content, l.video_url, l.video_duration, l.position, l.is_published,
                COUNT(DISTINCT q.id) as quiz_count,
                COUNT(DISTINCT a.id) as assignment_count
         FROM lessons l
         LEFT JOIN quizzes q ON l.id = q.lesson_id
         LEFT JOIN assignments a ON l.id = a.lesson_id
         WHERE l.module_id = $1
         GROUP BY l.id, l.title, l.content, l.video_url, l.video_duration, l.position, l.is_published
         ORDER BY l.position`,
        [id]
      );

      module.lessons = lessonsResult.rows.map(lesson => ({
        ...lesson,
        quiz_count: parseInt(lesson.quiz_count),
        assignment_count: parseInt(lesson.assignment_count)
      }));

      // Calculate module statistics
      module.total_lessons = module.lessons.length;
      module.published_lessons = module.lessons.filter(l => l.is_published).length;
      module.total_duration = module.lessons.reduce((sum, lesson) => 
        sum + (lesson.video_duration || 0), 0
      );
    }

    await client.query('COMMIT');
    return module;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get all modules for a course
export const getModulesByCourse = async (courseId, options = {}) => {
  const { includeUnpublished = false, includeLessons = false } = options;

  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    let whereConditions = ['m.course_id = $1'];
    let params = [courseId];

    if (!includeUnpublished) {
      whereConditions.push('m.is_published = TRUE');
    }

    const whereClause = whereConditions.join(' AND ');

    // Get modules
    const modulesResult = await client.query(
      `SELECT m.id, m.title, m.description, m.position, m.is_published, m.created_at,
              COUNT(DISTINCT l.id) as lesson_count,
              COUNT(DISTINCT l.id) FILTER (WHERE l.is_published = TRUE) as published_lesson_count,
              SUM(CASE WHEN l.video_duration IS NOT NULL THEN l.video_duration ELSE 0 END) as total_duration
       FROM modules m
       LEFT JOIN lessons l ON m.id = l.module_id
       WHERE ${whereClause}
       GROUP BY m.id, m.title, m.description, m.position, m.is_published, m.created_at
       ORDER BY m.position`,
      params
    );

    const modules = modulesResult.rows.map(module => ({
      ...module,
      lesson_count: parseInt(module.lesson_count),
      published_lesson_count: parseInt(module.published_lesson_count),
      total_duration: parseInt(module.total_duration) || 0
    }));

    if (includeLessons) {
      // Get lessons for each module
      for (const module of modules) {
        const lessonsResult = await client.query(
          `SELECT id, title, content, video_url, video_duration, position, is_published
           FROM lessons
           WHERE module_id = $1
           ORDER BY position`,
          [module.id]
        );

        module.lessons = lessonsResult.rows;
      }
    }

    await client.query('COMMIT');
    return modules;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Update module
export const updateModule = async (id, updates) => {
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
    UPDATE modules 
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING id, course_id, title, description, position, is_published, created_at
  `;

  const result = await query(query_text, values);
  return result.rows[0] || null;
};

// Delete module
export const deleteModule = async (id) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Check if module has lessons
    const lessonsResult = await client.query(
      'SELECT COUNT(*) as count FROM lessons WHERE module_id = $1',
      [id]
    );

    const lessonCount = parseInt(lessonsResult.rows[0].count);
    
    if (lessonCount > 0) {
      throw new Error(`Cannot delete module. It has ${lessonCount} associated lessons.`);
    }

    // Delete the module
    const result = await client.query(
      'DELETE FROM modules WHERE id = $1 RETURNING id',
      [id]
    );

    await client.query('COMMIT');
    return result.rows[0] || null;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Reorder modules
export const reorderModules = async (courseId, modulePositions) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Update positions
    for (const { id, position } of modulePositions) {
      await client.query(
        'UPDATE modules SET position = $1 WHERE id = $2 AND course_id = $3',
        [position, id, courseId]
      );
    }

    await client.query('COMMIT');
    return true;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get next available position for module in course
export const getNextModulePosition = async (courseId) => {
  const result = await query(
    'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM modules WHERE course_id = $1',
    [courseId]
  );

  return parseInt(result.rows[0].next_position);
};

// Check if module title exists in course
export const moduleTitleExistsInCourse = async (title, courseId, excludeId = null) => {
  let query_text = 'SELECT id FROM modules WHERE LOWER(title) = LOWER($1) AND course_id = $2';
  let params = [title, courseId];

  if (excludeId) {
    query_text += ' AND id != $3';
    params.push(excludeId);
  }

  const result = await query(query_text, params);
  return result.rows.length > 0;
};

// Get module with course info
export const getModuleWithCourse = async (id) => {
  const result = await query(
    `SELECT m.*, c.title as course_title, c.instructor_id, c.is_published as course_published
     FROM modules m
     JOIN courses c ON m.course_id = c.id
     WHERE m.id = $1 AND c.is_deleted = FALSE`,
    [id]
  );

  return result.rows[0] || null;
};

// Get module statistics
export const getModuleStats = async (id) => {
  const result = await query(
    `SELECT 
       COUNT(DISTINCT l.id) as total_lessons,
       COUNT(DISTINCT l.id) FILTER (WHERE l.is_published = TRUE) as published_lessons,
       COUNT(DISTINCT q.id) as total_quizzes,
       COUNT(DISTINCT a.id) as total_assignments,
       SUM(CASE WHEN l.video_duration IS NOT NULL THEN l.video_duration ELSE 0 END) as total_duration
     FROM modules m
     LEFT JOIN lessons l ON m.id = l.module_id
     LEFT JOIN quizzes q ON l.id = q.lesson_id
     LEFT JOIN assignments a ON l.id = a.lesson_id
     WHERE m.id = $1`,
    [id]
  );

  const stats = result.rows[0];
  return {
    totalLessons: parseInt(stats.total_lessons),
    publishedLessons: parseInt(stats.published_lessons),
    totalQuizzes: parseInt(stats.total_quizzes),
    totalAssignments: parseInt(stats.total_assignments),
    totalDuration: parseInt(stats.total_duration) || 0
  };
};

// Duplicate module (copy to another course)
export const duplicateModule = async (moduleId, targetCourseId) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Get original module
    const originalModule = await client.query(
      'SELECT title, description FROM modules WHERE id = $1',
      [moduleId]
    );

    if (originalModule.rows.length === 0) {
      throw new Error('Module not found');
    }

    const { title, description } = originalModule.rows[0];

    // Get next position in target course
    const positionResult = await client.query(
      'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM modules WHERE course_id = $1',
      [targetCourseId]
    );
    const position = parseInt(positionResult.rows[0].next_position);

    // Create new module
    const newModuleResult = await client.query(
      `INSERT INTO modules (course_id, title, description, position, is_published)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id`,
      [targetCourseId, `${title} (Copy)`, description, position]
    );

    const newModuleId = newModuleResult.rows[0].id;

    // Copy lessons (basic copy without content)
    const lessonsResult = await client.query(
      'SELECT title, content, position FROM lessons WHERE module_id = $1 ORDER BY position',
      [moduleId]
    );

    for (const lesson of lessonsResult.rows) {
      await client.query(
        `INSERT INTO lessons (module_id, title, content, position, is_published)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [newModuleId, lesson.title, lesson.content, lesson.position]
      );
    }

    await client.query('COMMIT');
    return newModuleId;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Toggle module publish status
export const toggleModulePublishStatus = async (id) => {
  const result = await query(
    `UPDATE modules 
     SET is_published = NOT is_published
     WHERE id = $1
     RETURNING id, is_published`,
    [id]
  );

  return result.rows[0] || null;
};

export default {
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
};