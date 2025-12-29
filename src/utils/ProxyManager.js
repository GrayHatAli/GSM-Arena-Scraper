/**
 * ProxyManager - مدیریت پروکسی‌ها با قابلیت rotation و health monitoring
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logProgress } from './ScraperUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProxyManager {
  constructor(options = {}) {
    this.proxies = [];
    this.currentIndex = 0;
    this.failedProxies = new Set();
    this.proxyStats = new Map(); // آمار هر پروکسی
    this.enabled = options.enabled !== false;
    this.disabledUntil = 0;
    this._refreshInFlight = null;
    this.failureWindow = {
      startedAt: Date.now(),
      count: 0
    };
    // Options are primarily provided by config/config.js (PROXY). Accept any overrides via the `options` argument.
    this.options = {
      ...options
    };
    
    // Load proxies from file
    if (this.enabled) {
      this.loadProxies();
    } else {
      logProgress('Proxy support disabled by configuration.', 'info');
    }
    
    // Start health check timer
    if (this.enabled && this.options.healthCheckInterval > 0) {
      this.startHealthCheckTimer();
    }
    
    logProgress(`ProxyManager initialized with ${this.proxies.length} proxies`, 'info');
  }

  /**
   * خواندن پروکسی‌ها از فایل ProxyList.txt
   */
  loadProxies() {
    try {
      const proxyListPath = this.getProxyListPath();
      
      if (!fs.existsSync(proxyListPath)) {
        logProgress('ProxyList.txt not found. Running without proxy support.', 'warning');
        return;
      }

      const content = fs.readFileSync(proxyListPath, 'utf-8');
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      this.proxies = [];
      this.proxyStats.clear();
      
      for (const line of lines) {
        const proxy = this.parseProxyLine(line);
        if (proxy) {
          this.proxies.push(proxy);
          this.initProxyStats(proxy);
        }
      }

      logProgress(`Loaded ${this.proxies.length} proxies from ProxyList.txt`, 'success');
      
    } catch (error) {
      logProgress(`Error loading proxy list: ${error.message}`, 'error');
    }
  }

  /**
   * پارس کردن خط پروکسی (IP:Port یا IP:Port:Username:Password)
   */
  parseProxyLine(line) {
    let normalized = line.trim();
    let protocol = null;
    let host = null;
    let port = null;
    let auth = null;

    if (!normalized) {
      return null;
    }

    if (normalized.includes('://')) {
      try {
        const url = new URL(normalized);
        protocol = url.protocol ? url.protocol.replace(':', '').toLowerCase() : null;
        host = url.hostname;
        port = url.port ? parseInt(url.port, 10) : null;
        if (url.username || url.password) {
          auth = {
            username: decodeURIComponent(url.username || ''),
            password: decodeURIComponent(url.password || '')
          };
        }
      } catch (error) {
        logProgress(`Invalid proxy URL format: ${line}`, 'warning');
        return null;
      }
    }

    if (!host || !port) {
      const parts = normalized.split(':');
    
      if (parts.length < 2) {
        logProgress(`Invalid proxy format: ${line}`, 'warning');
        return null;
      }

      host = parts[0].trim();
      port = parseInt(parts[1].trim(), 10);

      // Check for authentication
      if (parts.length >= 4) {
        auth = {
          username: parts[2].trim(),
          password: parts[3].trim()
        };
      }
    }

    const proxy = {
      host,
      port,
      protocol: protocol || null,
      id: protocol ? `${protocol}://${host}:${port}` : `${host}:${port}`
    };

    // Check for authentication
    if (auth && auth.username && auth.password) {
      proxy.auth = auth;
    }

    // Validate IP and port
    if (!this.isValidIP(proxy.host) || isNaN(proxy.port) || proxy.port <= 0 || proxy.port > 65535) {
      logProgress(`Invalid proxy: ${line}`, 'warning');
      return null;
    }

    return proxy;
  }

  /**
   * اعتبارسنجی IP address
   */
  isValidIP(ip) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  /**
   * مقداردهی اولیه آمار پروکسی
   */
  initProxyStats(proxy) {
    this.proxyStats.set(proxy.id, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      lastUsed: null,
      lastSuccess: null,
      lastFailure: null,
      consecutiveFailures: 0,
      avgResponseTime: 0,
      isHealthy: true
    });
  }

  /**
   * دریافت پروکسی بعدی (round-robin)
   */
  getNextProxy() {
    const healthyProxies = this.getHealthyProxies();
    
    if (healthyProxies.length === 0) {
      logProgress('No healthy proxies available!', 'error');
      return null;
    }

    // Round-robin selection
    const proxy = healthyProxies[this.currentIndex % healthyProxies.length];
    this.currentIndex++;
    
    // Update last used time
    const stats = this.proxyStats.get(proxy.id);
    if (stats) {
      stats.lastUsed = Date.now();
    }

    logProgress(`Using proxy: ${proxy.id}`, 'debug');
    return proxy;
  }

  /**
   * تغییر به پروکسی بعدی (برای زمان خطا)
   */
  rotateProxy() {
    return this.getNextProxy();
  }

  /**
   * ثبت موفقیت پروکسی
   */
  recordProxySuccess(proxy, responseTime = 0) {
    const stats = this.proxyStats.get(proxy.id);
    if (!stats) return;

    stats.totalRequests++;
    stats.successfulRequests++;
    stats.consecutiveFailures = 0;
    stats.lastSuccess = Date.now();
    stats.isHealthy = true;
    
    // Update average response time
    stats.avgResponseTime = stats.avgResponseTime === 0 
      ? responseTime 
      : (stats.avgResponseTime * 0.9) + (responseTime * 0.1);

    // Remove from failed proxies if it was there
    this.failedProxies.delete(proxy.id);

    logProgress(`Proxy ${proxy.id} success recorded (${responseTime}ms)`, 'debug');
  }

  /**
   * ثبت خطای پروکسی
   */
  recordProxyFailure(proxy, errorType = 'general') {
    const stats = this.proxyStats.get(proxy.id);
    if (!stats) return;

    stats.totalRequests++;
    stats.failedRequests++;
    stats.consecutiveFailures++;
    stats.lastFailure = Date.now();
    this.trackFailureWindow();

    if (errorType === 'rate_limit') {
      stats.rateLimitedRequests++;
    }

    // Mark as unhealthy if too many consecutive failures
    if (stats.consecutiveFailures >= this.options.maxFailuresPerProxy) {
      stats.isHealthy = false;
      this.failedProxies.add(proxy.id);
      logProgress(`Proxy ${proxy.id} marked as unhealthy after ${stats.consecutiveFailures} failures`, 'warning');
    }

    logProgress(`Proxy ${proxy.id} failure recorded (${errorType})`, 'debug');
  }

  /**
   * حذف پروکسی خراب از لیست
   */
  removeFailedProxy(proxy) {
    const index = this.proxies.findIndex(p => p.id === proxy.id);
    if (index !== -1) {
      this.proxies.splice(index, 1);
      this.proxyStats.delete(proxy.id);
      this.failedProxies.delete(proxy.id);
      logProgress(`Removed failed proxy: ${proxy.id}`, 'warning');
    }
  }

  /**
   * دریافت لیست پروکسی‌های سالم
   */
  getHealthyProxies() {
    return this.proxies.filter(proxy => {
      const stats = this.proxyStats.get(proxy.id);
      return stats && stats.isHealthy && !this.failedProxies.has(proxy.id);
    });
  }

  /**
   * تبدیل پروکسی به فرمت axios
   */
  toAxiosProxy(proxy) {
    if (!proxy) return null;

    const axiosProxy = {
      protocol: proxy.protocol || 'http',
      host: proxy.host,
      port: proxy.port
    };

    if (proxy.auth) {
      axiosProxy.auth = {
        username: proxy.auth.username,
        password: proxy.auth.password
      };
    }

    return axiosProxy;
  }

  /**
   * بررسی سلامت پروکسی‌ها (background job)
   */
  async performHealthCheck() {
    logProgress('Starting proxy health check...', 'info');
    
    const failedProxies = Array.from(this.failedProxies);
    let recoveredCount = 0;

    for (const proxyId of failedProxies) {
      const proxy = this.proxies.find(p => p.id === proxyId);
      if (!proxy) continue;

      try {
        // Simple connectivity test
        const isHealthy = await this.testProxyConnectivity(proxy);
        if (isHealthy) {
          const stats = this.proxyStats.get(proxy.id);
          if (stats) {
            stats.isHealthy = true;
            stats.consecutiveFailures = 0;
          }
          this.failedProxies.delete(proxy.id);
          recoveredCount++;
          logProgress(`Proxy ${proxy.id} recovered and marked as healthy`, 'success');
        }
      } catch (error) {
        logProgress(`Proxy ${proxy.id} still failing health check: ${error.message}`, 'debug');
      }
    }

    if (recoveredCount > 0) {
      logProgress(`Health check completed: ${recoveredCount} proxies recovered`, 'info');
    }
  }

  /**
   * تست ساده اتصال پروکسی
   */
  async testProxyConnectivity(proxy, timeout = 5000) {
    const axios = (await import('axios')).default;
    
    try {
      const axiosProxy = this.toAxiosProxy(proxy);
      const startTime = Date.now();

      await axios.get(this.options.testUrl || 'http://httpbin.org/ip', {
        proxy: axiosProxy,
        timeout: timeout || this.options.timeout || 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const responseTime = Date.now() - startTime;
      logProgress(`Proxy ${proxy.id} health check passed (${responseTime}ms)`, 'debug');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * شروع timer بررسی سلامت
   */
  startHealthCheckTimer() {
    setInterval(() => {
      this.performHealthCheck().catch(error => {
        logProgress(`Health check error: ${error.message}`, 'error');
      });
    }, this.options.healthCheckInterval);
    
    logProgress(`Health check timer started (interval: ${this.options.healthCheckInterval / 1000}s)`, 'info');
  }

  /**
   * دریافت آمار کلی پروکسی‌ها
   */
  getStats() {
    const healthy = this.getHealthyProxies().length;
    const total = this.proxies.length;
    const failed = this.failedProxies.size;
    
    const totalRequests = Array.from(this.proxyStats.values())
      .reduce((sum, stats) => sum + stats.totalRequests, 0);
    
    const successfulRequests = Array.from(this.proxyStats.values())
      .reduce((sum, stats) => sum + stats.successfulRequests, 0);
    
    const rateLimitedRequests = Array.from(this.proxyStats.values())
      .reduce((sum, stats) => sum + stats.rateLimitedRequests, 0);

    return {
      totalProxies: total,
      healthyProxies: healthy,
      failedProxies: failed,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) : 0,
      totalRequests,
      successfulRequests,
      rateLimitedRequests,
      currentProxy: this.proxies[this.currentIndex % this.proxies.length]?.id || null
    };
  }

  /**
   * دریافت آمار تفصیلی پروکسی‌ها
   */
  getDetailedStats() {
    const stats = {};
    
    for (const [proxyId, proxyStats] of this.proxyStats.entries()) {
      stats[proxyId] = {
        ...proxyStats,
        successRate: proxyStats.totalRequests > 0 
          ? (proxyStats.successfulRequests / proxyStats.totalRequests) 
          : 0
      };
    }
    
    return stats;
  }

  /**
   * بازنشانی آمار پروکسی‌ها
   */
  resetStats() {
    for (const proxy of this.proxies) {
      this.initProxyStats(proxy);
    }
    this.failedProxies.clear();
    logProgress('Proxy stats reset', 'info');
  }

  /**
   * آیا پروکسی فعال است؟
   */
  isEnabled() {
    return this.enabled && this.proxies.length > 0;
  }

  /**
   * دریافت تعداد پروکسی‌های سالم
   */
  getHealthyProxyCount() {
    return this.getHealthyProxies().length;
  }

  /**
   * Should proxies be used right now?
   */
  canUseProxy() {
    if (!this.enabled || this.proxies.length === 0) {
      return false;
    }

    if (Date.now() < this.disabledUntil) {
      return false;
    }

    return this.getHealthyProxyCount() >= this.options.minHealthyProxies;
  }

  /**
   * Track rolling window failures and temporarily disable proxy usage.
   */
  trackFailureWindow() {
    const now = Date.now();
    if (now - this.failureWindow.startedAt > this.options.failureWindowMs) {
      this.failureWindow.startedAt = now;
      this.failureWindow.count = 0;
    }

    this.failureWindow.count += 1;

    if (this.failureWindow.count >= this.options.disableAfterFailures) {
      this.disabledUntil = now + this.options.cooldownMs;
      this.failureWindow.count = 0;
      this.failureWindow.startedAt = now;
      logProgress(
        `Proxy usage disabled for ${Math.round(this.options.cooldownMs / 1000)}s after repeated failures`,
        'warning'
      );
    }
  }

  /**
   * Ensure the proxy list is healthy and refreshed with new proxies if needed.
   */
  async refreshProxyPool() {
    if (!this.enabled) {
      return { refreshed: false, reason: 'disabled' };
    }

    if (this._refreshInFlight) {
      return this._refreshInFlight;
    }

    this._refreshInFlight = (async () => {
      if (this.proxies.length === 0) {
        this.loadProxies();
      }

      if (this.proxies.length === 0) {
        return { refreshed: false, reason: 'no-proxies' };
      }

      logProgress('Checking proxy connectivity before scraping...', 'info');
      const healthy = [];
      const failed = [];

      for (const proxy of this.proxies) {
        const ok = await this.testProxyConnectivity(proxy, this.options.timeout || 5000);
        if (ok) {
          healthy.push(proxy);
        } else {
          failed.push(proxy);
        }
      }

      if (failed.length > 0) {
        logProgress(`Removing ${failed.length} failed proxies from list`, 'warning');
      }

      this.proxies = healthy;
      this.proxyStats.clear();
      this.failedProxies.clear();
      this.currentIndex = 0;
      for (const proxy of this.proxies) {
        this.initProxyStats(proxy);
      }

      this.writeProxyList();

      const needsNewProxies = failed.length > 0 || this.getHealthyProxyCount() < this.options.minHealthyProxies;
      if (!needsNewProxies) {
        return { refreshed: true, added: 0, removed: failed.length };
      }

      const newProxies = await this.fetchGeonixProxies();
      if (newProxies.length === 0) {
        logProgress('No new proxies found from Geonix source.', 'warning');
        return { refreshed: true, added: 0, removed: failed.length };
      }

      const existingIds = new Set(this.proxies.map(proxy => proxy.id));
      const uniqueNew = newProxies.filter(proxy => !existingIds.has(proxy.id));

      if (uniqueNew.length > 0) {
        for (const proxy of uniqueNew) {
          this.proxies.push(proxy);
          this.initProxyStats(proxy);
        }
        this.writeProxyList();
        logProgress(`Added ${uniqueNew.length} new proxies from Geonix`, 'success');
      }

      return { refreshed: true, added: uniqueNew.length, removed: failed.length };
    })();

    try {
      return await this._refreshInFlight;
    } finally {
      this._refreshInFlight = null;
    }
  }

  /**
   * Fetch new proxies from Geonix (Iran list) with optional protocol mapping.
   */
  async fetchGeonixProxies() {
    const axios = (await import('axios')).default;
    const proxies = [];

    try {
      const listResponse = await axios.get(this.options.sourceListUrl, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: this.options.timeout || 10000
      });

      if (typeof listResponse.data === 'string') {
        const lines = listResponse.data
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean);

        for (const line of lines) {
          const parsed = this.parseProxyLine(line);
          if (!parsed) continue;
          if (!parsed.protocol) {
            parsed.protocol = 'http';
            parsed.id = `http://${parsed.host}:${parsed.port}`;
          }
          proxies.push(parsed);
        }

        return proxies;
      }

      const list = Array.isArray(listResponse.data) ? listResponse.data : [];
      if (list.length === 0) {
        return [];
      }

      const proxyTypeMap = await this.fetchGeonixProxyTypes();
      const hasTypeMap = proxyTypeMap.size > 0;

      for (const entry of list) {
        if (!entry?.ip) continue;
        const line = entry.ip.trim();
        const parsed = this.parseProxyLine(line);
        if (!parsed) continue;

        const type = proxyTypeMap.get(parsed.host);
        if (hasTypeMap && !type) {
          continue;
        }

        if (type) {
          parsed.protocol = type;
          parsed.id = `${type}://${parsed.host}:${parsed.port}`;
        } else if (!parsed.protocol) {
          parsed.protocol = 'http';
          parsed.id = `http://${parsed.host}:${parsed.port}`;
        }

        proxies.push(parsed);
      }
    } catch (error) {
      logProgress(`Failed to fetch Geonix proxies: ${error.message}`, 'error');
    }

    return proxies;
  }

  async fetchGeonixProxyTypes() {
    const axios = (await import('axios')).default;
    const proxyTypeMap = new Map();

    try {
      const response = await axios.get(this.options.sourceTypeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: this.options.timeout || 10000
      });

      const list = Array.isArray(response.data) ? response.data : [];
      const countryLabel = (this.options.sourceCountryLabel || '').toLowerCase();

      for (const entry of list) {
        if (!entry?.ip || !entry?.proxyType || !entry?.country) continue;
        if (entry.country.toLowerCase() !== countryLabel) continue;

        const type = entry.proxyType.toLowerCase();
        if (type === 'http' || type === 'https') {
          proxyTypeMap.set(entry.ip.trim(), type);
        }
      }
    } catch (error) {
      logProgress(`Failed to fetch Geonix proxy types: ${error.message}`, 'warning');
    }

    return proxyTypeMap;
  }

  getProxyListPath() {
    return this.options.listFile
      ? path.resolve(this.options.listFile)
      : path.join(__dirname, 'ProxyList.txt');
  }

  writeProxyList() {
    const proxyListPath = this.getProxyListPath();
    const lines = this.proxies.map(proxy => this.formatProxyLine(proxy));
    fs.writeFileSync(proxyListPath, lines.join('\n') + '\n', 'utf-8');
  }

  formatProxyLine(proxy) {
    const authSegment = proxy.auth
      ? `${encodeURIComponent(proxy.auth.username)}:${encodeURIComponent(proxy.auth.password)}@`
      : '';
    const protocol = proxy.protocol ? `${proxy.protocol}://` : '';
    return `${protocol}${authSegment}${proxy.host}:${proxy.port}`;
  }
}
