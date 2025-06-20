import jwt from 'jsonwebtoken';
import { query } from '../database/connection.js';
import { AppError, asyncHandler } from './errorHandler.js';

// Verify JWT token
export const authenticate = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // Check if token exists
  if (!token) {
    return next(new AppError('Access denied. No token provided.', 401));
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const result = await query(
      'SELECT id, name, email, role, avatar, is_deleted FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Token is invalid. User not found.', 401));
    }

    const user = result.rows[0];

    // Check if user is deleted
    if (user.is_deleted) {
      return next(new AppError('User account has been deactivated.', 401));
    }

    // Add user to request
    req.user = user;
    next();

  } catch (error) {
    return next(new AppError('Token is invalid.', 401));
  }
});

// Check if user is authenticated (optional authentication)
export const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query(
        'SELECT id, name, email, role, avatar, is_deleted FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length > 0 && !result.rows[0].is_deleted) {
        req.user = result.rows[0];
      }
    } catch (error) {
      // Continue without user if token is invalid
    }
  }

  next();
});

// Authorize specific roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Access denied. Authentication required.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(`Access denied. Required role: ${roles.join(' or ')}.`, 403));
    }

    next();
  };
};

// Check if user owns resource or is admin
export const authorizeOwnerOrAdmin = (userIdField = 'user_id') => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Access denied. Authentication required.', 401));
    }

    // Admin can access everything
    if (req.user.role === 'admin') {
      return next();
    }

    // Get resource ID from params or body
    const resourceId = req.params.id || req.body.id;
    const userId = req.user.id;

    // For direct user operations (like profile updates)
    if (userIdField === 'id' && resourceId && parseInt(resourceId) === userId) {
      return next();
    }

    // For resources that belong to users (enrollments, submissions, etc.)
    if (req.body[userIdField] && parseInt(req.body[userIdField]) === userId) {
      return next();
    }

    return next(new AppError('Access denied. You can only access your own resources.', 403));
  });
};

// Check if user is instructor of the course
export const authorizeInstructor = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Access denied. Authentication required.', 401));
  }

  // Admin can access everything
  if (req.user.role === 'admin') {
    return next();
  }

  // Must be instructor
  if (req.user.role !== 'instructor') {
    return next(new AppError('Access denied. Instructor role required.', 403));
  }

  // Check if instructor owns the course
  const courseId = req.params.courseId || req.params.id || req.body.course_id;
  
  if (courseId) {
    const result = await query(
      'SELECT instructor_id FROM courses WHERE id = $1 AND is_deleted = FALSE',
      [courseId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Course not found.', 404));
    }

    if (result.rows[0].instructor_id !== req.user.id) {
      return next(new AppError('Access denied. You are not the instructor of this course.', 403));
    }
  }

  next();
});

// Check if user is enrolled in course
export const authorizeEnrolledStudent = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Access denied. Authentication required.', 401));
  }

  // Admin and instructors can access
  if (req.user.role === 'admin' || req.user.role === 'instructor') {
    return next();
  }

  const courseId = req.params.courseId || req.params.id;
  const userId = req.user.id;

  if (!courseId) {
    return next(new AppError('Course ID is required.', 400));
  }

  // Check enrollment
  const result = await query(
    'SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2',
    [userId, courseId]
  );

  if (result.rows.length === 0) {
    return next(new AppError('Access denied. You are not enrolled in this course.', 403));
  }

  next();
});

// Generate JWT token
export const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Extract user ID from token (without full authentication)
export const extractUserId = (req) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id;
  } catch (error) {
    return null;
  }
};

export default {
  authenticate,
  optionalAuth,
  authorize,
  authorizeOwnerOrAdmin,
  authorizeInstructor,
  authorizeEnrolledStudent,
  generateToken,
  extractUserId
};