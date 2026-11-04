const http = require("node:http");
const { routeApi } = require("./src/routes/apiRoutes");
const { serveStatic } = require("./src/views/staticController");
const { DB_PATH } = require("./src/config/database");
const { respond } = require("./src/utils/http");

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    try {
      await routeApi(request, response, url);
    } catch (error) {
      if (response.headersSent) return response.destroy(error);
      console.error("Erro ao processar solicitação:", error);
      respond(response, error.status || 500, {
        error: error.status ? error.message : "Não foi possível concluir a solicitação."
      });
    }
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Método não permitido.");
    return;
  }
  serveStatic(request, response, url);
});

server.listen(PORT, () => {
  console.log(`Meu dia disponível em http://localhost:${PORT}`);
  console.log(`Banco SQLite: ${DB_PATH}`);
});

module.exports = server;
