import express from 'express';
import {
  getCategories,
  getCategoryByIdController,
  createCategoryController,
  updateCategoryController,
  deleteCategoryController,
  getPopularCategoriesController,
  searchCategoriesController,
  getCategoryStatsController,
  getCategoriesOverview,
  bulkDeleteCategories,
  getCategoryDistribution,
  mergeCategories
} from '../controllers/categoryController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  validateId,
  validateSearch
} from '../middleware/validation.js';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validation.js';
import { USER_ROLES } from '../utils/constants.js';

const router = express.Router();

// Public routes
router.get('/', getCategories);
router.get('/popular', getPopularCategoriesController);
router.get('/search', validateSearch, searchCategoriesController);
router.get('/:id', validateId, getCategoryByIdController);

// Protected routes (authentication required)
router.use(authenticate);

// Admin only routes
router.post('/', authorize(USER_ROLES.ADMIN), [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Category name must be between 2 and 100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  handleValidationErrors
], createCategoryController);

router.put('/:id', authorize(USER_ROLES.ADMIN), validateId, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Category name must be between 2 and 100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  handleValidationErrors
], updateCategoryController);

router.delete('/:id', authorize(USER_ROLES.ADMIN), validateId, deleteCategoryController);

// Admin dashboard and analytics
router.get('/admin/overview', authorize(USER_ROLES.ADMIN), getCategoriesOverview);
router.get('/admin/distribution', authorize(USER_ROLES.ADMIN), getCategoryDistribution);
router.get('/:id/stats', authorize(USER_ROLES.ADMIN), validateId, getCategoryStatsController);

// Bulk operations (admin only)
router.delete('/bulk/delete', authorize(USER_ROLES.ADMIN), [
  body('categoryIds').isArray({ min: 1 }).withMessage('Category IDs array is required'),
  handleValidationErrors
], bulkDeleteCategories);

router.post('/bulk/merge', authorize(USER_ROLES.ADMIN), [
  body('sourceCategoryIds').isArray({ min: 1 }).withMessage('Source category IDs array is required'),
  body('targetCategoryId').isInt({ min: 1 }).withMessage('Target category ID is required'),
  handleValidationErrors
], mergeCategories);

export default router;