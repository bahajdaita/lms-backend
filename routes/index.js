import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import courseRoutes from './courseRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import enrollmentRoutes from './enrollmentRoutes.js';
import moduleRoutes from './moduleRoutes.js';
import lessonRoutes from './lessonRoutes.js';
import quizRoutes from './quizRoutes.js';
import assignmentRoutes from './assignmentRoutes.js';
import submissionRoutes from './submissionRoutes.js';

const router = express.Router();

// Health check for API
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'LMS API v1.0 is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      courses: '/api/courses',
      categories: '/api/categories',
      enrollments: '/api/enrollments',
      modules: '/api/modules',
      lessons: '/api/lessons',
      quizzes: '/api/quizzes',
      assignments: '/api/assignments',
      submissions: '/api/submissions'
    },
    documentation: 'https://api-docs.lms.com',
    support: 'support@lms.com'
  });
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/courses', courseRoutes);
router.use('/categories', categoryRoutes);
router.use('/enrollments', enrollmentRoutes);
router.use('/modules', moduleRoutes);
router.use('/lessons', lessonRoutes);
router.use('/quizzes', quizRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/submissions', submissionRoutes);

// API status endpoint
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    features: {
      authentication: 'OAuth 2.0 + JWT',
      database: 'PostgreSQL with connection pooling',
      security: 'Rate limiting, CORS, Helmet',
      validation: 'Express-validator',
      fileUpload: 'Multer support',
      roles: ['student', 'instructor', 'admin'],
      totalEndpoints: 60,
      totalControllers: 10,
      totalModels: 8
    }
  });
});

export default router;