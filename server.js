const http = require("http");
const https = require("https");
const url = require("url");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  // Parse ?url=...
  const parsed = url.parse(req.url, true);
  const target = parsed.query.url;

  // --- 1. CORS Headers ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "Content-Type, Authorization"); // Use request headers for preflight

  // --- 2. Handle Preflight ---
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // --- 3. Validate Target URL ---
  if (!target) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Missing ?url= parameter." }));
  }

  // --- 4. Proxy Request Logic ---
  let targetURL;
  try {
    targetURL = new URL(target);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Invalid target URL provided." }));
  }
  
  const lib = targetURL.protocol === "https:" ? https : http;

  // Clone all incoming headers and make necessary modifications
  const proxyHeaders = { ...req.headers };
  
  // *** CRITICAL FIX: Overwrite the Host header for the target server ***
  proxyHeaders['host'] = targetURL.host; 
  
  // Remove headers that are handled automatically or should be regenerated
  delete proxyHeaders['connection'];
  delete proxyHeaders['host']; // Already using the target URL host

  // Remove CORS-related headers sent by the client (they confuse the target)
  delete proxyHeaders['origin'];
  delete proxyHeaders['access-control-request-method'];
  delete proxyHeaders['access-control-request-headers'];

  const proxyReq = lib.request(
    targetURL,
    {
      method: req.method,
      headers: proxyHeaders, // Use the cleaned and fixed headers
    },
    (proxyRes) => {
      // --- 5. Forward Response ---
      // Forward the status code and all headers from the target API
      const responseHeaders = {
        ...proxyRes.headers,
        "Access-Control-Allow-Origin": "*", // Re-apply CORS headers
      };
      // Remove any transfer-encoding: chunked header if present
      delete responseHeaders['transfer-encoding']; 
      
      res.writeHead(proxyRes.statusCode || 200, responseHeaders);
      
      // Stream the response body from the target API back to the client
      proxyRes.pipe(res);
    }
  );
  
  // Handle errors from the proxy request itself
  proxyReq.on('error', (e) => {
      console.error('Proxy Request Error:', e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Proxy failed: ${e.message}` }));
  });

  // --- 6. Forward Request Body (Piping for robustness) ---
  // Pipe the incoming request stream directly to the proxy request stream
  req.pipe(proxyReq);

  // Note: req.pipe(proxyReq) handles both the data and the end events correctly.
});

server.listen(PORT, () => console.log("CORS proxy running on", PORT));
