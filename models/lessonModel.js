import { query, getClient } from '../database/connection.js';

// Create new lesson
export const createLesson = async (lessonData) => {
  const {
    module_id,
    title,
    content = null,
    video_url = null,
    video_duration = null,
    position,
    is_published = true
  } = lessonData;

  const result = await query(
    `INSERT INTO lessons (module_id, title, content, video_url, video_duration, position, is_published)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, module_id, title, content, video_url, video_duration, position, is_published, created_at`,
    [module_id, title, content, video_url, video_duration, position, is_published]
  );

  return result.rows[0];
};

// Get lesson by ID with full details
export const getLessonById = async (id, includeAssessments = false) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Get lesson basic info with module and course details
    const lessonResult = await client.query(
      `SELECT l.*, m.title as module_title, m.course_id, c.title as course_title, 
              c.instructor_id, u.name as instructor_name
       FROM lessons l
       JOIN modules m ON l.module_id = m.id
       JOIN courses c ON m.course_id = c.id
       JOIN users u ON c.instructor_id = u.id
       WHERE l.id = $1`,
      [id]
    );

    if (lessonResult.rows.length === 0) {
      return null;
    }

    const lesson = lessonResult.rows[0];

    if (includeAssessments) {
      // Get quizzes for this lesson
      const quizzesResult = await client.query(
        `SELECT id, question, answer, options, quiz_type, points
         FROM quizzes
         WHERE lesson_id = $1
         ORDER BY id`,
        [id]
      );

      // Get assignments for this lesson
      const assignmentsResult = await client.query(
        `SELECT id, title, description, due_date, max_points, allow_late_submission, late_penalty_percent
         FROM assignments
         WHERE lesson_id = $1
         ORDER BY id`,
        [id]
      );

      lesson.quizzes = quizzesResult.rows;
      lesson.assignments = assignmentsResult.rows;
      lesson.quiz_count = quizzesResult.rows.length;
      lesson.assignment_count = assignmentsResult.rows.length;
    }

    await client.query('COMMIT');
    return lesson;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get all lessons for a module
export const getLessonsByModule = async (moduleId, options = {}) => {
  const { includeUnpublished = false, includeAssessments = false } = options;

  let whereConditions = ['module_id = $1'];
  let params = [moduleId];

  if (!includeUnpublished) {
    whereConditions.push('is_published = TRUE');
  }

  const whereClause = whereConditions.join(' AND ');

  const result = await query(
    `SELECT l.id, l.title, l.content, l.video_url, l.video_duration, l.position, l.is_published, l.created_at,
            COUNT(DISTINCT q.id) as quiz_count,
            COUNT(DISTINCT a.id) as assignment_count
     FROM lessons l
     LEFT JOIN quizzes q ON l.id = q.lesson_id
     LEFT JOIN assignments a ON l.id = a.lesson_id
     WHERE ${whereClause}
     GROUP BY l.id, l.title, l.content, l.video_url, l.video_duration, l.position, l.is_published, l.created_at
     ORDER BY l.position`,
    params
  );

  const lessons = result.rows.map(lesson => ({
    ...lesson,
    quiz_count: parseInt(lesson.quiz_count),
    assignment_count: parseInt(lesson.assignment_count)
  }));

  if (includeAssessments) {
    // Get assessments for each lesson
    for (const lesson of lessons) {
      const quizzesResult = await query(
        'SELECT id, question, quiz_type, points FROM quizzes WHERE lesson_id = $1 ORDER BY id',
        [lesson.id]
      );

      const assignmentsResult = await query(
        'SELECT id, title, due_date, max_points FROM assignments WHERE lesson_id = $1 ORDER BY id',
        [lesson.id]
      );

      lesson.quizzes = quizzesResult.rows;
      lesson.assignments = assignmentsResult.rows;
    }
  }

  return lessons;
};

