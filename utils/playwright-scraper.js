const { chromium } = require('playwright');
const cheerio = require('cheerio');

let browserInstance = null;
let lastUsed = Date.now();
const BROWSER_TIMEOUT = 5 * 60 * 1000;
let browserCheckInterval = null;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:133.0) Gecko/20100101 Firefox/133.0'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomDelay(min = 1000, max = 3000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function getBrowser() {
    if (browserInstance && browserInstance.isConnected()) {
        lastUsed = Date.now();
        return browserInstance;
    }

    console.log('🚀 Launching Playwright with Stealth Mode...');
    
    const launchOptions = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1920,1080',
            '--start-maximized',
            '--disable-extensions',
            '--disable-plugins-discovery',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--force-color-profile=srgb',
            '--metrics-recording-only',
            '--no-default-browser-check',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-domain-reliability',
            '--disable-component-update',
            '--disable-sync',
            '--disable-default-apps'
        ]
    };
    
    if (process.env.CHROMIUM_PATH) {
        launchOptions.executablePath = process.env.CHROMIUM_PATH;
    }
    
    browserInstance = await chromium.launch(launchOptions);

    lastUsed = Date.now();
    
    if (!browserCheckInterval) {
        browserCheckInterval = setInterval(async () => {
            if (browserInstance && Date.now() - lastUsed > BROWSER_TIMEOUT) {
                console.log('🔄 Closing idle browser...');
                await closeBrowser();
            }
        }, 60000);
    }

    return browserInstance;
}

async function closeBrowser() {
    if (browserInstance) {
        try {
            await browserInstance.close();
        } catch (e) {
            console.error('Error closing browser:', e.message);
        }
        browserInstance = null;
    }
}

async function createContext(browser) {
    const userAgent = getRandomUserAgent();
    const isFirefox = userAgent.includes('Firefox');
    
    const context = await browser.newContext({
        userAgent: userAgent,
        viewport: { width: 1920, height: 1080 },
        screen: { width: 1920, height: 1080 },
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        geolocation: { latitude: 48.8566, longitude: 2.3522 },
        permissions: ['geolocation'],
        colorScheme: 'light',
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        javaScriptEnabled: true,
        extraHTTPHeaders: {
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'max-age=0',
            'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Connection': 'keep-alive'
        },
        ignoreHTTPSErrors: true
    });

    return context;
}

async function applyStealthScripts(page) {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
            ]
        });
        
        Object.defineProperty(navigator, 'languages', { get: () => ['fr-FR', 'fr', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
        Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
        
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );

        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return 'Intel Inc.';
            if (parameter === 37446) return 'Intel Iris OpenGL Engine';
            return getParameter.call(this, parameter);
        };
        
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, attributes) {
            if (type === '2d') {
                const context = originalGetContext.call(this, type, attributes);
                return context;
            }
            return originalGetContext.call(this, type, attributes);
        };

        window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {},
            app: {}
        };

        Object.defineProperty(document, 'hidden', { get: () => false });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    });
}

async function humanLikeDelay() {
    const delay = getRandomDelay(500, 2000);
    await new Promise(r => setTimeout(r, delay));
}

async function scrapeWithPlaywright(url, options = {}) {
    const {
        waitFor = 'domcontentloaded',
        timeout = 45000,
        waitForSelector = null,
        bypassCloudflare = true
    } = options;

    let page = null;
    let context = null;
    
    try {
        const browser = await getBrowser();
        context = await createContext(browser);
        page = await context.newPage();
        
        await applyStealthScripts(page);

        await page.setExtraHTTPHeaders({
            'Referer': 'https://www.google.com/',
            'Origin': 'https://anime-sama.eu'
        });

        console.log(`🌐 [Playwright] Navigating to: ${url}`);
        
        const response = await page.goto(url, {
            waitUntil: waitFor,
            timeout: timeout
        });

        const statusCode = response ? response.status() : 0;
        console.log(`📊 [Playwright] Initial status: ${statusCode}`);

        if (statusCode === 403 || statusCode === 503) {
            console.log('🛡️ [Playwright] Cloudflare detected, waiting for challenge...');
            
            await page.waitForTimeout(5000);
            
            try {
                await page.waitForFunction(() => {
                    return !document.body.innerText.includes('Checking your browser') &&
                           !document.body.innerText.includes('Just a moment') &&
                           !document.querySelector('#challenge-running');
                }, { timeout: 15000 });
            } catch (e) {
                console.log('⏳ [Playwright] Challenge timeout, continuing...');
            }
            
            await humanLikeDelay();
        }

        if (waitForSelector) {
            await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {});
        }

        await page.waitForTimeout(getRandomDelay(1000, 2500));

        const html = await page.content();
        const finalStatus = html.length > 1000 ? 200 : statusCode;
        
        console.log(`📊 [Playwright] Final status: ${finalStatus}, HTML size: ${html.length}`);
        
        await page.close();
        await context.close();
        
        return { 
            html, 
            statusCode: finalStatus, 
            success: html.length > 1000 && !html.includes('Just a moment') && !html.includes('Checking your browser')
        };

    } catch (error) {
        console.error(`❌ [Playwright] Error for ${url}:`, error.message);
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        if (context) {
            try { await context.close(); } catch (e) {}
        }
        throw error;
    }
}

