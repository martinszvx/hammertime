// Endereço da API local e catálogo em inglês com faixas de referência editáveis.
const API_URL = "http://localhost:3001/api";
const services = [
  { name: "Plumber", description: "Plumbing repairs and installations", icon: "🔧", background: "#e7eee3", color: "#315d49", estimate: "R$ 120 - R$ 280" },
  { name: "Electrician", description: "Wiring, outlets and installations", icon: "⚡", background: "#f3ecd7", color: "#85713c", estimate: "R$ 130 - R$ 320" },
  { name: "Painter", description: "Interior and exterior painting", icon: "🎨", background: "#e2edee", color: "#35666b", estimate: "R$ 250 - R$ 900" },
  { name: "Furniture assembler", description: "Furniture assembly and adjustments", icon: "🪑", background: "#efe4dc", color: "#815c42", estimate: "R$ 100 - R$ 250" },
];

// Converte categorias antigas para inglês ao exibir pedidos já salvos.
const legacyServiceNames = {
  "Encanador": "Plumber",
  "Eletricista": "Electrician",
  "Pintor": "Painter",
  "Montador de móveis": "Furniture assembler",
  "Outro": "Other",
};

// Guarda referências aos elementos que recebem atualizações e ao estado da sessão.
const gate = document.querySelector("#gate-screen");
const workspace = document.querySelector("#workspace");
const authForm = document.querySelector("#auth-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const passwordToggle = document.querySelector("#password-toggle");
const passwordEyeSlash = document.querySelector("#password-eye-slash");
const formError = document.querySelector("#form-error");
const submitButton = document.querySelector("#auth-submit");
const submitLabel = document.querySelector("#submit-label");
const modeToggle = document.querySelector("#mode-toggle");
const toast = document.querySelector("#toast");
const dialog = document.querySelector("#info-dialog");
let creatingAccount = false;
let currentEmail = "";
let sessionToken = localStorage.getItem("hammer-session") || "";
let toastTimeout;

// Exibe mensagens de validação junto ao controle que originou o erro.
function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

// Esconde mensagens de validação depois que o usuário altera o formulário.
function clearError(element) {
  element.textContent = "";
  element.hidden = true;
}

// Alterna a senha entre texto legível e o modo protegido do campo password.
function setPasswordVisibility(visible) {
  const label = visible ? "Hide password" : "Show password";
  passwordInput.type = visible ? "text" : "password";
  passwordToggle.setAttribute("aria-label", label);
  passwordToggle.setAttribute("title", label);
  passwordToggle.setAttribute("aria-pressed", String(visible));
  passwordEyeSlash.hidden = visible;
}

// Mostra ou esconde a senha quando o usuário aciona o botão de olho.
passwordToggle.addEventListener("click", () => {
  setPasswordVisibility(passwordInput.type === "password");
});

// Mostra uma confirmação temporária sem interromper o fluxo da tela.
function showToast(message, isError = false) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

// Centraliza as chamadas à API e anexa a sessão quando existe um usuário autenticado.
async function requestApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Could not reach the local API. Start it with npm start.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

// Atualiza títulos, ação principal e preenchimento automático conforme login/cadastro.
function setAuthMode() {
  document.querySelector("#form-eyebrow").textContent = creatingAccount ? "CREATE AN ACCOUNT" : "ACCOUNT SIGN IN";
  document.querySelector("#form-title").textContent = creatingAccount ? "Create your account" : "Sign in to your account";
  document.querySelector("#form-description").textContent = creatingAccount
    ? "Enter your email and choose a password."
    : "Enter your email and password to continue.";
  submitLabel.textContent = creatingAccount ? "Create account" : "Sign in";
  passwordInput.autocomplete = creatingAccount ? "new-password" : "current-password";
  modeToggle.innerHTML = creatingAccount
    ? "Already have an account? <span>Sign in</span>"
    : "New here? <span>Create an account</span>";
  document.querySelector("#form-note").textContent = creatingAccount
    ? "Your password must be at least 8 characters."
    : "Your password is protected and stored as a hash.";
}

// Troca a tela de acesso pelo aplicativo e carrega os serviços disponíveis.
function enterWorkspace(email) {
  currentEmail = email;
  gate.hidden = true;
  workspace.hidden = false;
  document.querySelector("#account-initial").textContent = email.charAt(0).toUpperCase();
  renderServices(services);
  changeView("home");
}

// Tenta restaurar a sessão salva quando a página é aberta novamente.
async function checkSession() {
  if (!sessionToken) return;
  try {
    const { email } = await requestApi("/me");
    enterWorkspace(email);
  } catch {
    sessionToken = "";
    localStorage.removeItem("hammer-session");
  }
}

// Envia login/cadastro usando os dois campos visíveis ao mesmo tempo.
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError(formError);
  if (!authForm.reportValidity()) return;

  currentEmail = emailInput.value.trim().toLowerCase();
  submitButton.disabled = true;
  submitLabel.textContent = creatingAccount ? "Creating account..." : "Signing in...";
  try {
    const result = await requestApi(creatingAccount ? "/register" : "/login", {
      method: "POST",
      body: JSON.stringify({ email: currentEmail, password: passwordInput.value }),
    });
    sessionToken = result.token;
    localStorage.setItem("hammer-session", sessionToken);
    passwordInput.value = "";
    setPasswordVisibility(false);
    enterWorkspace(result.email);
  } catch (error) {
    showError(formError, error.message);
  } finally {
    submitButton.disabled = false;
    setAuthMode();
  }
});

