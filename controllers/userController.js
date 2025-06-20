import {
  getAllUsers,
  getUserProfile,
  updateUser,
  deleteUser,
  getUsersByRole,
  searchUsers,
  getUserDashboard,
  emailExists
} from '../models/userModel.js';
import { query } from '../database/connection.js';
import {
  getPaginationParams,
  getPaginationMeta,
  successResponse,
  errorResponse
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES, USER_ROLES } from '../utils/constants.js';

// Get all users (Admin only)
export const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req);
  const { role, search, sortBy, sortOrder } = req.query;

  const options = {
    page,
    limit,
    role,
    search,
    sortBy: sortBy || 'created_at',
    sortOrder: sortOrder || 'DESC'
  };

  const result = await getAllUsers(options);

  const meta = getPaginationMeta(page, limit, result.totalCount);

  res.status(HTTP_STATUS.OK).json(successResponse(
    {
      users: result.users,
      meta
    },
    'Users retrieved successfully'
  ));
});

// Get user by ID
export const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const requestingUser = req.user;

  // Users can only view their own profile unless they're admin
  if (requestingUser.role !== USER_ROLES.ADMIN && parseInt(id) !== requestingUser.id) {
    throw new AppError('Access denied. You can only view your own profile.', HTTP_STATUS.FORBIDDEN);
  }

  const user = await getUserProfile(id);
  if (!user) {
    throw new AppError(MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    user,
    'User profile retrieved successfully'
  ));
});

// Update user
export const updateUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const requestingUser = req.user;
  const { name, email, role } = req.body;

  // Users can only update their own profile unless they're admin
  if (requestingUser.role !== USER_ROLES.ADMIN && parseInt(id) !== requestingUser.id) {
    throw new AppError('Access denied. You can only update your own profile.', HTTP_STATUS.FORBIDDEN);
  }

  const updates = {};

  if (name) {
    updates.name = name.trim();
  }

  if (email) {
    // Check if new email already exists
    const emailInUse = await emailExists(email.toLowerCase().trim(), parseInt(id));
    if (emailInUse) {
      throw new AppError(MESSAGES.EMAIL_EXISTS, HTTP_STATUS.CONFLICT);
    }
    updates.email = email.toLowerCase().trim();
    updates.email_verified = false; // Reset verification if email changed
  }

  // Only admins can change roles
  if (role && requestingUser.role === USER_ROLES.ADMIN) {
    if (!Object.values(USER_ROLES).includes(role)) {
      throw new AppError('Invalid role specified', HTTP_STATUS.BAD_REQUEST);
    }
    updates.role = role;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', HTTP_STATUS.BAD_REQUEST);
  }

  const updatedUser = await updateUser(parseInt(id), updates);
  if (!updatedUser) {
    throw new AppError(MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedUser,
    MESSAGES.UPDATED
  ));
});

// Delete user (Admin only)
export const deleteUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const requestingUser = req.user;

  // Prevent admin from deleting themselves
  if (parseInt(id) === requestingUser.id) {
    throw new AppError('You cannot delete your own account', HTTP_STATUS.BAD_REQUEST);
  }

  const deletedUser = await deleteUser(parseInt(id));
  if (!deletedUser) {
    throw new AppError(MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'User deleted successfully'
  ));
});

// Get users by role
export const getUsersByRoleType = asyncHandler(async (req, res) => {
  const { role } = req.params;

  if (!Object.values(USER_ROLES).includes(role)) {
    throw new AppError('Invalid role specified', HTTP_STATUS.BAD_REQUEST);
  }

  const users = await getUsersByRole(role);

  res.status(HTTP_STATUS.OK).json(successResponse(
    users,
    `${role.charAt(0).toUpperCase() + role.slice(1)}s retrieved successfully`
  ));
});

// Search users
export const searchUsersEndpoint = asyncHandler(async (req, res) => {
  const { q: searchTerm, role, limit = 10 } = req.query;

  if (!searchTerm || searchTerm.trim().length < 2) {
    throw new AppError('Search term must be at least 2 characters', HTTP_STATUS.BAD_REQUEST);
  }

  const options = {
    limit: Math.min(parseInt(limit), 50), // Limit to 50 results max
    role
  };

  const users = await searchUsers(searchTerm.trim(), options);

  res.status(HTTP_STATUS.OK).json(successResponse(
    users,
    `Found ${users.length} users matching "${searchTerm}"`
  ));
});

// Get user dashboard data
export const getDashboard = asyncHandler(async (req, res) => {
  const user = req.user;

  const dashboardData = await getUserDashboard(user.id, user.role);

  res.status(HTTP_STATUS.OK).json(successResponse(
    dashboardData,
    'Dashboard data retrieved successfully'
  ));
});

