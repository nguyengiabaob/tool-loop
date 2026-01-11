const express = require("express");
const { scrapeShorts } = require("./index");
const path = require("path");
const app = express();
const port = 3000;

const { watchLoop } = require("./watch");

app.use(express.static("public"));
app.use(express.json());

app.post("/api/watch", async (req, res) => {
  const { videos } = req.body;
  if (!videos || !Array.isArray(videos) || videos.length === 0) {
    return res.status(400).json({ error: "Video list is required" });
  }
  const urls = videos.map((v) => (typeof v === "string" ? v : v.url));
  watchLoop(urls).catch((err) =>
    console.error("Watch loop failed async:", err)
  );
  res.json({ success: true, message: "Watch loop started" });
});

app.post("/api/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    console.log(`Received scrape request for: ${url}`);
    const results = await scrapeShorts(url);
    res.json({ success: true, count: results.length, data: results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to scrape", details: error.message });
  }
});

// Export for Vercel
module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}
