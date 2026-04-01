// ============================================================
// CONFIGURACIÓN
// ============================================================
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbw1txfALmLWy3Zgff50qM2oSIC_Y2dzPM-cJeX1DYmkeiMCTaIaAfV6_ficoLIkz1MR/exec";

let currentUser = null;
let pacientesCache = []; // caché de pacientes para autocomplete

// ============================================================
// HELPERS
// ============================================================
function setMessage(elementId, message, type = "info") {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("alert--success", "alert--error", "alert--info");
  if (!message) return;
  el.classList.add({ success: "alert--success", error: "alert--error", info: "alert--info" }[type] || "alert--info");
}

function formatDOP(valor) {
  const num = Number(valor) || 0;
  return "RD$ " + num.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================
// API
// ============================================================
async function apiGet(params = {}) {
  const url = new URL(API_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v ?? ""));
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error("Error de red " + response.status);
  const result = await response.json();
  if (result.status !== "success") throw new Error(result.message || "Error en la consulta");
  return result;
}

// ============================================================
// AUTENTICACIÓN
// ============================================================
function showAppShell() {
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
}

function showLoginAgain() {
  document.getElementById("loginView").classList.remove("hidden");
  document.getElementById("appShell").classList.add("hidden");
  setMessage("loginMessage", "", "info");
  currentUser = null;
  pacientesCache = [];
  updateHeaderUser();
}

function updateHeaderUser() {
  const container = document.getElementById("headerUserArea");
  if (!currentUser) { container.innerHTML = ""; return; }
  const roleLabel = currentUser.role === "ADMIN" ? "Administrador" : "Secretaria";
  container.innerHTML = `
    <div class="user-info">
      <span class="user-name">${currentUser.username}</span>
      <span class="app-header__user-role">${roleLabel}</span>
    </div>`;
}

function activateMenuForRole(role) {
  document.getElementById("adminMenu").hidden = role !== "ADMIN";
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  setMessage("loginMessage", "Validando credenciales…", "info");
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username || !password) { setMessage("loginMessage", "Ingresa usuario y contraseña.", "error"); return; }
  try {
    const result = await apiGet({ action: "login", username, password });
    currentUser = { username: result.user.username, role: result.user.rol };
    updateHeaderUser();
    activateMenuForRole(currentUser.role);
    showAppShell();
    // Precargar pacientes en caché
    await refreshPacientesCache();
  } catch (error) {
    setMessage("loginMessage", error.message || "No se pudo iniciar sesión.", "error");
  }
}

// ============================================================
// NAVEGACIÓN
// ============================================================
function handleSidebarClick(event) {
  const btn = event.target.closest("[data-view]");
  if (!btn) return;
  const viewId = btn.getAttribute("data-view");
  document.querySelectorAll(".sidebar__link").forEach(el => el.classList.toggle("is-active", el === btn));
  document.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("hidden", view.id !== `view-${viewId}`);
  });
  if (viewId === "admin-dashboard") loadDashboardData();
  else if (viewId === "admin-cobros") loadCobrosData();
  else if (viewId === "secretaria-lista") loadListaPacientes();
}

// ============================================================
// CACHÉ DE PACIENTES (para autocomplete y validaciones)
// ============================================================
async function refreshPacientesCache() {
  try {
    const result = await apiGet({ action: "listarPacientes" });
    pacientesCache = result.data || [];
  } catch (e) {
    pacientesCache = [];
  }
}

// ============================================================
// REGISTRAR PACIENTE (con validación de documento duplicado)
// ============================================================
async function handlePacienteSubmit(event) {
  event.preventDefault();
  setMessage("pacienteMessage", "Guardando paciente…", "info");
  const form = event.target;
  const data = {
    nombre: form.nombre.value.trim(),
    documento: form.documento.value.trim(),
    telefono: form.telefono.value.trim(),
    empresa: form.empresa.value.trim(),
    terapeuta: form.terapeuta.value.trim(),
  };
  if (!data.nombre || !data.documento || !data.terapeuta) {
    setMessage("pacienteMessage", "Nombre, documento y terapeuta son obligatorios.", "error");
    return;
  }

  // Validación de documento duplicado (en caché local)
  const duplicado = pacientesCache.find(p => p.documento && p.documento.toString().trim() === data.documento);
  if (duplicado) {
    setMessage("pacienteMessage", `⚠️ Ya existe un paciente con ese documento: ${duplicado.nombre}.`, "error");
    return;
  }

  try {
    await apiGet({ action: "crearPaciente", ...data });
    setMessage("pacienteMessage", "✓ Paciente guardado correctamente.", "success");
    form.reset();
    await refreshPacientesCache(); // Actualizar caché
  } catch (error) {
    setMessage("pacienteMessage", error.message || "No se pudo guardar el paciente.", "error");
  }
}