// Get user statistics (Admin only)
export const getUserStats = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;

  // Get user registration statistics
  const registrationStats = await query(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as registrations,
      COUNT(*) FILTER (WHERE role = 'student') as student_registrations,
      COUNT(*) FILTER (WHERE role = 'instructor') as instructor_registrations
    FROM users 
    WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
      AND is_deleted = FALSE
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `);

  // Get overall user statistics
  const overallStats = await query(`
    SELECT 
      COUNT(*) as total_users,
      COUNT(*) FILTER (WHERE role = 'student') as total_students,
      COUNT(*) FILTER (WHERE role = 'instructor') as total_instructors,
      COUNT(*) FILTER (WHERE role = 'admin') as total_admins,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_users_week,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_users_month,
      COUNT(*) FILTER (WHERE last_login >= CURRENT_DATE - INTERVAL '7 days') as active_users_week,
      COUNT(*) FILTER (WHERE last_login >= CURRENT_DATE - INTERVAL '30 days') as active_users_month,
      COUNT(*) FILTER (WHERE email_verified = TRUE) as verified_users,
      COUNT(*) FILTER (WHERE google_id IS NOT NULL) as google_users
    FROM users 
    WHERE is_deleted = FALSE
  `);

  const stats = overallStats.rows[0];

  res.status(HTTP_STATUS.OK).json(successResponse({
    overview: {
      totalUsers: parseInt(stats.total_users),
      totalStudents: parseInt(stats.total_students),
      totalInstructors: parseInt(stats.total_instructors),
      totalAdmins: parseInt(stats.total_admins),
      newUsersThisWeek: parseInt(stats.new_users_week),
      newUsersThisMonth: parseInt(stats.new_users_month),
      activeUsersThisWeek: parseInt(stats.active_users_week),
      activeUsersThisMonth: parseInt(stats.active_users_month),
      verifiedUsers: parseInt(stats.verified_users),
      googleUsers: parseInt(stats.google_users)
    },
    registrationTrends: registrationStats.rows.map(row => ({
      date: row.date,
      registrations: parseInt(row.registrations),
      studentRegistrations: parseInt(row.student_registrations),
      instructorRegistrations: parseInt(row.instructor_registrations)
    }))
  }, 'User statistics retrieved successfully'));
});

// Get user activity log (Admin only)
export const getUserActivity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  // Get user basic info
  const user = await getUserProfile(id);
  if (!user) {
    throw new AppError(MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  // Get user activity (enrollments, submissions, etc.)
  const activityQuery = `
    SELECT 
      'enrollment' as activity_type,
      c.title as description,
      e.enrolled_at as created_at
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    WHERE e.user_id = $1
    
    UNION ALL
    
    SELECT 
      'submission' as activity_type,
      CONCAT('Submitted: ', a.title) as description,
      s.submitted_at as created_at
    FROM submissions s
    JOIN assignments a ON s.assignment_id = a.id
    WHERE s.student_id = $1
    
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;

  const activityResult = await query(activityQuery, [id, limit, offset]);

  // Get total activity count
  const countQuery = `
    SELECT COUNT(*) as total FROM (
      SELECT e.enrolled_at FROM enrollments e WHERE e.user_id = $1
      UNION ALL
      SELECT s.submitted_at FROM submissions s WHERE s.student_id = $1
    ) activities
  `;

  const countResult = await query(countQuery, [id]);
  const totalCount = parseInt(countResult.rows[0].total);

  const meta = getPaginationMeta(parseInt(page), parseInt(limit), totalCount);

  res.status(HTTP_STATUS.OK).json(successResponse({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    activities: activityResult.rows,
    meta
  }, 'User activity retrieved successfully'));
});

// Promote user to instructor (Admin only)
export const promoteToInstructor = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await getUserProfile(id);
  if (!user) {
    throw new AppError(MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  if (user.role === USER_ROLES.INSTRUCTOR) {
    throw new AppError('User is already an instructor', HTTP_STATUS.BAD_REQUEST);
  }

  if (user.role === USER_ROLES.ADMIN) {
    throw new AppError('Cannot change admin role', HTTP_STATUS.BAD_REQUEST);
  }

  const updatedUser = await updateUser(parseInt(id), { role: USER_ROLES.INSTRUCTOR });

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedUser,
    'User promoted to instructor successfully'
  ));
});

// Demote instructor to student (Admin only)
export const demoteToStudent = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await getUserProfile(id);
  if (!user) {
    throw new AppError(MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  if (user.role === USER_ROLES.STUDENT) {
    throw new AppError('User is already a student', HTTP_STATUS.BAD_REQUEST);
  }

  if (user.role === USER_ROLES.ADMIN) {
    throw new AppError('Cannot change admin role', HTTP_STATUS.BAD_REQUEST);
  }

  const updatedUser = await updateUser(parseInt(id), { role: USER_ROLES.STUDENT });

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedUser,
    'User demoted to student successfully'
  ));
});

// Bulk update users (Admin only)
export const bulkUpdateUsers = asyncHandler(async (req, res) => {
  const { userIds, updates } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new AppError('User IDs array is required', HTTP_STATUS.BAD_REQUEST);
  }

  if (!updates || Object.keys(updates).length === 0) {
    throw new AppError('Updates object is required', HTTP_STATUS.BAD_REQUEST);
  }

  const allowedUpdates = ['role', 'email_verified'];
  const validUpdates = {};

  Object.keys(updates).forEach(key => {
    if (allowedUpdates.includes(key)) {
      validUpdates[key] = updates[key];
    }
  });

  if (Object.keys(validUpdates).length === 0) {
    throw new AppError('No valid update fields provided', HTTP_STATUS.BAD_REQUEST);
  }

  const updatedUsers = [];
  const errors = [];

  for (const userId of userIds) {
    try {
      const updatedUser = await updateUser(parseInt(userId), validUpdates);
      if (updatedUser) {
        updatedUsers.push(updatedUser);
      } else {
        errors.push(`User with ID ${userId} not found`);
      }
    } catch (error) {
      errors.push(`Error updating user ${userId}: ${error.message}`);
    }
  }

  res.status(HTTP_STATUS.OK).json(successResponse({
    updatedUsers,
    updatedCount: updatedUsers.length,
    errors,
    errorCount: errors.length
  }, `Bulk update completed. ${updatedUsers.length} users updated.`));
});

export default {
  getUsers,
  getUserById,
  updateUserById,
  deleteUserById,
  getUsersByRoleType,
  searchUsersEndpoint,
  getDashboard,
  getUserStats,
  getUserActivity,
  promoteToInstructor,
  demoteToStudent,
  bulkUpdateUsers
};