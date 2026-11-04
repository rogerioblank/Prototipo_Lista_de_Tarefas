const authController = require("../controllers/authController");
const taskController = require("../controllers/taskController");
const { respond } = require("../utils/http");

async function routeApi(request, response, url) {
  const { pathname } = url;
  const { method } = request;
  const isMutation = method !== "GET" && method !== "HEAD";
  if (isMutation && request.headers.origin &&
      request.headers.origin !== `http://${request.headers.host}` &&
      request.headers.origin !== `https://${request.headers.host}`) {
    return respond(response, 403, { error: "Origem da solicitação inválida." });
  }
  if (isMutation && request.headers["content-type"]?.split(";")[0] !== "application/json") {
    return respond(response, 415, { error: "Envie os dados no formato JSON." });
  }

  if (pathname === "/api/register" && method === "POST") return authController.register(request, response);
  if (pathname === "/api/login" && method === "POST") return authController.login(request, response);
  if (pathname === "/api/me" && method === "GET") return authController.currentUser(request, response);
  if (pathname === "/api/logout" && method === "POST") return authController.logout(request, response);

  const user = authController.getUser(request);
  if (!user) return respond(response, 401, { error: "Faça login para continuar." });

  if (pathname === "/api/tasks" && method === "GET") return taskController.list(request, response, user);
  if (pathname === "/api/tasks" && method === "POST") return taskController.create(request, response, user);

  const taskRoute = /^\/api\/tasks\/([0-9a-f-]{36})$/.exec(pathname);
  if (taskRoute && method === "PATCH") {
    return taskController.updateCompletion(request, response, user, taskRoute[1]);
  }
  if (taskRoute && method === "DELETE") return taskController.remove(request, response, user, taskRoute[1]);

  return respond(response, 404, { error: "Rota não encontrada." });
}

module.exports = { routeApi };
