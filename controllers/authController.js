import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { query } from '../database/connection.js';
import { 
  createUser, 
  findUserByEmail, 
  findUserByGoogleId, 
  findUserById, 
  updateLastLogin,
  updateUser,
  updateUserPassword,
  emailExists 
} from '../models/userModel.js';
import { 
  hashPassword, 
  comparePassword, 
  generateAccessToken,
  successResponse,
  errorResponse 
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES } from '../utils/constants.js';

// Configure Passport strategies
const configurePassport = () => {
  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists with Google ID
      let user = await findUserByGoogleId(profile.id);
      
      if (user) {
        await updateLastLogin(user.id);
        return done(null, user);
      }

      // Check if user exists with same email
      user = await findUserByEmail(profile.emails[0].value);
      
      if (user) {
        // Link Google account to existing user
        user.google_id = profile.id;
        user.avatar = user.avatar || profile.photos[0]?.value;
        await updateUser(user.id, { 
          google_id: profile.id, 
          avatar: user.avatar,
          email_verified: true 
        });
        await updateLastLogin(user.id);
        return done(null, user);
      }

      // Create new user
      const newUser = await createUser({
        name: profile.displayName,
        email: profile.emails[0].value,
        google_id: profile.id,
        avatar: profile.photos[0]?.value,
        role: 'student' // Default role for Google sign-ups
      });

      await updateLastLogin(newUser.id);
      return done(null, newUser);

    } catch (error) {
      return done(error, null);
    }
  }));

  // JWT Strategy
  passport.use(new JwtStrategy({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET
  }, async (payload, done) => {
    try {
      const user = await findUserById(payload.id);
      if (user && !user.is_deleted) {
        return done(null, user);
      }
      return done(null, false);
    } catch (error) {
      return done(error, false);
    }
  }));

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await findUserById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};

// Initialize passport configuration
configurePassport();

// Register new user
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role = 'student' } = req.body;

  // Check if email already exists
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new AppError(MESSAGES.EMAIL_EXISTS, HTTP_STATUS.CONFLICT);
  }

  // Create new user
  const user = await createUser({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role
  });

  // Generate JWT token
  const token = generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  // Update last login
  await updateLastLogin(user.id);

  res.status(HTTP_STATUS.CREATED).json(successResponse({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      created_at: user.created_at
    },
    token
  }, MESSAGES.REGISTRATION_SUCCESS));
});

// Login user
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await findUserByEmail(email.toLowerCase().trim());
  if (!user) {
    throw new AppError(MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
  }

  // Check if user has a password (might be Google-only user)
  if (!user.password) {
    throw new AppError('Please login with Google or reset your password', HTTP_STATUS.UNAUTHORIZED);
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new AppError(MESSAGES.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
  }

  // Generate JWT token
  const token = generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  // Update last login
  await updateLastLogin(user.id);

  res.status(HTTP_STATUS.OK).json(successResponse({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      email_verified: user.email_verified,
      last_login: new Date()
    },
    token
  }, MESSAGES.LOGIN_SUCCESS));
});

// Google OAuth initiate
export const googleAuth = passport.authenticate('google', {
  scope: ['profile', 'email']
});

// Google OAuth callback
export const googleCallback = asyncHandler(async (req, res, next) => {
  passport.authenticate('google', { session: false }, (err, user) => {
    if (err) {
      console.error('Google OAuth error:', err);
      return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_error`);
    }

    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_failed`);
    }

    // Generate JWT token
    const token = generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role
    });

    // Redirect to frontend with token
    res.redirect(`${process.env.CLIENT_URL}/auth/success?token=${token}`);
  })(req, res, next);
});

// Logout user
export const logout = asyncHandler(async (req, res) => {
  // In JWT-based auth, logout is handled client-side by removing the token
  // We could implement token blacklisting here if needed
  
  res.status(HTTP_STATUS.OK).json(successResponse(
    null, 
    MESSAGES.LOGOUT_SUCCESS
  ));
});

// Get current user profile
export const getProfile = asyncHandler(async (req, res) => {
  const user = req.user;

  res.status(HTTP_STATUS.OK).json(successResponse({
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    email_verified: user.email_verified,
    last_login: user.last_login,
    created_at: user.created_at
  }));
});

