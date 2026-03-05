import CDP from 'chrome-remote-interface';

const CDP_HOST = process.env.CDP_HOST || 'localhost';
const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);
const CONSOLE_BUFFER_SIZE = 200;
const NETWORK_BUFFER_SIZE = 100;

class CDPClient {
  constructor() {
    this.client = null;
    this.connectedTab = null;
    this.consoleLogs = [];
    this.networkRequests = [];
  }

  /**
   * List all inspectable tabs on the remote Chrome instance
   */
  async listTabs() {
    const targets = await CDP.List({ host: CDP_HOST, port: CDP_PORT });
    return targets
      .filter((t) => t.type === 'page')
      .map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        webSocketDebuggerUrl: t.webSocketDebuggerUrl,
      }));
  }

  /**
   * Connect to a tab. If no tabId is given, auto-detect the PWA tab.
   */
  async connect(tabId) {
    if (this.client) {
      await this.disconnect();
    }

    const tabs = await this.listTabs();
    let target;

    if (tabId) {
      target = tabs.find((t) => t.id === tabId);
      if (!target) throw new Error(`Tab ${tabId} not found. Available: ${tabs.map((t) => t.id).join(', ')}`);
    } else {
      // Auto-detect: look for manholes-mapper or localhost:5173
      target = tabs.find(
        (t) =>
          t.url.includes('localhost:5173') ||
          t.url.includes('manhole') ||
          t.url.includes('127.0.0.1:5173')
      );
      if (!target) {
        const available = tabs.map((t) => `  ${t.id}: ${t.url} — ${t.title}`).join('\n');
        throw new Error(`Could not auto-detect PWA tab. Available tabs:\n${available}`);
      }
    }

    this.client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });
    this.connectedTab = { id: target.id, title: target.title, url: target.url };

    // Enable domains
    await this.client.Runtime.enable();
    await this.client.Console.enable();
    await this.client.Log.enable();
    await this.client.Network.enable();
    await this.client.Page.enable();

    // Buffer console messages
    this.consoleLogs = [];
    this.client.Console.messageAdded(({ message }) => {
      this.consoleLogs.push({
        level: message.level,
        text: message.text,
        source: message.source,
        url: message.url,
        line: message.line,
        timestamp: Date.now(),
      });
      if (this.consoleLogs.length > CONSOLE_BUFFER_SIZE) {
        this.consoleLogs.shift();
      }
    });

    // Also capture Runtime.consoleAPICalled for console.log/warn/error/debug
    this.client.Runtime.consoleAPICalled(({ type, args, timestamp }) => {
      const text = args.map((a) => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
      this.consoleLogs.push({
        level: type,
        text,
        source: 'console-api',
        timestamp: Math.floor(timestamp),
      });
      if (this.consoleLogs.length > CONSOLE_BUFFER_SIZE) {
        this.consoleLogs.shift();
      }
    });

    // Buffer network requests
    this.networkRequests = [];
    const pendingRequests = new Map();

    this.client.Network.requestWillBeSent(({ requestId, request, timestamp }) => {
      pendingRequests.set(requestId, {
        url: request.url,
        method: request.method,
        timestamp: Math.floor(timestamp * 1000),
      });
    });

    this.client.Network.responseReceived(({ requestId, response }) => {
      const req = pendingRequests.get(requestId);
      if (req) {
        pendingRequests.delete(requestId);
        this.networkRequests.push({
          ...req,
          status: response.status,
          statusText: response.statusText,
          mimeType: response.mimeType,
        });
        if (this.networkRequests.length > NETWORK_BUFFER_SIZE) {
          this.networkRequests.shift();
        }
      }
    });

    return this.connectedTab;
  }

  /**
   * Evaluate JavaScript in the page context
   */
  async evaluate(expression, returnByValue = true) {
    this._ensureConnected();
    const result = await this.client.Runtime.evaluate({
      expression,
      returnByValue,
      awaitPromise: true,
      generatePreview: true,
    });
    if (result.exceptionDetails) {
      const err = result.exceptionDetails;
      throw new Error(
        `JS evaluation error: ${err.text || ''} ${err.exception?.description || ''}`
      );
    }
    return returnByValue ? result.result.value : result.result;
  }

  /**
   * Get buffered console logs
   */
  getConsoleLogs(count, level) {
    let logs = this.consoleLogs;
    if (level) {
      logs = logs.filter((l) => l.level === level);
    }
    if (count) {
      logs = logs.slice(-count);
    }
    return logs;
  }

  /**
   * Take a screenshot
   */
  async screenshot(format = 'png', quality) {
    this._ensureConnected();
    const params = { format };
    if (format === 'jpeg' && quality !== undefined) {
      params.quality = quality;
    }
    const { data } = await this.client.Page.captureScreenshot(params);
    return data;
  }

  /**
   * Get buffered network requests
   */
  getNetworkLog(count, urlFilter) {
    let reqs = this.networkRequests;
    if (urlFilter) {
      reqs = reqs.filter((r) => r.url.includes(urlFilter));
    }
    if (count) {
      reqs = reqs.slice(-count);
    }
    return reqs;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.client !== null;
  }

  /**
   * Disconnect from the current tab
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore close errors
      }
      this.client = null;
      this.connectedTab = null;
    }
  }

  _ensureConnected() {
    if (!this.client) {
      throw new Error(
        'Not connected to any tab. Use cdp_connect first, or ensure ADB forwarding is set up:\n' +
          '  adb forward tcp:9222 localabstract:chrome_devtools_remote'
      );
    }
  }
}

// Singleton
export const cdpClient = new CDPClient();