// Update lesson
export const updateLesson = async (id, updates) => {
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
    UPDATE lessons 
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING id, module_id, title, content, video_url, video_duration, position, is_published, created_at
  `;

  const result = await query(query_text, values);
  return result.rows[0] || null;
};

// Delete lesson
export const deleteLesson = async (id) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Delete related quizzes and assignments (cascade should handle this, but being explicit)
    await client.query('DELETE FROM quizzes WHERE lesson_id = $1', [id]);
    await client.query('DELETE FROM assignments WHERE lesson_id = $1', [id]);

    // Delete the lesson
    const result = await client.query(
      'DELETE FROM lessons WHERE id = $1 RETURNING id',
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

// Reorder lessons within a module
export const reorderLessons = async (moduleId, lessonPositions) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Update positions
    for (const { id, position } of lessonPositions) {
      await client.query(
        'UPDATE lessons SET position = $1 WHERE id = $2 AND module_id = $3',
        [position, id, moduleId]
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

// Get next available position for lesson in module
export const getNextLessonPosition = async (moduleId) => {
  const result = await query(
    'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM lessons WHERE module_id = $1',
    [moduleId]
  );

  return parseInt(result.rows[0].next_position);
};

// Check if lesson title exists in module
export const lessonTitleExistsInModule = async (title, moduleId, excludeId = null) => {
  let query_text = 'SELECT id FROM lessons WHERE LOWER(title) = LOWER($1) AND module_id = $2';
  let params = [title, moduleId];

  if (excludeId) {
    query_text += ' AND id != $3';
    params.push(excludeId);
  }

  const result = await query(query_text, params);
  return result.rows.length > 0;
};

// Get lesson with module and course info
export const getLessonWithCourseInfo = async (id) => {
  const result = await query(
    `SELECT l.*, m.title as module_title, m.course_id, c.title as course_title, 
            c.instructor_id, c.is_published as course_published, m.is_published as module_published
     FROM lessons l
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE l.id = $1 AND c.is_deleted = FALSE`,
    [id]
  );

  return result.rows[0] || null;
};

// Get previous and next lessons
export const getAdjacentLessons = async (lessonId) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Get current lesson info
    const currentLessonResult = await client.query(
      'SELECT module_id, position FROM lessons WHERE id = $1',
      [lessonId]
    );

    if (currentLessonResult.rows.length === 0) {
      return { previous: null, next: null };
    }

    const { module_id, position } = currentLessonResult.rows[0];

    // Get previous lesson
    const previousResult = await client.query(
      `SELECT id, title 
       FROM lessons 
       WHERE module_id = $1 AND position < $2 AND is_published = TRUE
       ORDER BY position DESC 
       LIMIT 1`,
      [module_id, position]
    );

    // Get next lesson
    const nextResult = await client.query(
      `SELECT id, title 
       FROM lessons 
       WHERE module_id = $1 AND position > $2 AND is_published = TRUE
       ORDER BY position ASC 
       LIMIT 1`,
      [module_id, position]
    );

    await client.query('COMMIT');

    return {
      previous: previousResult.rows[0] || null,
      next: nextResult.rows[0] || null
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get lesson statistics
export const getLessonStats = async (id) => {
  const result = await query(
    `SELECT 
       COUNT(DISTINCT q.id) as total_quizzes,
       COUNT(DISTINCT a.id) as total_assignments,
       COUNT(DISTINCT s.id) as total_submissions,
       COUNT(DISTINCT s.id) FILTER (WHERE s.grade IS NOT NULL) as graded_submissions,
       AVG(s.grade) as avg_grade
     FROM lessons l
     LEFT JOIN quizzes q ON l.id = q.lesson_id
     LEFT JOIN assignments a ON l.id = a.lesson_id
     LEFT JOIN submissions s ON a.id = s.assignment_id
     WHERE l.id = $1`,
    [id]
  );

  const stats = result.rows[0];
  return {
    totalQuizzes: parseInt(stats.total_quizzes),
    totalAssignments: parseInt(stats.total_assignments),
    totalSubmissions: parseInt(stats.total_submissions),
    gradedSubmissions: parseInt(stats.graded_submissions),
    averageGrade: parseFloat(stats.avg_grade) || 0
  };
};

// Duplicate lesson (copy to another module)
export const duplicateLesson = async (lessonId, targetModuleId) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Get original lesson
    const originalLesson = await client.query(
      'SELECT title, content, video_url, video_duration FROM lessons WHERE id = $1',
      [lessonId]
    );

    if (originalLesson.rows.length === 0) {
      throw new Error('Lesson not found');
    }

    const { title, content, video_url, video_duration } = originalLesson.rows[0];

    // Get next position in target module
    const positionResult = await client.query(
      'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM lessons WHERE module_id = $1',
      [targetModuleId]
    );
    const position = parseInt(positionResult.rows[0].next_position);

    // Create new lesson
    const newLessonResult = await client.query(
      `INSERT INTO lessons (module_id, title, content, video_url, video_duration, position, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       RETURNING id`,
      [targetModuleId, `${title} (Copy)`, content, video_url, video_duration, position]
    );

    const newLessonId = newLessonResult.rows[0].id;

    // Copy quizzes
    const quizzesResult = await client.query(
      'SELECT question, answer, options, quiz_type, points FROM quizzes WHERE lesson_id = $1',
      [lessonId]
    );

    for (const quiz of quizzesResult.rows) {
      await client.query(
        `INSERT INTO quizzes (lesson_id, question, answer, options, quiz_type, points)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newLessonId, quiz.question, quiz.answer, quiz.options, quiz.quiz_type, quiz.points]
      );
    }

    // Copy assignments (without submissions)
    const assignmentsResult = await client.query(
      'SELECT title, description, due_date, max_points, allow_late_submission, late_penalty_percent FROM assignments WHERE lesson_id = $1',
      [lessonId]
    );

    for (const assignment of assignmentsResult.rows) {
      await client.query(
        `INSERT INTO assignments (lesson_id, title, description, due_date, max_points, allow_late_submission, late_penalty_percent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newLessonId, assignment.title, assignment.description, assignment.due_date, assignment.max_points, assignment.allow_late_submission, assignment.late_penalty_percent]
      );
    }

    await client.query('COMMIT');
    return newLessonId;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Toggle lesson publish status
export const toggleLessonPublishStatus = async (id) => {
  const result = await query(
    `UPDATE lessons 
     SET is_published = NOT is_published
     WHERE id = $1
     RETURNING id, is_published`,
    [id]
  );

  return result.rows[0] || null;
};

// Get lessons for course navigation
export const getCourseLessonsNavigation = async (courseId, userId = null) => {
  const result = await query(
    `SELECT l.id, l.title, l.position as lesson_position, l.video_duration,
            m.id as module_id, m.title as module_title, m.position as module_position,
            COUNT(DISTINCT q.id) as quiz_count,
            COUNT(DISTINCT a.id) as assignment_count
     FROM lessons l
     JOIN modules m ON l.module_id = m.id
     LEFT JOIN quizzes q ON l.id = q.lesson_id
     LEFT JOIN assignments a ON l.id = a.lesson_id
     WHERE m.course_id = $1 AND m.is_published = TRUE AND l.is_published = TRUE
     GROUP BY l.id, l.title, l.position, l.video_duration, m.id, m.title, m.position
     ORDER BY m.position, l.position`,
    [courseId]
  );

  // Group lessons by module
  const modules = {};
  result.rows.forEach(row => {
    if (!modules[row.module_id]) {
      modules[row.module_id] = {
        id: row.module_id,
        title: row.module_title,
        position: row.module_position,
        lessons: []
      };
    }

    modules[row.module_id].lessons.push({
      id: row.id,
      title: row.title,
      position: row.lesson_position,
      video_duration: row.video_duration,
      quiz_count: parseInt(row.quiz_count),
      assignment_count: parseInt(row.assignment_count)
    });
  });

  return Object.values(modules).sort((a, b) => a.position - b.position);
};

// Search lessons within a course
export const searchLessonsInCourse = async (courseId, searchTerm) => {
  const result = await query(
    `SELECT l.id, l.title, l.content, m.title as module_title, m.id as module_id
     FROM lessons l
     JOIN modules m ON l.module_id = m.id
     WHERE m.course_id = $1 
       AND l.is_published = TRUE 
       AND m.is_published = TRUE
       AND (LOWER(l.title) LIKE $2 OR LOWER(l.content) LIKE $2)
     ORDER BY m.position, l.position`,
    [courseId, `%${searchTerm.toLowerCase()}%`]
  );

  return result.rows;
};

// Get total course duration
export const getCourseTotalDuration = async (courseId) => {
  const result = await query(
    `SELECT SUM(CASE WHEN l.video_duration IS NOT NULL THEN l.video_duration ELSE 0 END) as total_duration
     FROM lessons l
     JOIN modules m ON l.module_id = m.id
     WHERE m.course_id = $1 AND m.is_published = TRUE AND l.is_published = TRUE`,
    [courseId]
  );

  return parseInt(result.rows[0].total_duration) || 0;
};

export default {
  createLesson,
  getLessonById,
  getLessonsByModule,
  updateLesson,
  deleteLesson,
  reorderLessons,
  getNextLessonPosition,
  lessonTitleExistsInModule,
  getLessonWithCourseInfo,
  getAdjacentLessons,
  getLessonStats,
  duplicateLesson,
  toggleLessonPublishStatus,
  getCourseLessonsNavigation,
  searchLessonsInCourse,
  getCourseTotalDuration
};