const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { applyEdits, modify, parse } = require("jsonc-parser");

// Configura a porta, os arquivos de dados e os valores aproximados por serviço.
const PORT = Number(process.env.API_PORT) || 3001;
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.jsonc");
const REQUESTS_FILE = path.join(DATA_DIR, "requests.jsonc");
const sessions = new Map();
const estimateRanges = {
  Plumber: "R$ 120 - R$ 280",
  Electrician: "R$ 130 - R$ 320",
  Painter: "R$ 250 - R$ 900",
  "Furniture assembler": "R$ 100 - R$ 250",
};

// Restringe chamadas do navegador ao próprio computador durante o desenvolvimento.
const allowedOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Cria a pasta e modelos JSONC comentados apenas se os arquivos ainda não existirem.
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, `{
  // Cada item representa uma conta. A senha nunca é armazenada em texto puro.
  // email identifica a conta; salt e passwordHash verificam a senha; createdAt registra a criação.
  "users": []
}\n`, "utf8");
}
if (!fs.existsSync(REQUESTS_FILE)) {
  fs.writeFileSync(REQUESTS_FILE, `{
  // Cada item representa um pedido associado ao e-mail de quem o criou.
  // id e createdAt identificam o registro; os demais campos descrevem contato, serviço e agenda.
  "requests": []
}\n`, "utf8");
}

// Lê uma coleção JSONC e acusa problemas de formato sem esconder nem apagar os dados.
function readJson(file, collectionName) {
  const parseErrors = [];
  const source = fs.readFileSync(file, "utf8");
  const document = parse(source, parseErrors);
  const collection = document?.[collectionName];
  if (parseErrors.length || !Array.isArray(collection)) {
    throw new Error(`The data file ${path.basename(file)} must contain a valid JSONC list.`);
  }
  return collection;
}

// Atualiza somente a lista pedida, preservando os comentários de documentação do arquivo.
function writeJson(file, collectionName, value) {
  const source = fs.readFileSync(file, "utf8");
  const edits = modify(source, [collectionName], value, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  fs.writeFileSync(file, applyEdits(source, edits), "utf8");
}

// Padroniza respostas da API e impede que respostas pessoais sejam armazenadas em cache.
function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

// Lê e converte o corpo JSON, limitando seu tamanho a um megabyte.
function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body exceeds the allowed size."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Request body is not valid JSON.")); }
    });
    request.on("error", reject);
  });
}

// Encontra a conta associada ao token temporário enviado pelo navegador.
function getSession(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const email = token ? sessions.get(token) : null;
  return email ? { token, email } : null;
}

// Protege a senha com scrypt e um salt aleatório antes de gravá-la em disco.
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, passwordHash: hash };
}

// Compara hashes em tempo constante para reduzir vazamento por temporização.
function passwordMatches(password, user) {
  const candidate = Buffer.from(hashPassword(password, user.salt).passwordHash, "hex");
  const stored = Buffer.from(user.passwordHash, "hex");
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

// Cria uma sessão aleatória mantida em memória enquanto o servidor está ligado.
function createSession(email) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, email);
  return token;
}

// Faz uma validação básica de formato e tamanho antes de gravar uma conta.
function validateEmail(email) {
  return typeof email === "string" && email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Roteia verificações, autenticação, encerramento de sessão e pedidos residenciais.
const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (allowedOrigin.test(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    // Permite confirmar rapidamente que o processo local está ativo.
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    // Cria uma conta ou valida a senha de uma conta existente.
    if ((request.method === "POST" && ["/api/register", "/api/login"].includes(url.pathname))) {
      const body = await readBody(request);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = body.password;
      if (!validateEmail(email)) return sendJson(response, 400, { error: "Enter a valid email address." });
      if (typeof password !== "string" || password.length < 8 || password.length > 256) {
        return sendJson(response, 400, { error: "Password must be between 8 and 256 characters." });
      }

      const users = readJson(USERS_FILE, "users");
      const existingUser = users.find((user) => user.email === email);
      if (url.pathname === "/api/register") {
        if (existingUser) return sendJson(response, 409, { error: "An account with this email already exists. Sign in or use another address." });
        const credentials = hashPassword(password);
        users.push({ email, ...credentials, createdAt: new Date().toISOString() });
        writeJson(USERS_FILE, "users", users);
      } else if (!existingUser || !passwordMatches(password, existingUser)) {
        return sendJson(response, 401, { error: "Incorrect email or password." });
      }

      return sendJson(response, 200, { token: createSession(email), email });
    }

    // Informa qual conta está associada à sessão atual.
    if (request.method === "GET" && url.pathname === "/api/me") {
      const session = getSession(request);
      return session ? sendJson(response, 200, { email: session.email }) : sendJson(response, 401, { error: "Session expired. Please sign in again." });
    }

    // Remove o token da memória para encerrar a sessão no servidor.
    if (request.method === "POST" && url.pathname === "/api/logout") {
      const session = getSession(request);
      if (session) sessions.delete(session.token);
      return sendJson(response, 200, { ok: true });
    }

    // Permite consultar e gravar apenas pedidos da conta autenticada.
    if (url.pathname === "/api/requests") {
      const session = getSession(request);
      if (!session) return sendJson(response, 401, { error: "Sign in to view your requests." });
      const requests = readJson(REQUESTS_FILE, "requests");
      if (request.method === "GET") {
        return sendJson(response, 200, { requests: requests.filter((item) => item.email === session.email).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
      }
      if (request.method === "POST") {
        const body = await readBody(request);
        const required = ["service", "phone", "description", "address", "date", "time"];
        if (required.some((key) => typeof body[key] !== "string" || !body[key].trim())) {
          return sendJson(response, 400, { error: "Complete all fields before submitting." });
        }
        const item = {
          id: crypto.randomUUID(),
          email: session.email,
          service: body.service.slice(0, 80),
          phone: body.phone.slice(0, 25),
          description: body.description.slice(0, 1200),
          address: body.address.slice(0, 240),
          date: body.date.slice(0, 10),
          time: body.time.slice(0, 5),
          estimatedPrice: estimateRanges[body.service] || "Price available on request",
          createdAt: new Date().toISOString(),
        };
        requests.push(item);
        writeJson(REQUESTS_FILE, "requests", requests);
        return sendJson(response, 201, { request: item });
      }
    }

    return sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    // Devolve erros de validação e leitura sem encerrar o processo local.
    if (!response.headersSent) sendJson(response, 400, { error: error.message || "The request could not be processed." });
  }
});

// Expõe a API somente no loopback da máquina de desenvolvimento.
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Local API ready at http://localhost:${PORT}`);
  console.log("Open index.html with Live Server (Go Live) to use the app.");
});