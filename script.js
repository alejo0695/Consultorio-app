// SECTION: Configuración general
// Reemplaza esta URL por la de tu Web App de Google Apps Script (termina en /exec)
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbw1txfALmLWy3Zgff50qM2oSIC_Y2dzPM-cJeX1DYmkeiMCTaIaAfV6_ficoLIkz1MR/exec";

// Helpers para mostrar mensajes
function setMessage(elementId, message, type = "info") {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("alert--success", "alert--error", "alert--info");
  if (!message) return;
  const classMap = {
    success: "alert--success",
    error: "alert--error",
    info: "alert--info",
  };
  el.classList.add(classMap[type] || classMap.info);
}

// Guarda el usuario autenticado en memoria
let currentUser = null; // { username, role }

// SECTION: Cambio de vistas de la app
function showAppShell() {
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
}

function showLoginAgain() {
  document.getElementById("loginView").classList.remove("hidden");
  document.getElementById("appShell").classList.add("hidden");
  setMessage("loginMessage", "", "info");
  currentUser = null;
  updateHeaderUser();
}

function updateHeaderUser() {
  const container = document.getElementById("headerUserArea");
  if (!currentUser) {
    container.innerHTML = "";
    return;
  }
  const roleLabel = currentUser.role === "ADMIN" ? "Administrador" : "Secretaria";
  container.innerHTML = `
    <div>
      <div>${currentUser.username}</div>
      <div class="app-header__user-role">${roleLabel}</div>
    </div>
  `;
}

function activateMenuForRole(role) {
  const adminMenu = document.getElementById("adminMenu");
  if (role === "ADMIN") {
    adminMenu.hidden = false;
  } else {
    adminMenu.hidden = true;
  }
}

// Navegación lateral: muestra la vista correspondiente
function handleSidebarClick(event) {
  const btn = event.target.closest("[data-view]");
  if (!btn) return;

  const viewId = btn.getAttribute("data-view");
  if (!viewId) return;

  // Actualizar estado activo del menú
  document.querySelectorAll(".sidebar__link").forEach((el) => {
    el.classList.toggle("is-active", el === btn);
  });

  // Mostrar/ocultar vistas
  document.querySelectorAll(".view").forEach((view) => {
    if (view.id === `view-${viewId}`) {
      view.classList.remove("hidden");
    } else {
      view.classList.add("hidden");
    }
  });

  // Si se abre el dashboard o cobros, cargar datos
  if (viewId === "admin-dashboard") {
    loadDashboardData();
  } else if (viewId === "admin-cobros") {
    loadCobrosData();
  }
}

// SECTION: Llamadas a la API de Apps Script
async function apiPost(action, payload = {}) {
  try {
    const response = await fetch(API_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        data: payload,
      }),
    });

    if (!response.ok) {
      throw new Error("Error de red " + response.status);
    }

    const result = await response.json();
    if (result.status !== "success") {
      throw new Error(result.message || "Error en la operación");
    }
    return result;
  } catch (error) {
    console.error("apiPost error", error);
    throw error;
  }
}

async function apiGet(params = {}) {
  const url = new URL(API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
  url.searchParams.append(key, value ?? "");
});

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error("Error de red " + response.status);
  }
  const result = await response.json();
  if (result.status !== "success") {
    throw new Error(result.message || "Error en la consulta");
  }
  return result;
}

// SECTION: Login
async function handleLoginSubmit(event) {
  event.preventDefault();
  setMessage("loginMessage", "Validando credenciales...", "info");

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!username || !password) {
    setMessage("loginMessage", "Ingresa usuario y contraseña.", "error");
    return;
  }

  try {
const result = await apiGet({
  action: "login",
  username,
  password
});
    currentUser = {
      username: result.user.username,
      role: result.user.rol,
    };
    updateHeaderUser();
    activateMenuForRole(currentUser.role);
    showAppShell();
    setMessage("loginMessage", "");
  } catch (error) {
    setMessage("loginMessage", error.message || "No se pudo iniciar sesión.", "error");
  }
}

