import { query, getClient } from '../database/connection.js';

// Create new quiz
export const createQuiz = async (quizData) => {
  const {
    lesson_id,
    question,
    answer,
    options = null,
    quiz_type = 'text',
    points = 1
  } = quizData;

  const result = await query(
    `INSERT INTO quizzes (lesson_id, question, answer, options, quiz_type, points)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, lesson_id, question, answer, options, quiz_type, points, created_at`,
    [lesson_id, question, answer, options, quiz_type, points]
  );

  return result.rows[0];
};

// Get quiz by ID
export const getQuizById = async (id) => {
  const result = await query(
    `SELECT q.*, l.title as lesson_title, l.module_id, m.title as module_title, 
            m.course_id, c.title as course_title, c.instructor_id
     FROM quizzes q
     JOIN lessons l ON q.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     JOIN courses c ON m.course_id = c.id
     WHERE q.id = $1 AND c.is_deleted = FALSE`,
    [id]
  );

  return result.rows[0] || null;
};

// Get all quizzes for a lesson
export const getQuizzesByLesson = async (lessonId) => {
  const result = await query(
    `SELECT id, question, answer, options, quiz_type, points, created_at
     FROM quizzes
     WHERE lesson_id = $1
     ORDER BY id`,
    [lessonId]
  );

  return result.rows;
};

// Get quiz questions only (for students taking quiz)
export const getQuizQuestionsForStudent = async (lessonId) => {
  const result = await query(
    `SELECT id, question, options, quiz_type, points
     FROM quizzes
     WHERE lesson_id = $1
     ORDER BY id`,
    [lessonId]
  );

  return result.rows;
};