async function scrapeWithRetry(url, options = {}, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`🔄 [Playwright] Attempt ${i + 1}/${maxRetries} for ${url}`);
            
            if (i > 0) {
                await closeBrowser();
                await new Promise(r => setTimeout(r, getRandomDelay(2000, 5000)));
            }
            
            const result = await scrapeWithPlaywright(url, options);
            if (result.success) {
                return result;
            }
            lastError = new Error(`HTTP ${result.statusCode} or blocked content`);
        } catch (error) {
            lastError = error;
            console.error(`❌ [Playwright] Attempt ${i + 1} failed:`, error.message);
            
            if (i < maxRetries - 1) {
                const delay = (i + 1) * 2000 + getRandomDelay(1000, 3000);
                console.log(`⏳ [Playwright] Waiting ${delay}ms before retry...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    
    throw lastError;
}

async function scrapeToCheerio(url, options = {}) {
    try {
        const result = await scrapeWithRetry(url, options);
        if (result.success && result.html) {
            return cheerio.load(result.html);
        }
        throw new Error('Failed to get page content');
    } catch (error) {
        console.error(`❌ [Playwright] scrapeToCheerio failed for ${url}:`, error.message);
        throw error;
    }
}

async function postWithPlaywright(url, postData, options = {}) {
    const {
        timeout = 30000,
        waitFor = 'networkidle'
    } = options;

    let page = null;
    let context = null;
    
    try {
        const browser = await getBrowser();
        context = await createContext(browser);
        page = await context.newPage();
        
        await applyStealthScripts(page);

        console.log(`🌐 [Playwright POST] Sending to: ${url}`);

        let responseData = null;
        
        page.on('response', async (response) => {
            if (response.url().includes(url) || response.url().includes('fetch.php')) {
                try {
                    responseData = await response.text();
                } catch (e) {}
            }
        });

        await page.goto('https://anime-sama.eu/', {
            waitUntil: 'domcontentloaded',
            timeout: timeout
        });

        await page.waitForTimeout(getRandomDelay(2000, 4000));

        responseData = await page.evaluate(async ({ url, postData }) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: postData
            });
            return await response.text();
        }, { url, postData });

        await page.close();
        await context.close();

        return { html: responseData, success: true };

    } catch (error) {
        console.error(`❌ [Playwright POST] Error:`, error.message);
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        if (context) {
            try { await context.close(); } catch (e) {}
        }
        throw error;
    }
}

async function fetchJavaScriptFile(url, options = {}) {
    const {
        timeout = 15000,
        referer = null
    } = options;

    let page = null;
    let context = null;
    
    try {
        const browser = await getBrowser();
        context = await createContext(browser);
        page = await context.newPage();
        
        await applyStealthScripts(page);

        let jsContent = null;

        page.on('response', async (response) => {
            if (response.url() === url || response.url().includes('episodes.js')) {
                try {
                    jsContent = await response.text();
                } catch (e) {}
            }
        });

        if (referer) {
            await page.goto(referer, {
                waitUntil: 'domcontentloaded',
                timeout: timeout
            });
            await humanLikeDelay();
        }

        console.log(`🌐 [Playwright JS] Fetching: ${url}`);
        
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeout
        });

        if (!jsContent) {
            jsContent = await page.content();
            const preMatch = jsContent.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
            if (preMatch) {
                jsContent = preMatch[1];
            } else {
                jsContent = await response.text().catch(() => jsContent);
            }
        }

        await page.close();
        await context.close();

        return { content: jsContent, success: true };

    } catch (error) {
        console.error(`❌ [Playwright JS] Error fetching ${url}:`, error.message);
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        if (context) {
            try { await context.close(); } catch (e) {}
        }
        throw error;
    }
}

async function checkUrlExists(url, options = {}) {
    const { timeout = 10000 } = options;
    
    let page = null;
    let context = null;
    
    try {
        const browser = await getBrowser();
        context = await createContext(browser);
        page = await context.newPage();
        
        await applyStealthScripts(page);

        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: timeout
        });

        const statusCode = response ? response.status() : 0;
        const content = await page.content();
        
        await page.close();
        await context.close();

        const exists = statusCode === 200 && content.length > 100;
        return { exists, statusCode, contentLength: content.length };

    } catch (error) {
        if (page) {
            try { await page.close(); } catch (e) {}
        }
        if (context) {
            try { await context.close(); } catch (e) {}
        }
        return { exists: false, statusCode: 0, error: error.message };
    }
}

async function fetchMultipleUrls(urls, options = {}) {
    const results = [];
    
    for (const url of urls) {
        try {
            await humanLikeDelay();
            const result = await scrapeWithPlaywright(url, options);
            results.push({ url, ...result });
        } catch (error) {
            results.push({ url, success: false, error: error.message });
        }
    }
    
    return results;
}

async function testCloudflareBypass() {
    console.log('🧪 Testing Cloudflare bypass with Playwright Stealth...');
    
    try {
        const result = await scrapeWithPlaywright('https://anime-sama.eu/', {
            waitFor: 'domcontentloaded',
            timeout: 45000
        });
        
        if (result.success && result.html.length > 1000) {
            console.log('✅ Cloudflare bypass successful!');
            console.log(`📄 Page size: ${result.html.length} characters`);
            return true;
        } else {
            console.log('❌ Cloudflare bypass failed - page too small or blocked');
            return false;
        }
    } catch (error) {
        console.error('❌ Cloudflare bypass test failed:', error.message);
        return false;
    }
}

module.exports = {
    getBrowser,
    closeBrowser,
    scrapeWithPlaywright,
    scrapeWithRetry,
    scrapeToCheerio,
    postWithPlaywright,
    fetchJavaScriptFile,
    checkUrlExists,
    fetchMultipleUrls,
    testCloudflareBypass,
    getRandomUserAgent
};
