import {
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
} from '../models/categoryModel.js';
import {
  successResponse,
  errorResponse
} from '../utils/helpers.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { HTTP_STATUS, MESSAGES, USER_ROLES } from '../utils/constants.js';

// Get all categories
export const getCategories = asyncHandler(async (req, res) => {
  const { withCourseCount = false } = req.query;

  let categories;
  if (withCourseCount === 'true') {
    categories = await getCategoriesWithCourseCount();
  } else {
    categories = await getAllCategories();
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    categories,
    'Categories retrieved successfully'
  ));
});

// Get category by ID
export const getCategoryByIdController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const category = await getCategoryById(parseInt(id));
  if (!category) {
    throw new AppError('Category not found', HTTP_STATUS.NOT_FOUND);
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    category,
    'Category retrieved successfully'
  ));
});

// Create new category (Admin only)
export const createCategoryController = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  // Check if category name already exists
  const nameExists = await categoryNameExists(name);
  if (nameExists) {
    throw new AppError('Category name already exists', HTTP_STATUS.CONFLICT);
  }

  const categoryData = {
    name: name.trim(),
    description: description?.trim()
  };

  const category = await createCategory(categoryData);

  res.status(HTTP_STATUS.CREATED).json(successResponse(
    category,
    'Category created successfully'
  ));
});

// Update category (Admin only)
export const updateCategoryController = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  // Check if category exists
  const existingCategory = await getCategoryById(parseInt(id));
  if (!existingCategory) {
    throw new AppError('Category not found', HTTP_STATUS.NOT_FOUND);
  }

  const updates = {};

  if (name) {
    // Check if new name conflicts with other categories
    const nameExists = await categoryNameExists(name, parseInt(id));
    if (nameExists) {
      throw new AppError('Category name already exists', HTTP_STATUS.CONFLICT);
    }
    updates.name = name.trim();
  }

  if (description !== undefined) {
    updates.description = description?.trim();
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No valid fields to update', HTTP_STATUS.BAD_REQUEST);
  }

  const updatedCategory = await updateCategory(parseInt(id), updates);

  res.status(HTTP_STATUS.OK).json(successResponse(
    updatedCategory,
    'Category updated successfully'
  ));
});

// Delete category (Admin only)
export const deleteCategoryController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const deletedCategory = await deleteCategory(parseInt(id));
    if (!deletedCategory) {
      throw new AppError('Category not found', HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(successResponse(
      null,
      'Category deleted successfully'
    ));
  } catch (error) {
    if (error.message.includes('associated courses')) {
      throw new AppError(error.message, HTTP_STATUS.CONFLICT);
    }
    throw error;
  }
});

// Get popular categories
export const getPopularCategoriesController = asyncHandler(async (req, res) => {
  const { limit = 5 } = req.query;

  const categories = await getPopularCategories(parseInt(limit));

  res.status(HTTP_STATUS.OK).json(successResponse(
    categories,
    'Popular categories retrieved successfully'
  ));
});

// Search categories
export const searchCategoriesController = asyncHandler(async (req, res) => {
  const { q: searchTerm } = req.query;

  if (!searchTerm || searchTerm.trim().length < 2) {
    throw new AppError('Search term must be at least 2 characters', HTTP_STATUS.BAD_REQUEST);
  }

  const categories = await searchCategories(searchTerm.trim());

  res.status(HTTP_STATUS.OK).json(successResponse(
    categories,
    `Found ${categories.length} categories matching "${searchTerm}"`
  ));
});

// Get category statistics (Admin only)
export const getCategoryStatsController = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const stats = await getCategoryStats(parseInt(id));
  if (!stats) {
    throw new AppError('Category not found', HTTP_STATUS.NOT_FOUND);
  }

  res.status(HTTP_STATUS.OK).json(successResponse(
    stats,
    'Category statistics retrieved successfully'
  ));
});