// ============================================================
// AUTOCOMPLETE DE PACIENTES EN REGISTRO DE PAGO
// ============================================================
let autocompleteSeleccionado = null;

function initAutocomplete() {
  const input = document.getElementById("pagoPacienteBuscar");
  const dropdown = document.getElementById("pacienteDropdown");
  const hiddenInput = document.getElementById("pagoPacienteId");
  const badge = document.getElementById("pacienteSeleccionado");
  const btnLimpiar = document.getElementById("btnLimpiarPaciente");

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    dropdown.innerHTML = "";

    if (!query || query.length < 2) {
      dropdown.classList.add("hidden");
      return;
    }

    const matches = pacientesCache.filter(p =>
      (p.nombre || "").toLowerCase().includes(query) ||
      (p.documento || "").toLowerCase().includes(query)
    ).slice(0, 8);

    if (matches.length === 0) {
      dropdown.innerHTML = `<div class="autocomplete-empty">No se encontraron pacientes</div>`;
      dropdown.classList.remove("hidden");
      return;
    }

    matches.forEach(p => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";
      item.innerHTML = `
        <span class="ac-name">${p.nombre}</span>
        <span class="ac-doc">${p.documento || ""}</span>
      `;
      item.addEventListener("click", () => seleccionarPaciente(p));
      dropdown.appendChild(item);
    });
    dropdown.classList.remove("hidden");
  });

  // Cerrar dropdown si se hace click afuera
  document.addEventListener("click", (e) => {
    if (!document.getElementById("pacienteBuscadorWrapper").contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });

  // Botón limpiar selección
  btnLimpiar.addEventListener("click", () => limpiarSeleccionPaciente());
}