// Update quiz
export const updateQuiz = async (id, updates) => {
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
    UPDATE quizzes 
    SET ${fields.join(', ')}
    WHERE id = $${paramCount}
    RETURNING id, lesson_id, question, answer, options, quiz_type, points, created_at
  `;

  const result = await query(query_text, values);
  return result.rows[0] || null;
};

// Delete quiz
export const deleteQuiz = async (id) => {
  const result = await query(
    'DELETE FROM quizzes WHERE id = $1 RETURNING id',
    [id]
  );

  return result.rows[0] || null;
};

// Submit quiz answers and get results
export const submitQuizAnswers = async (lessonId, answers, studentId = null) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // Get all quizzes for the lesson
    const quizzesResult = await client.query(
      'SELECT id, question, answer, quiz_type, points FROM quizzes WHERE lesson_id = $1 ORDER BY id',
      [lessonId]
    );

    const quizzes = quizzesResult.rows;
    let totalPoints = 0;
    let earnedPoints = 0;
    const results = [];

    // Grade each quiz
    for (const quiz of quizzes) {
      const userAnswer = answers[quiz.id];
      let isCorrect = false;
      let points = 0;

      totalPoints += quiz.points;

      if (userAnswer !== undefined && userAnswer !== null) {
        // Check answer based on quiz type
        switch (quiz.quiz_type) {
          case 'multiple_choice':
          case 'true_false':
            isCorrect = userAnswer.toString().toLowerCase() === quiz.answer.toString().toLowerCase();
            break;
          case 'text':
            // For text answers, we'll do a case-insensitive comparison
            // In a real system, you might want more sophisticated text matching
            isCorrect = userAnswer.toString().toLowerCase().trim() === quiz.answer.toString().toLowerCase().trim();
            break;
          default:
            isCorrect = userAnswer.toString() === quiz.answer.toString();
        }

        if (isCorrect) {
          points = quiz.points;
          earnedPoints += points;
        }
      }

      results.push({
        quizId: quiz.id,
        question: quiz.question,
        userAnswer,
        correctAnswer: quiz.answer,
        isCorrect,
        points,
        maxPoints: quiz.points
      });
    }

    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

    await client.query('COMMIT');

    return {
      totalQuestions: quizzes.length,
      totalPoints,
      earnedPoints,
      score,
      results
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get quiz statistics for instructor
export const getQuizStats = async (lessonId) => {
  const result = await query(
    `SELECT 
       COUNT(*) as total_quizzes,
       SUM(points) as total_points,
       AVG(points) as avg_points_per_quiz,
       COUNT(*) FILTER (WHERE quiz_type = 'multiple_choice') as multiple_choice_count,
       COUNT(*) FILTER (WHERE quiz_type = 'true_false') as true_false_count,
       COUNT(*) FILTER (WHERE quiz_type = 'text') as text_count
     FROM quizzes
     WHERE lesson_id = $1`,
    [lessonId]
  );

  const stats = result.rows[0];
  return {
    totalQuizzes: parseInt(stats.total_quizzes),
    totalPoints: parseInt(stats.total_points),
    avgPointsPerQuiz: parseFloat(stats.avg_points_per_quiz) || 0,
    multipleChoiceCount: parseInt(stats.multiple_choice_count),
    trueFalseCount: parseInt(stats.true_false_count),
    textCount: parseInt(stats.text_count)
  };
};

// Bulk create quizzes
export const bulkCreateQuizzes = async (lessonId, quizzesData) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    const createdQuizzes = [];

    for (const quizData of quizzesData) {
      const result = await client.query(
        `INSERT INTO quizzes (lesson_id, question, answer, options, quiz_type, points)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, lesson_id, question, answer, options, quiz_type, points, created_at`,
        [
          lessonId,
          quizData.question,
          quizData.answer,
          quizData.options || null,
          quizData.quiz_type || 'text',
          quizData.points || 1
        ]
      );

      createdQuizzes.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return createdQuizzes;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get quizzes for course (instructor view)
export const getQuizzesByCourse = async (courseId) => {
  const result = await query(
    `SELECT q.id, q.question, q.answer, q.quiz_type, q.points, q.created_at,
            l.id as lesson_id, l.title as lesson_title,
            m.id as module_id, m.title as module_title
     FROM quizzes q
     JOIN lessons l ON q.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     WHERE m.course_id = $1
     ORDER BY m.position, l.position, q.id`,
    [courseId]
  );

  return result.rows;
};

// Search quizzes within a course
export const searchQuizzesInCourse = async (courseId, searchTerm) => {
  const result = await query(
    `SELECT q.id, q.question, q.quiz_type, q.points,
            l.title as lesson_title, m.title as module_title
     FROM quizzes q
     JOIN lessons l ON q.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     WHERE m.course_id = $1 
       AND LOWER(q.question) LIKE $2
     ORDER BY m.position, l.position, q.id`,
    [courseId, `%${searchTerm.toLowerCase()}%`]
  );

  return result.rows;
};

// Duplicate quiz (copy to another lesson)
export const duplicateQuiz = async (quizId, targetLessonId) => {
  const result = await query(
    `INSERT INTO quizzes (lesson_id, question, answer, options, quiz_type, points)
     SELECT $1, question, answer, options, quiz_type, points
     FROM quizzes
     WHERE id = $2
     RETURNING id, lesson_id, question, answer, options, quiz_type, points, created_at`,
    [targetLessonId, quizId]
  );

  return result.rows[0] || null;
};

// Get quiz difficulty distribution for a lesson
export const getQuizDifficultyDistribution = async (lessonId) => {
  const result = await query(
    `SELECT 
       quiz_type,
       COUNT(*) as count,
       AVG(points) as avg_points,
       SUM(points) as total_points
     FROM quizzes
     WHERE lesson_id = $1
     GROUP BY quiz_type
     ORDER BY count DESC`,
    [lessonId]
  );

  return result.rows.map(row => ({
    ...row,
    count: parseInt(row.count),
    avg_points: parseFloat(row.avg_points),
    total_points: parseInt(row.total_points)
  }));
};

// Validate quiz answers format
export const validateQuizAnswers = (answers, quizzes) => {
  const errors = [];

  quizzes.forEach(quiz => {
    const userAnswer = answers[quiz.id];

    if (userAnswer === undefined || userAnswer === null || userAnswer === '') {
      errors.push(`Answer required for question: "${quiz.question.substring(0, 50)}..."`);
      return;
    }

    // Validate based on quiz type
    switch (quiz.quiz_type) {
      case 'true_false':
        if (!['true', 'false', true, false].includes(userAnswer)) {
          errors.push(`Invalid true/false answer for question: "${quiz.question.substring(0, 50)}..."`);
        }
        break;
      case 'multiple_choice':
        if (quiz.options && quiz.options.length > 0) {
          const validOptions = quiz.options.map(opt => opt.value || opt);
          if (!validOptions.includes(userAnswer)) {
            errors.push(`Invalid option selected for question: "${quiz.question.substring(0, 50)}..."`);
          }
        }
        break;
      case 'text':
        if (typeof userAnswer !== 'string' || userAnswer.trim().length === 0) {
          errors.push(`Text answer required for question: "${quiz.question.substring(0, 50)}..."`);
        }
        break;
    }
  });

  return errors;
};

// Get random quiz questions for practice
export const getRandomQuizQuestions = async (courseId, limit = 10) => {
  const result = await query(
    `SELECT q.id, q.question, q.options, q.quiz_type, q.points,
            l.title as lesson_title, m.title as module_title
     FROM quizzes q
     JOIN lessons l ON q.lesson_id = l.id
     JOIN modules m ON l.module_id = m.id
     WHERE m.course_id = $1 AND m.is_published = TRUE AND l.is_published = TRUE
     ORDER BY RANDOM()
     LIMIT $2`,
    [courseId, limit]
  );

  return result.rows;
};

export default {
  createQuiz,
  getQuizById,
  getQuizzesByLesson,
  getQuizQuestionsForStudent,
  updateQuiz,
  deleteQuiz,
  submitQuizAnswers,
  getQuizStats,
  bulkCreateQuizzes,
  getQuizzesByCourse,
  searchQuizzesInCourse,
  duplicateQuiz,
  getQuizDifficultyDistribution,
  validateQuizAnswers,
  getRandomQuizQuestions
};