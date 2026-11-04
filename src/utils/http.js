function respond(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(body));
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return [];
    try {
      return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]];
    } catch {
      return [];
    }
  }));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let oversized = false;
    request.on("data", (chunk) => {
      if (oversized) return;
      body += chunk;
      if (body.length > 16_384) {
        oversized = true;
        reject(Object.assign(new Error("A solicitação excede o limite permitido."), { status: 413 }));
      }
    });
    request.on("end", () => {
      if (oversized) return;
      try {
        const parsed = body ? JSON.parse(body) : {};
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("O corpo da solicitação deve ser um objeto JSON.");
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error("O corpo da solicitação deve conter um objeto JSON válido."), { status: 400 }));
      }
    });
    request.on("error", (error) => {
      if (!oversized) reject(error);
    });
  });
}

module.exports = { respond, parseCookies, readBody };
