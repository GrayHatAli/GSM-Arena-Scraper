/**
 * JobLogger - مدیریت logging برای jobs با ثبت در database
 */

import { saveJobLog } from '../database/models.js';
import { logProgress } from '../utils/ScraperUtils.js';

export class JobLogger {
  constructor(jobId) {
    this.jobId = jobId;
    this.startTime = Date.now();
    
    // Log job start
    this.info('Job logger initialized', { 
      jobId: this.jobId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * ثبت log با سطح info
   * @param {string} message - پیام log
   * @param {Object} details - جزئیات اضافی (JSON)
   */
  info(message, details = null) {
    return this.log('info', message, details);
  }

  /**
   * ثبت log با سطح warning
   * @param {string} message - پیام log
   * @param {Object} details - جزئیات اضافی (JSON)
   */
  warn(message, details = null) {
    return this.log('warn', message, details);
  }

  /**
   * ثبت log با سطح error
   * @param {string} message - پیام log
   * @param {Object} details - جزئیات اضافی (JSON)
   */
  error(message, details = null) {
    return this.log('error', message, details);
  }

  /**
   * ثبت log با سطح debug
   * @param {string} message - پیام log
   * @param {Object} details - جزئیات اضافی (JSON)
   */
  debug(message, details = null) {
    return this.log('debug', message, details);
  }

  /**
   * ثبت log با سطح success
   * @param {string} message - پیام log
   * @param {Object} details - جزئیات اضافی (JSON)
   */
  success(message, details = null) {
    return this.log('success', message, details);
  }

  /**
   * ثبت log در database و console
   * @param {string} level - سطح log
   * @param {string} message - پیام log
   * @param {Object} details - جزئیات اضافی (JSON)
   */
  async log(level, message, details = null) {
    try {
      // ثبت در database
      await this.saveToDatabase(level, message, details);
      
      // ثبت در console با فرمت مناسب
      this.logToConsole(level, message, details);
      
    } catch (error) {
      console.error(`JobLogger error: ${error.message}`);
    }
  }

  /**
   * ثبت log در database
   * @param {string} level - سطح log
   * @param {string} message - پیام log
   * @param {Object} details - جزئیات اضافی
   */
  async saveToDatabase(level, message, details) {
    try {
      await saveJobLog(this.jobId, level, message, details);
    } catch (error) {
      console.error(`Failed to save job log to database: ${error.message}`);
    }
  }

  /**
   * نمایش log در console
   * @param {string} level - سطح log
   * @param {string} message - پیام log
   * @param {Object} details - جزئیات اضافی
   */
  logToConsole(level, message, details) {
    const timestamp = new Date().toLocaleTimeString('en-GB');
    const prefix = `[Job ${this.jobId}] [${timestamp}]`;
    
    // فرمت پیام برای console
    let consoleMessage = `${prefix} ${message}`;
    
    if (details && Object.keys(details).length > 0) {
      consoleMessage += ` | Details: ${JSON.stringify(details)}`;
    }

    // انتخاب مناسب log level برای console
    switch (level.toLowerCase()) {
      case 'error':
        logProgress(consoleMessage, 'error');
        break;
      case 'warn':
      case 'warning':
        logProgress(consoleMessage, 'warning');
        break;
      case 'success':
        logProgress(consoleMessage, 'success');
        break;
      case 'debug':
        logProgress(consoleMessage, 'debug');
        break;
      case 'info':
      default:
        logProgress(consoleMessage, 'info');
        break;
    }
  }

  /**
   * ثبت progress job
   * @param {string} message - پیام progress
   * @param {Object} progressData - اطلاعات progress
   */
  progress(message, progressData = {}) {
    this.info(message, {
      type: 'progress',
      ...progressData,
      elapsed_ms: Date.now() - this.startTime
    });
  }

  /**
   * ثبت شروع مرحله جدید
   * @param {string} stepName - نام مرحله
   * @param {Object} stepData - اطلاعات مرحله
   */
  startStep(stepName, stepData = {}) {
    this.info(`Starting step: ${stepName}`, {
      type: 'step_start',
      step: stepName,
      ...stepData,
      elapsed_ms: Date.now() - this.startTime
    });
  }

  /**
   * ثبت اتمام مرحله
   * @param {string} stepName - نام مرحله
   * @param {Object} stepResult - نتیجه مرحله
   */
  endStep(stepName, stepResult = {}) {
    this.success(`Completed step: ${stepName}`, {
      type: 'step_end',
      step: stepName,
      ...stepResult,
      elapsed_ms: Date.now() - this.startTime
    });
  }

  /**
   * ثبت retry attempt
   * @param {number} attempt - شماره attempt
   * @param {number} maxAttempts - حداکثر attempts
   * @param {string} reason - دلیل retry
   */
  retry(attempt, maxAttempts, reason) {
    this.warn(`Retry attempt ${attempt}/${maxAttempts}`, {
      type: 'retry',
      attempt,
      maxAttempts,
      reason,
      elapsed_ms: Date.now() - this.startTime
    });
  }

  /**
   * ثبت آمار نهایی job
   * @param {Object} stats - آمار job
   */
  stats(stats) {
    this.info('Job statistics', {
      type: 'stats',
      ...stats,
      total_elapsed_ms: Date.now() - this.startTime
    });
  }

  /**
   * ثبت اتمام job
   * @param {boolean} success - موفقیت job
   * @param {Object} result - نتیجه job
   */
  finish(success, result = null) {
    const totalTime = Date.now() - this.startTime;
    
    if (success) {
      this.success('Job completed successfully', {
        type: 'job_completed',
        result,
        total_elapsed_ms: totalTime
      });
    } else {
      this.error('Job failed', {
        type: 'job_failed',
        result,
        total_elapsed_ms: totalTime
      });
    }
  }
}
