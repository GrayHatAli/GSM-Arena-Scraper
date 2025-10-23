// Response Helper - Standardized API responses

export class ResponseHelper {
  /**
   * Create success response
   * @param {string} message - Success message
   * @param {*} data - Response data
   * @param {number} statusCode - HTTP status code
   * @returns {Object} - Success response
   */
  static success(message, data = null, statusCode = 200) {
    return {
      success: true,
      message,
      data,
      statusCode,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create error response
   * @param {string} message - Error message
   * @param {string} error - Error details
   * @param {number} statusCode - HTTP status code
   * @returns {Object} - Error response
   */
  static error(message, error = null, statusCode = 500) {
    return {
      success: false,
      message,
      error,
      statusCode,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create validation error response
   * @param {string} message - Validation message
   * @param {Array} errors - Validation errors
   * @returns {Object} - Validation error response
   */
  static validationError(message, errors = []) {
    return {
      success: false,
      message,
      errors,
      statusCode: 400,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create not found response
   * @param {string} message - Not found message
   * @returns {Object} - Not found response
   */
  static notFound(message = 'Resource not found') {
    return {
      success: false,
      message,
      statusCode: 404,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create unauthorized response
   * @param {string} message - Unauthorized message
   * @returns {Object} - Unauthorized response
   */
  static unauthorized(message = 'Unauthorized access') {
    return {
      success: false,
      message,
      statusCode: 401,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create paginated response
   * @param {string} message - Success message
   * @param {Array} data - Response data
   * @param {Object} pagination - Pagination info
   * @returns {Object} - Paginated response
   */
  static paginated(message, data, pagination) {
    return {
      success: true,
      message,
      data,
      pagination,
      statusCode: 200,
      timestamp: new Date().toISOString()
    };
  }
}