// SECTION: Formularios de Secretaria
async function handlePacienteSubmit(event) {
  event.preventDefault();
  setMessage("pacienteMessage", "Guardando paciente...", "info");

  const form = event.target;
  const data = {
    nombre: form.nombre.value.trim(),
    documento: form.documento.value.trim(),
    telefono: form.telefono.value.trim(),
    empresa: form.empresa.value.trim(),
    terapeuta: form.terapeuta.value.trim(),
  };

  if (!data.nombre || !data.documento || !data.terapeuta) {
    setMessage(
      "pacienteMessage",
      "Nombre, documento y terapeuta son obligatorios.",
      "error"
    );
    return;
  }

  try {
    
   await apiPost("crearPaciente", data);
    
    setMessage("pacienteMessage", "Paciente guardado correctamente.", "success");
    form.reset();
  } catch (error) {
    setMessage(
      "pacienteMessage",
      error.message || "No se pudo guardar el paciente.",
      "error"
    );
  }
}

async function handlePagoSubmit(event) {
  event.preventDefault();
  setMessage("pagoMessage", "Registrando pago...", "info");

  const form = event.target;
  const data = {
    paciente: form.paciente.value.trim(),
    fecha: form.fecha.value,
    monto: parseFloat(form.monto.value),
    metodo: form.metodo.value,
    terapeuta: form.terapeuta.value.trim(),
    empresa: form.empresa.value.trim(),
  };

  if (!data.paciente || !data.fecha || !data.monto || !data.metodo || !data.terapeuta) {
    setMessage(
      "pagoMessage",
      "Paciente, fecha, monto, método y terapeuta son obligatorios.",
      "error"
    );
    return;
  }

  if (Number.isNaN(data.monto) || data.monto <= 0) {
    setMessage("pagoMessage", "El monto debe ser un número mayor a 0.", "error");
    return;
  }

  try {
 await apiPost("registrarPago", data);
    setMessage("pagoMessage", "Pago registrado correctamente.", "success");
    form.reset();
  } catch (error) {
    setMessage("pagoMessage", error.message || "No se pudo registrar el pago.", "error");
  }
}

// SECTION: Dashboard (ADMIN)
// Deshabilitar advertencia de linter sobre Chart (lo inyecta el CDN de Chart.js)
/* global Chart */
let charts = {
  ingresosMes: null,
  ingresosTerapeuta: null,
  ingresosEmpresa: null,
  pacientesEmpresa: null,
};

function destroyCharts() {
  Object.keys(charts).forEach((key) => {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  });
}

function buildChart(ctxId, type, labels, data, label, paletteIndex = 0) {
  const ctx = document.getElementById(ctxId);
  if (!ctx) return null;

  const palettes = [
    {
      bg: "rgba(79, 70, 229, 0.25)",
      border: "#4f46e5",
    },
    {
      bg: "rgba(6, 182, 212, 0.25)",
      border: "#06b6d4",
    },
    {
      bg: "rgba(234, 179, 8, 0.25)",
      border: "#ca8a04",
    },
    {
      bg: "rgba(239, 68, 68, 0.25)",
      border: "#ef4444",
    },
  ];
  const palette = palettes[paletteIndex % palettes.length];

  return new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          backgroundColor:
            type === "bar" || type === "line"
              ? palette.bg
              : labels.map(() => palette.bg),
          borderColor: palette.border,
          borderWidth: 2,
          borderRadius: type === "bar" ? 8 : 0,
          tension: type === "line" ? 0.4 : 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: type === "pie" || type === "doughnut" ? {} : {
        x: {
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148, 163, 184, 0.35)" },
        },
      },
    },
  });
}

async function loadDashboardData() {
  setMessage("dashboardMessage", "Cargando datos del dashboard...", "info");
  destroyCharts();
  try {
    const result = await apiGet({ action: "dashboard" });
    const data = result.data || {};

    // Ingresos por mes
    if (data.ingresosPorMes) {
      const labels = data.ingresosPorMes.map((row) => row.mes);
      const values = data.ingresosPorMes.map((row) => row.total);
      charts.ingresosMes = buildChart(
        "chartIngresosMes",
        "bar",
        labels,
        values,
        "Ingresos por mes",
        0
      );
    }

    // Ingresos por terapeuta
    if (data.ingresosPorTerapeuta) {
      const labels = data.ingresosPorTerapeuta.map((row) => row.terapeuta);
      const values = data.ingresosPorTerapeuta.map((row) => row.total);
      charts.ingresosTerapeuta = buildChart(
        "chartIngresosTerapeuta",
        "bar",
        labels,
        values,
        "Ingresos por terapeuta",
        1
      );
    }

    // Ingresos por empresa
    if (data.ingresosPorEmpresa) {
      const labels = data.ingresosPorEmpresa.map((row) => row.empresa);
      const values = data.ingresosPorEmpresa.map((row) => row.total);
      charts.ingresosEmpresa = buildChart(
        "chartIngresosEmpresa",
        "bar",
        labels,
        values,
        "Ingresos por empresa",
        2
      );
    }

    // Pacientes por empresa
    if (data.pacientesPorEmpresa) {
      const labels = data.pacientesPorEmpresa.map((row) => row.empresa);
      const values = data.pacientesPorEmpresa.map((row) => row.cantidad);
      charts.pacientesEmpresa = buildChart(
        "chartPacientesEmpresa",
        "bar",
        labels,
        values,
        "Pacientes por empresa",
        3
      );
    }

    setMessage("dashboardMessage", "", "info");
  } catch (error) {
    setMessage(
      "dashboardMessage",
      error.message || "No se pudieron cargar los datos del dashboard.",
      "error"
    );
  }
}

