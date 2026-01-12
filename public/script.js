document.getElementById("scrapeBtn").addEventListener("click", async () => {
  const urlInput = document.getElementById("urlInput");
  const statusDiv = document.getElementById("status");
  const resultsDiv = document.getElementById("results");
  const videoList = document.getElementById("videoList");
  const countSpan = document.getElementById("count");
  const url = urlInput.value.trim();

  if (!url) {
    alert("Please enter a URL");
    return;
  }

  // Reset UI
  resultsDiv.classList.add("hidden");
  videoList.innerHTML = "";
  statusDiv.classList.remove("hidden");
  statusDiv.innerHTML =
    '<div class="loader"></div> Scraping... This may take a while.';
  document.getElementById("scrapeBtn").disabled = true;

  try {
    const response = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const result = await response.json();

    if (result.success) {
      statusDiv.innerHTML = "✅ Scrape Complete!";
      countSpan.textContent = result.count;

      result.data.forEach((video) => {
        const li = document.createElement("li");
        li.innerHTML = `
                    <a href="${video.url}" target="_blank">${video.title}</a>
                    <span class="url-text">${video.url}</span>
                `;
        videoList.appendChild(li);
      });

      resultsDiv.classList.remove("hidden");

      document.getElementById("downloadBtn").onclick = () => {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "shorts.json";
        a.click();
      };

      document.getElementById("watchBtn").onclick = async () => {
        // Optimistic check: simplified prompt
        const confirmMsg =
          "This attempts to start a Watch Loop.\n\n" +
          "• Localhost: Opens a Chrome window on your machine controlled by Selenium.\n" +
          "• Vercel/Cloud: Will create a Playlist in a new tab (Client-side).\n\n" +
          "Continue?";

        if (confirm(confirmMsg)) {
          try {
            const wRes = await fetch("/api/watch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ videos: result.data }),
            });
            const wJson = await wRes.json();

            if (wJson.success) {
              alert("Watch loop started on host machine successfully!");
            } else if (wJson.code === "NO_SERVER_DISPLAY") {
              // Fallback to Playlist (Client-side)
              const videoIds = result.data
                .map((v) => {
                  const url = v.url || v;
                  const match = url.match(/\/shorts\/([^/?]+)/);
                  return match ? match[1] : null;
                })
                .filter((id) => id);

              if (videoIds.length > 0) {
                // Use Embed URL to force looping
                // Format: https://www.youtube.com/embed/{FIRST_ID}?playlist={ALL_IDS}&loop=1&autoplay=1
                const firstId = videoIds[0];
                const playlistIds = videoIds.join(",");
                const playlistUrl = `https://www.youtube.com/embed/${firstId}?playlist=${playlistIds}&loop=1&autoplay=1`;

                window.open(playlistUrl, "_blank");
                alert(
                  "Opened a looped Playlist (Vercel mode).\nNote: This uses the Embed player to support auto-looping."
                );
              } else {
                alert("Could not extract video IDs for playlist.");
              }
            } else {
              alert("Failed to start: " + wJson.error);
            }
          } catch (e) {
            alert("Error: " + e.message);
          }
        }
      };
    } else {
      statusDiv.innerHTML = `❌ Error: ${result.error || "Unknown error"}`;
    }
  } catch (e) {
    statusDiv.innerHTML = `❌ Network Error: ${e.message}`;
  } finally {
    document.getElementById("scrapeBtn").disabled = false;
  }
});