function seleccionarPaciente(p) {
  autocompleteSeleccionado = p;
  const input = document.getElementById("pagoPacienteBuscar");
  const dropdown = document.getElementById("pacienteDropdown");
  const badge = document.getElementById("pacienteSeleccionado");
  const btnLimpiar = document.getElementById("btnLimpiarPaciente");

  input.value = "";
  input.placeholder = "Paciente seleccionado";
  dropdown.classList.add("hidden");

  document.getElementById("pagoPacienteId").value = p.nombre;

  // Auto-rellenar terapeuta si está vacío
  const terapeutaInput = document.getElementById("pagoTerapeuta");
  if (!terapeutaInput.value && p.terapeuta) terapeutaInput.value = p.terapeuta;

  // Auto-rellenar empresa si está vacío
  const empresaInput = document.getElementById("pagoEmpresa");
  if (!empresaInput.value && p.empresa) empresaInput.value = p.empresa;

  badge.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    <strong>${p.nombre}</strong> · ${p.documento || ""}
    ${p.empresa ? `· <em>${p.empresa}</em>` : ""}
  `;
  badge.classList.remove("hidden");
  btnLimpiar.hidden = false;
  input.classList.add("hidden");
}

function limpiarSeleccionPaciente() {
  autocompleteSeleccionado = null;
  const input = document.getElementById("pagoPacienteBuscar");
  const badge = document.getElementById("pacienteSeleccionado");
  const btnLimpiar = document.getElementById("btnLimpiarPaciente");

  document.getElementById("pagoPacienteId").value = "";
  input.value = "";
  input.placeholder = "Escribe nombre o cédula...";
  input.classList.remove("hidden");
  badge.classList.add("hidden");
  btnLimpiar.hidden = true;
}

// ============================================================
// REGISTRAR PAGO
// ============================================================
async function handlePagoSubmit(event) {
  event.preventDefault();
  setMessage("pagoMessage", "Registrando pago…", "info");

  const form = event.target;
  const pacienteNombre = document.getElementById("pagoPacienteId").value;

  if (!autocompleteSeleccionado || !pacienteNombre) {
    setMessage("pagoMessage", "Debes seleccionar un paciente existente de la lista.", "error");
    return;
  }

  const data = {
    paciente: pacienteNombre,
    fecha: form.fecha.value,
    monto: parseFloat(form.monto.value),
    metodo: form.metodo.value,
    terapeuta: form.terapeuta.value.trim(),
    empresa: form.empresa.value.trim(),
  };

  if (!data.fecha || !data.monto || !data.metodo || !data.terapeuta) {
    setMessage("pagoMessage", "Fecha, monto, método y terapeuta son obligatorios.", "error");
    return;
  }
  if (isNaN(data.monto) || data.monto <= 0) {
    setMessage("pagoMessage", "El monto debe ser mayor a 0.", "error");
    return;
  }

  try {
    await apiGet({ action: "registrarPago", ...data });
    setMessage("pagoMessage", "✓ Pago registrado correctamente.", "success");
    form.reset();
    limpiarSeleccionPaciente();
  } catch (error) {
    setMessage("pagoMessage", error.message || "No se pudo registrar el pago.", "error");
  }
}

// ============================================================
// LISTA DE PACIENTES (con edición)
// ============================================================
let pacientesLista = [];

async function loadListaPacientes() {
  setMessage("listaMessage", "Cargando pacientes…", "info");
  try {
    const result = await apiGet({ action: "listarPacientes" });
    pacientesLista = result.data || [];
    pacientesCache = pacientesLista; // Actualizar caché
    renderListaPacientes(pacientesLista);
    setMessage("listaMessage", "");
  } catch (error) {
    setMessage("listaMessage", error.message || "No se pudo cargar la lista.", "error");
  }
}

function renderListaPacientes(lista) {
  const tbody = document.getElementById("listaTbody");
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No hay pacientes registrados.</td></tr>`;
    return;
  }
  tbody.innerHTML = lista.map((p, idx) => `
    <tr>
      <td><strong>${p.nombre || ""}</strong></td>
      <td>${p.documento || ""}</td>
      <td>${p.telefono || "—"}</td>
      <td>${p.empresa || "—"}</td>
      <td>${p.terapeuta || ""}</td>
      <td>
        <button class="btn btn-sm btn-edit" data-fila="${p.fila}" data-idx="${idx}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".btn-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.idx);
      const fila = btn.dataset.fila;
      abrirModalEditar(pacientesLista[idx], fila);
    });
  });
}

// Filtro de búsqueda en la lista
function filtrarLista() {
  const q = document.getElementById("listaBusqueda").value.trim().toLowerCase();
  if (!q) { renderListaPacientes(pacientesLista); return; }
  const filtrados = pacientesLista.filter(p =>
    (p.nombre || "").toLowerCase().includes(q) ||
    (p.documento || "").toLowerCase().includes(q) ||
    (p.empresa || "").toLowerCase().includes(q) ||
    (p.terapeuta || "").toLowerCase().includes(q)
  );
  renderListaPacientes(filtrados);
}

// ============================================================
// MODAL EDITAR PACIENTE
// ============================================================
function abrirModalEditar(paciente, fila) {
  document.getElementById("editarFila").value = fila;
  document.getElementById("editarNombre").value = paciente.nombre || "";
  document.getElementById("editarDocumento").value = paciente.documento || "";
  document.getElementById("editarTelefono").value = paciente.telefono || "";
  document.getElementById("editarEmpresa").value = paciente.empresa || "";
  document.getElementById("editarTerapeuta").value = paciente.terapeuta || "";
  setMessage("editarMessage", "");
  document.getElementById("modalOverlay").classList.remove("hidden");
}

function cerrarModal() {
  document.getElementById("modalOverlay").classList.add("hidden");
}

async function handleEditarSubmit(event) {
  event.preventDefault();
  setMessage("editarMessage", "Guardando cambios…", "info");
  const fila = document.getElementById("editarFila").value;
  const data = {
    fila,
    nombre: document.getElementById("editarNombre").value.trim(),
    documento: document.getElementById("editarDocumento").value.trim(),
    telefono: document.getElementById("editarTelefono").value.trim(),
    empresa: document.getElementById("editarEmpresa").value.trim(),
    terapeuta: document.getElementById("editarTerapeuta").value.trim(),
  };
  if (!data.nombre || !data.documento || !data.terapeuta) {
    setMessage("editarMessage", "Nombre, documento y terapeuta son obligatorios.", "error");
    return;
  }
  try {
    await apiGet({ action: "editarPaciente", ...data });
    setMessage("editarMessage", "✓ Paciente actualizado.", "success");
    await loadListaPacientes();
    setTimeout(cerrarModal, 900);
  } catch (error) {
    setMessage("editarMessage", error.message || "No se pudo actualizar.", "error");
  }
}

// ============================================================
// DASHBOARD (con datos reales)
// ============================================================
/* global Chart */
let charts = { ingresosMes: null, ingresosTerapeuta: null, ingresosEmpresa: null, pacientesEmpresa: null };

function destroyCharts() {
  Object.keys(charts).forEach(key => { if (charts[key]) { charts[key].destroy(); charts[key] = null; } });
}

function buildChart(ctxId, type, labels, data, label, colorSet) {
  const ctx = document.getElementById(ctxId);
  if (!ctx) return null;

  const colors = [
    { bg: "rgba(79,70,229,0.18)", border: "#4f46e5" },
    { bg: "rgba(16,185,129,0.18)", border: "#10b981" },
    { bg: "rgba(245,158,11,0.18)", border: "#f59e0b" },
    { bg: "rgba(239,68,68,0.18)", border: "#ef4444" },
  ];
  const c = colors[colorSet % colors.length];

  const isPie = type === "pie" || type === "doughnut";
  const bgColors = isPie
    ? ["#4f46e5","#10b981","#f59e0b","#ef4444","#06b6d4","#8b5cf6","#ec4899","#14b8a6"]
    : c.bg;

  return new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: bgColors,
        borderColor: isPie ? "#fff" : c.border,
        borderWidth: isPie ? 2 : 2,
        borderRadius: type === "bar" ? 6 : 0,
        tension: type === "line" ? 0.4 : 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: isPie },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw;
              if (label.toLowerCase().includes("paciente")) return ` ${val} pacientes`;
              return ` RD$ ${Number(val).toLocaleString("es-DO", { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: isPie ? {} : {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "rgba(148,163,184,0.2)" } },
      },
    },
  });
}

