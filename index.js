const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const fs = require("fs");

// Optional: Dynamic import for local dev to avoid crashing if dependency is missing
// but since we installed it, standard require is fine.
let chromium;
try {
  chromium = require("@sparticuz/chromium");
} catch (e) {
  console.log("Not using sparticuz/chromium (likely local dev)");
}

async function scrapeShorts(channelUrl) {
  if (!channelUrl) {
    throw new Error("Please provide a channel URL");
  }

  // Ensure URL points to the shorts tab
  if (!channelUrl.includes("/shorts")) {
    channelUrl = channelUrl.endsWith("/")
      ? `${channelUrl}shorts`
      : `${channelUrl}/shorts`;
  }

  console.log(`Starting scrape for: ${channelUrl}`);

  let driver;
  try {
    let options = new chrome.Options();

    // Check environment
    const isProduction =
      process.env.NODE_ENV === "production" || process.env.VERCEL;

    let serviceBuilder;

    if (isProduction && chromium) {
      console.log("Configuring for Vercel/Lambda environment...");
      options.setChromeBinaryPath(await chromium.executablePath());
      options.addArguments(...chromium.args);
      options.addArguments("--headless=new");
      options.addArguments("--disable-gpu");
      options.addArguments("--disable-dev-shm-usage");
      options.addArguments("--no-sandbox");

      // Critical: Set the chromedriver service path explicitly
      try {
        const chromedriverPath = require("chromedriver").path;
        serviceBuilder = new chrome.ServiceBuilder(chromedriverPath);
        console.log(`Using ChromeDriver at: ${chromedriverPath}`);
      } catch (e) {
        console.error("Could not find chromedriver via 'require'", e);
      }
    } else {
      // Local dev: might want visible window or standard headless
      // options.addArguments('--headless=new'); // Uncomment if you want headless locally too
    }

    let builder = new Builder().forBrowser("chrome").setChromeOptions(options);

    if (serviceBuilder) {
      builder.setChromeService(serviceBuilder);
    }

    driver = await builder.build();

    // Begin navigation
    await driver.get(channelUrl);

    // Handle cookie consent if it appears (optional, varies by region)
    try {
      // specific selectors might vary; this is a generic catch for common cases
      const consentButton = await driver.wait(
        until.elementLocated(
          By.xpath(
            '//button[contains(.,"Reject all") or contains(.,"Accept all")]'
          )
        ),
        5000
      );
      if (consentButton) await consentButton.click();
    } catch (e) {
      // Ignore if no consent popup
    }

    let lastHeight = await driver.executeScript(
      "return document.documentElement.scrollHeight"
    );
    let videoData = new Set();
    let unchangedCount = 0;

    while (true) {
      // Collect videos currently visible using a more generic approach
      let anchors = await driver.findElements(By.css('a[href*="/shorts/"]'));

      for (let anchor of anchors) {
        try {
          let href = await anchor.getAttribute("href");
          // Avoid duplicates and non-video links (e.g. hashtags if any)
          if (href && href.includes("/shorts/")) {
            // Try to find title
            let title = "Unknown";
            try {
              // Strategy 1: Look for #video-title in the same container
              // Navigate up to find a container
              let container = await anchor.findElement(
                By.xpath(
                  "./ancestor::ytd-rich-grid-slim-media | ./ancestor::ytd-reel-item-renderer | ./ancestor::ytd-rich-item-renderer"
                )
              );
              let titleEl = await container.findElement(
                By.css("#video-title, #video-title-link")
              );
              title = await titleEl.getText();
            } catch (e) {
              // Strategy 2: Check aria-label or title attribute on the anchor or img
              title =
                (await anchor.getAttribute("title")) ||
                (await anchor.getAttribute("aria-label"));
              if (!title) {
                let img = await anchor.findElement(By.css("img"));
                title = await img.getAttribute("alt");
              }
            }

            // Store unique entry keyed by URL to avoid duplicates in Set
            // We use a Map logic or just store stringified obj if we handle uniqueness manually
            // But here videoData is a Set of strings.
            // Let's check uniqueness of URL only.
            const exists = Array.from(videoData).some(
              (j) => JSON.parse(j).url === href
            );
            if (!exists) {
              videoData.add(
                JSON.stringify({ url: href, title: title || "No Title" })
              );
            }
          }
        } catch (err) {
          // unexpected element state, skip
        }
      }
      console.log(`Collected ${videoData.size} unique videos so far...`);

      // Scroll down
      await driver.executeScript(
        "window.scrollTo(0, document.documentElement.scrollHeight);"
      );

      // Wait for load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      let newHeight = await driver.executeScript(
        "return document.documentElement.scrollHeight"
      );

      if (newHeight === lastHeight) {
        unchangedCount++;
        if (unchangedCount > 3) {
          console.log("Reached end of page or no new content loading.");
          break;
        }
      } else {
        unchangedCount = 0;
        lastHeight = newHeight;
      }
    }

    if (videoData.size === 0) {
      console.log("No videos found. Dumping page source to debug.html");
      const html = await driver.getPageSource();
      fs.writeFileSync("debug.html", html);
    }

    const results = Array.from(videoData).map((item) => JSON.parse(item));
    fs.writeFileSync("shorts.json", JSON.stringify(results, null, 2));
    console.log(`Successfully saved ${results.length} videos to shorts.json`);
    return results;
  } catch (error) {
    console.error("An error occurred:", error);
    if (driver) {
      const html = await driver.getPageSource();
      fs.writeFileSync("error_debug.html", html);
    }
    throw error;
  } finally {
    if (driver) await driver.quit();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  scrapeShorts(args[0]);

  process.on("SIGINT", async () => {
    console.log("\nGracefully shutting down...");
    process.exit(0);
  });
}

module.exports = { scrapeShorts };
