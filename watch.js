const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
require("chromedriver"); // Ensure chromedriver is picked up

async function watchLoop(videoUrls) {
  if (!videoUrls || videoUrls.length === 0) {
    console.log("No videos to watch.");
    return;
  }

  console.log("Initializing Auto Watch Loop (Selenium)...");
  let driver;

  try {
    let options = new chrome.Options();
    // Ensure we are NOT headless. Start maximized for visibility.
    options.addArguments("--start-maximized");
    // options.addArguments("--auth-server-whitelist=_"); // Sometimes helps with some issues

    driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();

    console.log("Driver initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Selenium driver:", err);
    return;
  }

  try {
    let index = 0;
    let direction = 1; // 1 for forward, -1 for backward

    while (true) {
      // Infinite loop until user kills script
      const currentUrl = videoUrls[index];
      console.log(
        `Now Watching [${index + 1}/${videoUrls.length}]: ${currentUrl}`
      );

      await driver.get(currentUrl);

      // 1. Handle Consent (if any) - simple try/catch
      try {
        const consentButton = await driver.wait(
          until.elementLocated(
            By.xpath(
              '//button[contains(.,"Reject all") or contains(.,"Accept all")]'
            )
          ),
          3000
        );
        await consentButton.click();
      } catch (e) {
        /* ignore */
      }

      // 2. Wait for video element
      try {
        let videoEl = await driver.wait(
          until.elementLocated(By.css("video")),
          10000
        );

        // 3. Attempt to play if paused (sometimes autoplay is blocked)
        await driver.executeScript("arguments[0].play()", videoEl);

        // 4. Get Duration
        let duration = await driver.wait(async () => {
          let d = await driver.executeScript(
            "return document.querySelector('video').duration"
          );
          return d && d > 0 ? d : null; // Wait until valid duration
        }, 5000);

        if (!duration) duration = 15; // Fallback default if we can't get it

        console.log(`Video duration: ${duration}s. Waiting...`);

        // Wait for the duration of the video
        await new Promise((resolve) => setTimeout(resolve, duration * 1000));
      } catch (err) {
        console.error("Error playing video, skipping...", err);
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Brief pause on error
      }

      // 5. Calculate next index (Circular Loop)
      if (videoUrls.length > 1) {
        index++;
        if (index >= videoUrls.length) {
          index = 0;
          console.log("Reached end. Restarting from beginning.");
        }
      } else {
        // If only 1 video, just loop it?
        // The loop automatically re-runs execute logic, effectively looping it.
        // Add a small pause to prevent hammering if something is broken
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error("Watch loop error:", error);
  } finally {
    if (driver) {
      console.log("Closing driver...");
      await driver.quit();
    }
  }
}

module.exports = { watchLoop };