// Alterna o formulário entre autenticar uma conta existente e criar uma nova.
modeToggle.addEventListener("click", () => {
  creatingAccount = !creatingAccount;
  clearError(formError);
  setAuthMode();
});

// Monta os botões do catálogo e conecta cada serviço ao formulário de pedido.
function renderServices(list) {
  const grid = document.querySelector("#service-grid");
  grid.replaceChildren();
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "empty-search";
    empty.textContent = "No services found. Try a different search.";
    grid.append(empty);
    return;
  }
  list.forEach((service) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "service-card";
    card.setAttribute("aria-label", `${service.name}: ${service.description}`);
    card.innerHTML = `<span class="service-illustration" style="--service-bg:${service.background};--service-color:${service.color}" aria-hidden="true">${service.icon}</span><span class="service-info"><strong>${service.name}</strong><span>${service.description}</span></span><span class="service-chevron" aria-hidden="true">↪</span>`;
    card.addEventListener("click", () => {
      changeView("request");
      document.querySelector("#request-service").value = service.name;
      updateRequestPreview();
    });
    grid.append(card);
  });
}

// Filtra categorias em inglês pelo nome ou pela descrição digitada na busca.
const serviceSearch = document.querySelector("#service-search");
const clearSearchButton = document.querySelector("#search-clear");

// Filtra a lista enquanto a pessoa digita e só mostra o controle de limpar com texto.
serviceSearch.addEventListener("input", (event) => {
  const query = event.target.value.trim().toLocaleLowerCase("en-US");
  clearSearchButton.hidden = event.target.value.length === 0;
  renderServices(services.filter((service) => `${service.name} ${service.description}`.toLocaleLowerCase("en-US").includes(query)));
});

// Limpa a busca, reaproveita o filtro e devolve o cursor ao campo.
clearSearchButton.addEventListener("click", () => {
  serviceSearch.value = "";
  serviceSearch.dispatchEvent(new Event("input", { bubbles: true }));
  serviceSearch.focus();
});

// Exibe uma única área do aplicativo e sincroniza a navegação ativa.
function changeView(viewName) {
  document.querySelectorAll(".app-view").forEach((view) => { view.hidden = view.id !== `${viewName}-view`; });
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  if (viewName === "history") loadHistory();
  if (viewName === "request") {
    updateRequestPreview();
    document.querySelector("#request-title").focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Liga os botões laterais, inferiores e atalhos textuais à troca de telas.
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => changeView(button.dataset.view)));
document.querySelectorAll("[data-view-link]").forEach((button) => button.addEventListener("click", () => changeView(button.dataset.viewLink)));

// Faixas de preço de referência exibidas como estimativa, nunca como valor fechado.
function getEstimate(serviceName) {
  const currentName = legacyServiceNames[serviceName] || serviceName;
  return services.find((service) => service.name === currentName)?.estimate || "Price available on request";
}

// Mostra categorias novas e antigas de forma uniforme, sem alterar o dado armazenado.
function getDisplayServiceName(serviceName) {
  return legacyServiceNames[serviceName] || serviceName || "Other";
}

// Mantém o cartão de prévia sincronizado com o que ainda está sendo preenchido.
function updateRequestPreview() {
  const form = document.querySelector("#request-form");
  const values = Object.fromEntries(new FormData(form));
  const schedule = [values.date, values.time].filter(Boolean);
  const readableDate = values.date
    ? new Date(`${values.date}T00:00:00`).toLocaleDateString("en-US")
    : "";
  const readableTime = values.time
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(`1970-01-01T${values.time}:00`))
    : "";
  const description = values.description?.trim() || "Your details will appear here as you fill out the form.";

  document.querySelector("#preview-service").textContent = values.service || "Choose a category";
  document.querySelector("#preview-schedule").textContent = schedule.length
    ? [readableDate, readableTime].filter(Boolean).join(" at ")
    : "Choose a date and time";
  document.querySelector("#preview-description").textContent = description.length > 118
    ? `${description.slice(0, 115)}...`
    : description;
  document.querySelector("#preview-address").textContent = values.address?.trim() || "Not provided yet";
  document.querySelector("#preview-price").textContent = values.service
    ? getEstimate(values.service)
    : "Select a service";
}