// Get categories overview (Admin dashboard)
export const getCategoriesOverview = asyncHandler(async (req, res) => {
  // Get all categories with course counts
  const categoriesWithCounts = await getCategoriesWithCourseCount();

  // Get popular categories
  const popularCategories = await getPopularCategories(10);

  // Calculate overview statistics
  const totalCategories = categoriesWithCounts.length;
  const categoriesWithCourses = categoriesWithCounts.filter(cat => cat.course_count > 0).length;
  const emptyCategories = totalCategories - categoriesWithCourses;
  const totalCourses = categoriesWithCounts.reduce((sum, cat) => sum + cat.course_count, 0);
  const avgCoursesPerCategory = totalCategories > 0 ? (totalCourses / totalCategories).toFixed(2) : 0;

  res.status(HTTP_STATUS.OK).json(successResponse({
    overview: {
      totalCategories,
      categoriesWithCourses,
      emptyCategories,
      totalCourses,
      avgCoursesPerCategory: parseFloat(avgCoursesPerCategory)
    },
    allCategories: categoriesWithCounts,
    popularCategories
  }, 'Categories overview retrieved successfully'));
});

// Bulk delete categories (Admin only)
export const bulkDeleteCategories = asyncHandler(async (req, res) => {
  const { categoryIds } = req.body;

  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    throw new AppError('Category IDs array is required', HTTP_STATUS.BAD_REQUEST);
  }

  const results = [];
  const errors = [];

  for (const categoryId of categoryIds) {
    try {
      await deleteCategory(parseInt(categoryId));
      results.push({ id: categoryId, status: 'deleted' });
    } catch (error) {
      errors.push({ 
        id: categoryId, 
        error: error.message.includes('associated courses') 
          ? 'Category has associated courses' 
          : 'Not found or error occurred'
      });
    }
  }

  res.status(HTTP_STATUS.OK).json(successResponse({
    deleted: results,
    errors,
    deletedCount: results.length,
    errorCount: errors.length
  }, `Bulk delete completed. ${results.length} categories deleted.`));
});

// Get category course distribution
export const getCategoryDistribution = asyncHandler(async (req, res) => {
  const categories = await getCategoriesWithCourseCount();

  // Group categories by course count ranges
  const distribution = {
    empty: categories.filter(cat => cat.course_count === 0).length,
    low: categories.filter(cat => cat.course_count >= 1 && cat.course_count <= 5).length,
    medium: categories.filter(cat => cat.course_count >= 6 && cat.course_count <= 15).length,
    high: categories.filter(cat => cat.course_count >= 16 && cat.course_count <= 30).length,
    veryHigh: categories.filter(cat => cat.course_count > 30).length
  };

  const chartData = [
    { range: '0 courses', count: distribution.empty },
    { range: '1-5 courses', count: distribution.low },
    { range: '6-15 courses', count: distribution.medium },
    { range: '16-30 courses', count: distribution.high },
    { range: '30+ courses', count: distribution.veryHigh }
  ];

  res.status(HTTP_STATUS.OK).json(successResponse({
    distribution,
    chartData,
    totalCategories: categories.length
  }, 'Category distribution retrieved successfully'));
});

// Merge categories (Admin only)
export const mergeCategories = asyncHandler(async (req, res) => {
  const { sourceCategoryIds, targetCategoryId } = req.body;

  if (!Array.isArray(sourceCategoryIds) || sourceCategoryIds.length === 0) {
    throw new AppError('Source category IDs array is required', HTTP_STATUS.BAD_REQUEST);
  }

  if (!targetCategoryId) {
    throw new AppError('Target category ID is required', HTTP_STATUS.BAD_REQUEST);
  }

  // Verify target category exists
  const targetCategory = await getCategoryById(parseInt(targetCategoryId));
  if (!targetCategory) {
    throw new AppError('Target category not found', HTTP_STATUS.NOT_FOUND);
  }

  // Move all courses from source categories to target category
  let movedCourses = 0;
  const errors = [];

  for (const sourceCategoryId of sourceCategoryIds) {
    if (parseInt(sourceCategoryId) === parseInt(targetCategoryId)) {
      continue; // Skip if source is same as target
    }

    try {
      // Update courses to use target category
      const updateResult = await query(
        'UPDATE courses SET category_id = $1 WHERE category_id = $2 AND is_deleted = FALSE',
        [parseInt(targetCategoryId), parseInt(sourceCategoryId)]
      );

      movedCourses += updateResult.rowCount;

      // Delete the source category
      await deleteCategory(parseInt(sourceCategoryId));
    } catch (error) {
      errors.push({
        categoryId: sourceCategoryId,
        error: error.message
      });
    }
  }

  res.status(HTTP_STATUS.OK).json(successResponse({
    targetCategory,
    movedCourses,
    errors,
    mergedCategories: sourceCategoryIds.length - errors.length
  }, `Categories merged successfully. ${movedCourses} courses moved to "${targetCategory.name}".`));
});

export default {
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
};