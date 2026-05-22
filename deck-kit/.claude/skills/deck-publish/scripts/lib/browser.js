/**
 * Shared browser launch and page loading logic for HTML converters.
 * Resolves Puppeteer via standard Node module resolution, so it picks up
 * either the skill-local install (npm install inside the skill dir) or
 * any npm-linked copy. Chrome path defaults per-platform; override with
 * CHROME_PATH env var.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const url = require('url');

const CHROME_PATH = process.env.CHROME_PATH
  || (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/google-chrome-stable');

/**
 * Launch a headless Chrome browser instance.
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--allow-file-access-from-files',
      '--disable-web-security',
    ],
  });
}

/**
 * Load an HTML file into a new browser page.
 * @param {import('puppeteer').Browser} browser
 * @param {string} htmlPath - Absolute path to the HTML file
 * @param {object} [options]
 * @param {number} [options.wait=0] - Extra ms to wait after load
 * @param {boolean} [options.waitForFonts=false] - Wait for document.fonts.ready
 * @param {string} [options.waitForSelector] - CSS selector to wait for
 * @param {number} [options.timeout=30000] - Navigation timeout in ms
 * @param {number} [options.viewportWidth=1280] - Viewport width
 * @param {number} [options.viewportHeight=720] - Viewport height
 * @param {number} [options.deviceScaleFactor=1] - Device scale factor
 * @returns {Promise<import('puppeteer').Page>}
 */
async function loadPage(browser, htmlPath, options = {}) {
  const {
    wait = 0,
    waitForFonts = false,
    waitForSelector,
    timeout = 30000,
    viewportWidth = 1280,
    viewportHeight = 720,
    deviceScaleFactor = 1,
  } = options;

  const page = await browser.newPage();

  await page.setViewport({
    width: viewportWidth,
    height: viewportHeight,
    deviceScaleFactor,
  });

  const absolutePath = path.resolve(htmlPath);
  const fileUrl = url.pathToFileURL(absolutePath).href;

  await page.goto(fileUrl, {
    waitUntil: 'networkidle0',
    timeout,
  });

  if (waitForFonts) {
    await page.evaluate(() => document.fonts.ready);
  }

  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout });
  }

  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  return page;
}

module.exports = { launchBrowser, loadPage };
