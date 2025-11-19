const http = require("http");
const https = require("https");
const url = require("url");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  // Parse ?url=...
  const parsed = url.parse(req.url, true);
  const target = parsed.query.url;

  // Always send CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // If no ?url, show error
  if (!target) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Missing ?url=" }));
  }

  // Proxy request to HuggingFace
  const targetURL = new URL(target);
  const lib = targetURL.protocol === "https:" ? https : http;

  const proxyReq = lib.request(
    targetURL,
    {
      method: req.method,
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json",
        Authorization: req.headers["authorization"] || "",
      },
    },
    (proxyRes) => {
      let data = "";
      proxyRes.on("data", (chunk) => (data += chunk));
      proxyRes.on("end", () => {
        res.writeHead(proxyRes.statusCode || 200, {
          "Content-Type":
            proxyRes.headers["content-type"] || "application/json",
        });
        res.end(data);
      });
    }
  );

  // Forward POST body
  req.on("data", (chunk) => proxyReq.write(chunk));
  req.on("end", () => proxyReq.end());
});

server.listen(PORT, () => console.log("CORS proxy running on", PORT));
