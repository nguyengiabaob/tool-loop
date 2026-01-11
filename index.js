const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const fs = require("fs");

// Required for Vercel/Production
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

async function scrapeShorts(channelUrl) {
  if (!channelUrl) throw new Error("Channel URL is required");
  if (!channelUrl.includes("/shorts")) {
    channelUrl = channelUrl.endsWith("/")
      ? `${channelUrl}shorts`
      : `${channelUrl}/shorts`;
  }

  const isProduction =
    process.env.NODE_ENV === "production" || process.env.VERCEL;
  console.log(
    `Starting scrape for: ${channelUrl} (Mode: ${
      isProduction ? "Puppeteer/Vercel" : "Selenium/Local"
    })`
  );

  if (isProduction) {
    return await scrapeWithPuppeteer(channelUrl);
  } else {
    return await scrapeWithSelenium(channelUrl);
  }
}

// --- Puppeteer Implementation (For Vercel) ---
async function scrapeWithPuppeteer(url) {
  if (!chromium || !puppeteer) throw new Error("Missing Vercel dependencies");

  // Setup browser
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    // Handle consent
    // Handle consent
    try {
      await page.evaluate(() => {
        const buttons = document.evaluate(
          '//button[contains(.,"Reject all") or contains(.,"Accept all")]',
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        if (buttons.snapshotLength > 0) {
          buttons.snapshotItem(0).click();
        }
      });
    } catch (e) {}

    let lastHeight = await page.evaluate(
      "document.documentElement.scrollHeight"
    );
    let unchangedCount = 0;
    let videoData = new Map();

    // Limit loop for lambda timeout safety (max 20s scrolling)
    const startTime = Date.now();

    while (Date.now() - startTime < 20000) {
      // Extract
      const videos = await page.evaluate(() => {
        const anchors = Array.from(
          document.querySelectorAll('a[href*="/shorts/"]')
        );
        return anchors.map((a) => {
          let title = a.title || a.getAttribute("aria-label");
          if (!title) {
            const tEl = a.querySelector("#video-title");
            if (tEl) title = tEl.innerText;
          }
          return { url: a.href, title: title || "Unknown" };
        });
      });

      videos.forEach((v) => {
        if (v.url.includes("/shorts/")) videoData.set(v.url, v);
      });

      // Scroll
      await page.evaluate(
        "window.scrollTo(0, document.documentElement.scrollHeight)"
      );
      await new Promise((r) => setTimeout(r, 1500));

      let newHeight = await page.evaluate(
        "document.documentElement.scrollHeight"
      );
      if (newHeight === lastHeight) {
        unchangedCount++;
        if (unchangedCount > 2) break;
      } else {
        unchangedCount = 0;
        lastHeight = newHeight;
      }
    }

    return Array.from(videoData.values());
  } finally {
    await browser.close();
  }
}

// --- Selenium Implementation (For Local) ---
async function scrapeWithSelenium(url) {
  let options = new chrome.Options();
  // options.addArguments('--headless=new'); // uncomment for headless local

  let driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  try {
    await driver.get(url);

    // Consent
    try {
      const btn = await driver.wait(
        until.elementLocated(
          By.xpath(
            '//button[contains(.,"Reject all") or contains(.,"Accept all")]'
          )
        ),
        3000
      );
      await btn.click();
    } catch (e) {}

    let lastHeight = await driver.executeScript(
      "return document.documentElement.scrollHeight"
    );
    let videoData = new Map();
    let unchangedCount = 0;

    while (true) {
      let anchors = await driver.findElements(By.css('a[href*="/shorts/"]'));
      for (let a of anchors) {
        try {
          let href = await a.getAttribute("href");
          if (href && !videoData.has(href)) {
            let title =
              (await a.getAttribute("title")) ||
              (await a.getAttribute("aria-label"));
            if (!title) {
              try {
                let p = await a.findElement(
                  By.xpath("./ancestor::ytd-rich-grid-slim-media")
                );
                let tEl = await p.findElement(By.css("#video-title"));
                title = await tEl.getText();
              } catch (e) {}
            }
            videoData.set(href, { url: href, title: title || "Unknown" });
          }
        } catch (e) {}
      }

      await driver.executeScript(
        "window.scrollTo(0, document.documentElement.scrollHeight);"
      );
      await new Promise((r) => setTimeout(r, 2000));

      let newHeight = await driver.executeScript(
        "return document.documentElement.scrollHeight"
      );
      if (newHeight === lastHeight) {
        unchangedCount++;
        if (unchangedCount > 3) break;
      } else {
        unchangedCount = 0;
        lastHeight = newHeight;
      }
    }

    return Array.from(videoData.values());
  } finally {
    await driver.quit();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  scrapeShorts(args[0]).then((res) => {
    console.log(`Scraped ${res.length} videos`);
    fs.writeFileSync("shorts.json", JSON.stringify(res, null, 2));
  });

  process.on("SIGINT", async () => {
    console.log("\nGracefully shutting down...");
    process.exit(0);
  });
}

module.exports = { scrapeShorts };
