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
        if (
          confirm(
            "This will open a Chrome window on the server/host machine to watch these videos in a loop. Continue?"
          )
        ) {
          try {
            const wRes = await fetch("/api/watch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ videos: result.data }),
            });
            const wJson = await wRes.json();
            if (wJson.success) {
              alert("Watch loop started!");
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
