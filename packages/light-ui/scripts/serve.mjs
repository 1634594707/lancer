import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".map": "application/json",
};
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = resolve(root, `.${pathname === "/" ? "/demo/index.html" : pathname}`);
    if (!file.startsWith(resolve(root) + sep) || !(await stat(file)).isFile())
      throw new Error("Not found");
    response.writeHead(200, {
      "Content-Type": `${types[extname(file)] ?? "application/octet-stream"}; charset=utf-8`,
      "Cache-Control": "no-store",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(Number(process.env.PORT ?? 4178), "127.0.0.1", () =>
  console.log(`Light UI → http://127.0.0.1:${process.env.PORT ?? 4178}`),
);
