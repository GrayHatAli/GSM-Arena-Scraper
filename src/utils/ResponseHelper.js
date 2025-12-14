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
   * Create accepted (202) response for async operations
   * @param {string} message
   * @param {*} data
   * @returns {Object}
   */
  static accepted(message, data = null) {
    return {
      success: true,
      message,
      data,
      statusCode: 202,
      timestamp: new Date().toISOString()
    };
  }
}