async function loadDashboardData() {
  setMessage("dashboardMessage", "Cargando dashboard…", "info");
  destroyCharts();
  try {
    const result = await apiGet({ action: "dashboard" });
    const d = result.data || {};

    // KPIs
    if (d.kpis) {
      document.getElementById("kpiMes").textContent = formatDOP(d.kpis.ingresosMes || 0);
      document.getElementById("kpiPacientes").textContent = d.kpis.totalPacientes || 0;
      document.getElementById("kpiPagos").textContent = d.kpis.pagosMes || 0;
      document.getElementById("kpiTotal").textContent = formatDOP(d.kpis.ingresosTotal || 0);
    }

    if (d.ingresosPorMes?.length) {
      charts.ingresosMes = buildChart("chartIngresosMes", "bar",
        d.ingresosPorMes.map(r => r.mes), d.ingresosPorMes.map(r => r.total), "Ingresos", 0);
    }
    if (d.ingresosPorTerapeuta?.length) {
      charts.ingresosTerapeuta = buildChart("chartIngresosTerapeuta", "bar",
        d.ingresosPorTerapeuta.map(r => r.terapeuta), d.ingresosPorTerapeuta.map(r => r.total), "Ingresos", 1);
    }
    if (d.ingresosPorEmpresa?.length) {
      charts.ingresosEmpresa = buildChart("chartIngresosEmpresa", "doughnut",
        d.ingresosPorEmpresa.map(r => r.empresa), d.ingresosPorEmpresa.map(r => r.total), "Ingresos empresa", 2);
    }
    if (d.pacientesPorEmpresa?.length) {
      charts.pacientesEmpresa = buildChart("chartPacientesEmpresa", "bar",
        d.pacientesPorEmpresa.map(r => r.empresa), d.pacientesPorEmpresa.map(r => r.cantidad), "Pacientes", 3);
    }

    setMessage("dashboardMessage", "");
  } catch (error) {
    setMessage("dashboardMessage", error.message || "No se pudieron cargar los datos.", "error");
  }
}