// Atualiza a prévia tanto ao selecionar opções quanto ao digitar nos campos.
document.querySelector("#request-form").addEventListener("input", updateRequestPreview);
document.querySelector("#request-form").addEventListener("change", updateRequestPreview);

// Valida e salva o pedido; inclui no histórico a mesma estimativa vista na prévia.
document.querySelector("#request-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorElement = document.querySelector("#request-error");
  clearError(errorElement);
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  values.estimatedPrice = getEstimate(values.service);
  try {
    await requestApi("/requests", { method: "POST", body: JSON.stringify(values) });
    form.reset();
    updateRequestPreview();
    showToast("Request submitted. It is now in your history.");
    changeView("history");
  } catch (error) {
    showError(errorElement, error.message);
  }
});

// Formata o horário preferido com o padrão longo em inglês usado pela interface.
function formatServiceSchedule(date, time) {
  if (!date) return "Date not provided";
  const serviceDate = new Date(`${date}T${time || "00:00"}:00`);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(serviceDate);
}

// Formata quando a solicitação entrou no sistema, separado do horário do serviço.
function formatRequestTimestamp(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

// Busca os pedidos da conta e cria cartões completos com conteúdo inserido como texto.
async function loadHistory() {
  const list = document.querySelector("#history-list");
  list.replaceChildren();
  try {
    const { requests } = await requestApi("/requests");
    if (!requests.length) {
      list.innerHTML = '<div class="empty-history"><strong>No requests yet</strong><p>Services you request will show up here.</p><button type="button" data-view-link="request">Request a service ↗</button></div>';
      list.querySelector("[data-view-link]").addEventListener("click", () => changeView("request"));
      return;
    }
    requests.forEach((request) => {
      const card = document.createElement("article");
      card.className = "history-card";
      const header = document.createElement("div");
      header.className = "history-card-header";
      const heading = document.createElement("h3");
      heading.textContent = getDisplayServiceName(request.service);
      const status = document.createElement("span");
      status.className = "status-label";
      status.textContent = "Received";

      const schedule = document.createElement("p");
      schedule.className = "history-schedule";
      schedule.textContent = `Appointment requested for ${formatServiceSchedule(request.date, request.time)}`;

      const details = document.createElement("dl");
      details.className = "history-details";
      const detailRows = [
        { label: "Work requested", value: request.description },
        { label: "Contact phone", value: request.phone },
        { label: "Service address", value: request.address },
        { label: "Initial estimate", value: request.estimatedPrice || getEstimate(request.service) },
      ];
      detailRows.forEach(({ label, value }) => {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = value || "Not provided";
        row.append(term, description);
        details.append(row);
      });

      const created = document.createElement("p");
      created.className = "history-created";
      const createdTime = document.createElement("time");
      createdTime.dateTime = request.createdAt;
      createdTime.textContent = formatRequestTimestamp(request.createdAt);
      created.append("Request submitted on ", createdTime);

      header.append(heading, status);
      card.append(header, schedule, details, created);
      list.append(card);
    });
  } catch (error) {
    showToast(error.message, true);
  }
}

// Encerra a sessão, limpa os campos e retorna para a tela de acesso.
document.querySelector("#account-button").addEventListener("click", async () => {
  try { await requestApi("/logout", { method: "POST", body: "{}" }); } catch { /* Limpa a sessão local mesmo quando a API está desligada. */ }
  sessionToken = "";
  localStorage.removeItem("hammer-session");
  currentEmail = "";
  creatingAccount = false;
  emailInput.value = "";
  passwordInput.value = "";
  setPasswordVisibility(false);
  setAuthMode();
  workspace.hidden = true;
  gate.hidden = false;
});

// Abre o diálogo compartilhado com o texto adequado a suporte ou privacidade.
document.querySelectorAll("[data-dialog]").forEach((button) => button.addEventListener("click", () => {
  const isPrivacy = button.dataset.dialog === "privacy";
  document.querySelector("#dialog-title").textContent = isPrivacy ? "Privacy" : "Terms & support";
  document.querySelector("#dialog-copy").textContent = isPrivacy
    ? "Your data stays in this local environment. Passwords are stored as hashes; use test accounts only."
    : "Need help? Email support@hammertime.local. This prototype runs locally.";
  dialog.showModal();
}));

// Fecha a janela pelo botão ou quando o usuário clica fora do conteúdo.
document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

// Atalho / leva o foco para a busca sem interferir nos campos de texto.
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) && !workspace.hidden) {
    event.preventDefault();
    document.querySelector("#service-search").focus();
  }
});

// Inicializa os textos do modo de acesso e tenta recuperar a sessão existente.
setAuthMode();
checkSession();