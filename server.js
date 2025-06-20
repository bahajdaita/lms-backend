import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { testConnection } from './database/connection.js';
import { errorHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW) || 15)
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
}));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'LMS API is running successfully',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api', routes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /health - Health check',
      'POST /api/auth/register - User registration',
      'POST /api/auth/login - User login',
      'GET /api/auth/google - Google OAuth',
      'GET /api/courses - Get all courses',
      'POST /api/courses - Create course (Instructor)',
      'GET /api/users/profile - Get user profile',
      'POST /api/enrollments - Enroll in course'
    ]
  });
});

// Global error handler
app.use(errorHandler);

// Start server function with automatic port finding
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Server not started.');
      process.exit(1);
    }

    // Function to find available port
    const findAvailablePort = async (startPort) => {
      const net = await import('net');
      
      const isPortAvailable = (port) => {
        return new Promise((resolve) => {
          const server = net.createServer();
          server.listen(port, () => {
            server.once('close', () => {
              resolve(true);
            });
            server.close();
          });
          server.on('error', () => {
            resolve(false);
          });
        });
      };

      let port = startPort;
      while (port < startPort + 100) {
        if (await isPortAvailable(port)) {
          return port;
        }
        port++;
      }
      throw new Error('No available port found');
    };

    // Find available port starting from PORT
    const availablePort = await findAvailablePort(PORT);

    // Start server on available port
    app.listen(availablePort, () => {
      console.log(`
🚀 LMS Backend Server Started Successfully!
📍 Environment: ${process.env.NODE_ENV || 'development'}
🌐 Server URL: http://localhost:${availablePort}
💾 Database: Connected
🔒 Security: Enabled (Helmet, CORS, Rate Limiting)
📊 Logging: ${process.env.NODE_ENV === 'development' ? 'Development' : 'Production'} mode
⚡ Compression: Enabled
🎯 Health Check: http://localhost:${availablePort}/health
📚 API Base URL: http://localhost:${availablePort}/api

📋 Key Endpoints for Testing:
   • POST http://localhost:${availablePort}/api/auth/register
   • POST http://localhost:${availablePort}/api/auth/login
   • GET  http://localhost:${availablePort}/api/courses
   • POST http://localhost:${availablePort}/api/courses
   • GET  http://localhost:${availablePort}/api/categories
   • POST http://localhost:${availablePort}/api/enrollments

${availablePort !== PORT ? `⚠️  Note: Started on port ${availablePort} (${PORT} was in use)` : ''}
      `);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('💥 Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

export default app;