// ============================================================
// MÓDULO DE COBROS
// ============================================================
let cobrosTodos = [];

function aplicarFiltrosCobros() {
  const desde = document.getElementById("filtroFechaDesde").value;
  const hasta = document.getElementById("filtroFechaHasta").value;
  const terapeuta = document.getElementById("filtroTerapeuta").value.trim().toLowerCase();
  const empresa = document.getElementById("filtroEmpresa").value.trim().toLowerCase();
  const tbody = document.querySelector("#cobrosTabla tbody");
  tbody.innerHTML = "";
  let total = 0;

  const filtrados = cobrosTodos.filter(row => {
    const fecha = row.fecha || "";
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;
    if (terapeuta && !(row.terapeuta || "").toLowerCase().includes(terapeuta)) return false;
    if (empresa && !(row.empresa || "").toLowerCase().includes(empresa)) return false;
    return true;
  });

  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No hay registros con estos filtros.</td></tr>`;
    document.getElementById("cobrosTotal").textContent = formatDOP(0);
    return;
  }

  filtrados.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.fecha || ""}</td>
      <td>${row.paciente || ""}</td>
      <td class="monto-cell">${formatDOP(row.monto)}</td>
      <td><span class="metodo-badge">${row.metodo || ""}</span></td>
      <td>${row.terapeuta || ""}</td>
      <td>${row.empresa || "—"}</td>
    `;
    tbody.appendChild(tr);
    total += Number(row.monto) || 0;
  });

  document.getElementById("cobrosTotal").textContent = formatDOP(total);
}

async function loadCobrosData() {
  setMessage("cobrosMessage", "Cargando historial…", "info");
  try {
    const result = await apiGet({ action: "cobros" });
    cobrosTodos = result.data || [];
    aplicarFiltrosCobros();
    setMessage("cobrosMessage", "");
  } catch (error) {
    setMessage("cobrosMessage", error.message || "No se pudo cargar el historial.", "error");
  }
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
function initEventListeners() {
  document.getElementById("loginForm").addEventListener("submit", handleLoginSubmit);
  document.getElementById("pacienteForm").addEventListener("submit", handlePacienteSubmit);
  document.getElementById("pagoForm").addEventListener("submit", handlePagoSubmit);
  document.getElementById("sidebarNav").addEventListener("click", handleSidebarClick);
  document.getElementById("editarPacienteForm").addEventListener("submit", handleEditarSubmit);

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", () => {
    showLoginAgain();
    document.querySelectorAll(".sidebar__link").forEach(b => b.classList.remove("is-active"));
    const firstBtn = document.querySelector('[data-view="secretaria-pacientes"]');
    if (firstBtn) firstBtn.classList.add("is-active");
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("hidden", v.id !== "view-secretaria-pacientes"));
  });

  // Lista pacientes
  document.getElementById("listaRefreshBtn").addEventListener("click", loadListaPacientes);
  document.getElementById("listaBusqueda").addEventListener("input", filtrarLista);

  // Cobros
  document.getElementById("cobrosFiltrosForm").addEventListener("input", aplicarFiltrosCobros);
  document.getElementById("cobrosRefreshBtn").addEventListener("click", loadCobrosData);

  // Modal
  document.getElementById("modalClose").addEventListener("click", cerrarModal);
  document.getElementById("modalCancelBtn").addEventListener("click", cerrarModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modalOverlay")) cerrarModal();
  });

  // Reset del formulario de pago limpia el autocomplete
  document.getElementById("btnResetPago").addEventListener("click", () => {
    limpiarSeleccionPaciente();
  });

  // Fecha por defecto en pago
  const pagoFecha = document.getElementById("pagoFecha");
  if (pagoFecha && !pagoFecha.value) {
    pagoFecha.valueAsNumber = Date.now() - new Date().getTimezoneOffset() * 60000;
  }

  // Inicializar autocomplete
  initAutocomplete();
}

window.addEventListener("DOMContentLoaded", () => {
  initEventListeners();
});