// Update current user profile
export const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { name, email } = req.body;
  const updates = {};

  if (name) {
    updates.name = name.trim();
  }

  if (email && email !== req.user.email) {
    // Check if new email already exists
    const emailInUse = await emailExists(email.toLowerCase().trim(), userId);
    if (emailInUse) {
      throw new AppError(MESSAGES.EMAIL_EXISTS, HTTP_STATUS.CONFLICT);
    }
    updates.email = email.toLowerCase().trim();
    updates.email_verified = false; // Reset verification if email changed
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', HTTP_STATUS.BAD_REQUEST);
  }

  const updatedUser = await updateUser(userId, updates);
  if (!updatedUser) {
    throw new AppError(MESSAGES.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  res.status(HTTP_STATUS.OK).json(successResponse({
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    avatar: updatedUser.avatar,
    role: updatedUser.role,
    email_verified: updatedUser.email_verified,
    updated_at: updatedUser.updated_at
  }, MESSAGES.UPDATED));
});

// Change password
export const changePassword = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const user = await findUserByEmail(req.user.email);
  if (!user || !user.password) {
    throw new AppError('Current password is required', HTTP_STATUS.BAD_REQUEST);
  }

  // Verify current password
  const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
  if (!isCurrentPasswordValid) {
    throw new AppError('Current password is incorrect', HTTP_STATUS.UNAUTHORIZED);
  }

  // Update password
  await updateUserPassword(userId, newPassword);

  res.status(HTTP_STATUS.OK).json(successResponse(
    null,
    'Password updated successfully'
  ));
});

// Refresh token
export const refreshToken = asyncHandler(async (req, res) => {
  const user = req.user;

  // Generate new token
  const token = generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  res.status(HTTP_STATUS.OK).json(successResponse({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role
    }
  }));
});

// Validate token endpoint
export const validateToken = asyncHandler(async (req, res) => {
  // If we reach here, the token is valid (middleware authenticated it)
  const user = req.user;

  res.status(HTTP_STATUS.OK).json(successResponse({
    valid: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role
    }
  }));
});

// Check email availability
export const checkEmailAvailability = asyncHandler(async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    throw new AppError('Email is required', HTTP_STATUS.BAD_REQUEST);
  }

  const exists = await emailExists(email.toLowerCase().trim());

  res.status(HTTP_STATUS.OK).json(successResponse({
    available: !exists,
    email: email.toLowerCase().trim()
  }));
});

// Get authentication statistics (admin only)
export const getAuthStats = asyncHandler(async (req, res) => {
  const stats = await query(`
    SELECT 
      COUNT(*) as total_users,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_users_week,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_users_month,
      COUNT(*) FILTER (WHERE last_login >= CURRENT_DATE - INTERVAL '7 days') as active_users_week,
      COUNT(*) FILTER (WHERE last_login >= CURRENT_DATE - INTERVAL '30 days') as active_users_month,
      COUNT(*) FILTER (WHERE google_id IS NOT NULL) as google_users,
      COUNT(*) FILTER (WHERE password IS NOT NULL) as email_users,
      COUNT(*) FILTER (WHERE role = 'student') as students,
      COUNT(*) FILTER (WHERE role = 'instructor') as instructors,
      COUNT(*) FILTER (WHERE role = 'admin') as admins
    FROM users 
    WHERE is_deleted = FALSE
  `);

  const authStats = stats.rows[0];

  res.status(HTTP_STATUS.OK).json(successResponse({
    totalUsers: parseInt(authStats.total_users),
    newUsersThisWeek: parseInt(authStats.new_users_week),
    newUsersThisMonth: parseInt(authStats.new_users_month),
    activeUsersThisWeek: parseInt(authStats.active_users_week),
    activeUsersThisMonth: parseInt(authStats.active_users_month),
    googleUsers: parseInt(authStats.google_users),
    emailUsers: parseInt(authStats.email_users),
    students: parseInt(authStats.students),
    instructors: parseInt(authStats.instructors),
    admins: parseInt(authStats.admins)
  }));
});

export default {
  register,
  login,
  googleAuth,
  googleCallback,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  refreshToken,
  validateToken,
  checkEmailAvailability,
  getAuthStats
};