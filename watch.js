const { Builder, By, Key, until } = require("selenium-webdriver");

async function watchLoop(videoUrls) {
  if (!videoUrls || videoUrls.length === 0) {
    console.log("No videos to watch.");
    return;
  }

  let driver = await new Builder().forBrowser("chrome").build();
  console.log("Starting Auto Watch Loop...");

  try {
    //
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

      // 5. Calculate next index (Ping-Pong / Reverse Logic)
      if (videoUrls.length > 1) {
        index += direction;

        if (index >= videoUrls.length) {
          index = videoUrls.length - 2;
          direction = -1;
          console.log("Reached end. Reversing direction -> Backward");
        } else if (index < 0) {
          index = 1;
          direction = 1;
          console.log("Reached start. Reversing direction -> Forward");
        }
      } else {
        // If only 1 video, just loop it?
        // The loop automatically re-runs execute logic, effectively looping it.
      }
    }
  } catch (error) {
    console.error("Watch loop error:", error);
  } finally {
    await driver.quit();
  }
}

module.exports = { watchLoop };