// SECTION: Módulo de cobros (ADMIN)
let cobrosTodos = [];

function formatearMoneda(valor) {
  const num = Number(valor) || 0;
  return num.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

function aplicarFiltrosCobros() {
  const desde = document.getElementById("filtroFechaDesde").value;
  const hasta = document.getElementById("filtroFechaHasta").value;
  const terapeuta = document.getElementById("filtroTerapeuta").value.trim().toLowerCase();
  const empresa = document.getElementById("filtroEmpresa").value.trim().toLowerCase();

  const tbody = document.querySelector("#cobrosTabla tbody");
  tbody.innerHTML = "";

  let total = 0;

  cobrosTodos
    .filter((row) => {
      const fecha = row.fecha || "";
      const terapeutaRow = (row.terapeuta || "").toLowerCase();
      const empresaRow = (row.empresa || "").toLowerCase();

      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (terapeuta && !terapeutaRow.includes(terapeuta)) return false;
      if (empresa && !empresaRow.includes(empresa)) return false;
      return true;
    })
    .forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.fecha || ""}</td>
        <td>${row.paciente || ""}</td>
        <td>${formatearMoneda(row.monto)}</td>
        <td>${row.metodo || ""}</td>
        <td>${row.terapeuta || ""}</td>
        <td>${row.empresa || ""}</td>
      `;
      tbody.appendChild(tr);
      total += Number(row.monto) || 0;
    });

  document.getElementById("cobrosTotal").textContent = formatearMoneda(total);
}

async function loadCobrosData() {
  setMessage("cobrosMessage", "Cargando historial de pagos...", "info");
  try {
    const result = await apiGet({ action: "cobros" });
    cobrosTodos = result.data || [];
    aplicarFiltrosCobros();
    setMessage("cobrosMessage", "", "info");
  } catch (error) {
    setMessage(
      "cobrosMessage",
      error.message || "No se pudo cargar el historial de pagos.",
      "error"
    );
  }
}

// SECTION: Inicialización de eventos
function initEventListeners() {
  // Login
  const loginForm = document.getElementById("loginForm");
  loginForm.addEventListener("submit", handleLoginSubmit);

  // Formularios secretaria
  const pacienteForm = document.getElementById("pacienteForm");
  pacienteForm.addEventListener("submit", handlePacienteSubmit);

  const pagoForm = document.getElementById("pagoForm");
  pagoForm.addEventListener("submit", handlePagoSubmit);

  // Navegación lateral
  const sidebar = document.getElementById("sidebarNav");
  sidebar.addEventListener("click", handleSidebarClick);

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn.addEventListener("click", () => {
    showLoginAgain();
    // Volver a la primera vista por defecto (pacientes)
    document
      .querySelectorAll(".sidebar__link")
      .forEach((btn) => btn.classList.remove("is-active"));
    const firstBtn = document.querySelector('[data-view="secretaria-pacientes"]');
    if (firstBtn) firstBtn.classList.add("is-active");
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle(
        "hidden",
        view.id !== "view-secretaria-pacientes"
      );
    });
  });

  // Cobros: filtros y refresco
  const filtrosForm = document.getElementById("cobrosFiltrosForm");
  filtrosForm.addEventListener("input", aplicarFiltrosCobros);

  const cobrosRefreshBtn = document.getElementById("cobrosRefreshBtn");
  cobrosRefreshBtn.addEventListener("click", loadCobrosData);

  // Establecer fecha actual por defecto en el registro de pagos
  const pagoFecha = document.getElementById("pagoFecha");
  if (pagoFecha && !pagoFecha.value) {
    pagoFecha.valueAsNumber = Date.now() - new Date().getTimezoneOffset() * 60000;
  }
}

// Init general
window.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
});
