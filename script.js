// ===== SUPABASE CONFIG =====
const SUPABASE_URL = "https://wpcsqjcaxxckldwfwsrn.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZXxwRu-TXDFdCLhrKtNKfA_emZA1NNN";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "clients";
const TABLE_STOCK = "stock_movimientos";
const TABLE_HISTORY = "history";

let clients = [];
let stockData = [];
let history = JSON.parse(localStorage.getItem("eliteHistory")) || [];
let section = "general";
let reservaGastadaGlobal = 0;
let capitalInicialPrestamos = 0;
let cajaPrestamos = 0;

const formSection = document.getElementById("formSection");
const tableSection = document.getElementById("tableSection");
const generalDashboard = document.getElementById("generalDashboard");
const prestamosDashboard = document.getElementById("prestamosDashboard");

// --- FUNCIÓN PARA OBTENER FECHA ACTUAL EN COSTA RICA (UTC-6) ---
function getCRDate() {
    const now = new Date();
    const offset = -6;
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * offset));
}

function formatCRC(num) {
    return "₡" + Number(num || 0).toLocaleString("es-CR");
}

function formatPDF(num) {
    return Number(num || 0).toLocaleString("es-CR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function removeOldExportButtons() {
    const centeredBtn = document.getElementById("exportPdfBtn");
    const allButtons = Array.from(document.querySelectorAll("button"));

    allButtons.forEach(btn => {
        if (btn === centeredBtn) return;

        const buttonText = (btn.textContent || "").trim().toLowerCase();
        const onclickAttr = btn.getAttribute("onclick") || "";

        if (buttonText === "exportar pdf" || onclickAttr === "exportPDF()") {
            btn.remove();
        }
    });
}

function ensureExportButton() {
    let wrapper = document.getElementById("exportPdfWrap");
    let btn = document.getElementById("exportPdfBtn");

    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.id = "exportPdfWrap";
        wrapper.style.display = "flex";
        wrapper.style.justifyContent = "center";
        wrapper.style.alignItems = "center";
        wrapper.style.margin = "24px 0 10px 0";
        wrapper.style.width = "100%";

        const target = tableSection || document.body;
        target.insertAdjacentElement("afterend", wrapper);
    }

    if (!btn) {
        btn = document.createElement("button");
        btn.id = "exportPdfBtn";
        btn.type = "button";
        btn.textContent = "Exportar PDF";
        btn.onclick = exportPDF;
        btn.style.padding = "12px 20px";
        btn.style.background = "#e1ad01";
        btn.style.color = "#fff";
        btn.style.border = "none";
        btn.style.borderRadius = "8px";
        btn.style.fontWeight = "bold";
        btn.style.cursor = "pointer";
        btn.style.boxShadow = "0 4px 15px rgba(225, 173, 1, 0.2)";
        wrapper.appendChild(btn);
    }

    removeOldExportButtons();
    return btn;
}

function toggleSectionExtras() {
    const resStock = document.getElementById("resumenStockContainer");
    const exportBtn = ensureExportButton();
    const exportWrap = document.getElementById("exportPdfWrap");

    if (resStock) {
        if (section === "stock") {
            resStock.style.display = "grid";
        } else {
            resStock.style.display = "none";
            resStock.innerHTML = "";
        }
    }

    if (exportBtn && exportWrap) {
        exportWrap.style.display = "flex";
        exportBtn.style.display = "inline-block";
    }

    removeOldExportButtons();
}

document.addEventListener("DOMContentLoaded", () => {
    ensureExportButton();
    removeOldExportButtons();

    const firstBtn = document.querySelector("#navMenu button");
    if (firstBtn) changeSection("general", firstBtn);

    loadFromSupabase();
    loadStockFromSupabase();
    loadReservaFromSupabase();
    loadHistoryFromSupabase();
    toggleSectionExtras();
});

window.addEventListener("resize", renderTable);

function save() {
    localStorage.setItem("eliteHistory", JSON.stringify(history));
    updateGeneral();
}

async function saveToSupabase(client) {
    try {
        await supabaseClient.from(TABLE_NAME).insert([client]);
    } catch (err) {
        console.error(err);
    }
}

async function updateSupabase(client) {
    try {
        await supabaseClient.from(TABLE_NAME).update(client).eq("id", client.id);
    } catch (err) {
        console.error(err);
    }
}

async function deleteFromSupabase(id) {
    try {
        await supabaseClient.from(TABLE_NAME).delete().eq("id", id);
    } catch (err) {
        console.error(err);
    }
}

async function saveHistoryToSupabase(entry) {
    try {
        await supabaseClient.from(TABLE_HISTORY).insert([{
            nombre: entry.nombre,
            monto: entry.monto || 0,
            fecha: entry.fecha || getCRDate().toISOString().split("T")[0],
            tipo_operacion: entry.estado,
            section: entry.section
        }]);
    } catch (err) {
        console.error("Error historial nube:", err);
    }
}

async function loadFromSupabase() {
    try {
        const { data, error } = await supabaseClient.from(TABLE_NAME).select("*").order("id", { ascending: false });
        if (error) throw error;
        if (data) {
            clients = data;
            renderTable();
            updateGeneral();
        }
    } catch (err) {
        console.error("Error cargando Supabase:", err);
    }
}

async function loadStockFromSupabase() {
    try {
        const { data, error } = await supabaseClient.from(TABLE_STOCK).select("*").order("fecha", { ascending: false });
        if (!error && data) {
            stockData = data;
            updateGeneral();
            if (section === "stock") renderTable();
        }
    } catch (err) {
        console.error("Error stock:", err);
    }
}

async function loadHistoryFromSupabase() {
    try {
        const { data, error } = await supabaseClient.from(TABLE_HISTORY).select("*").order("fecha", { ascending: false });
        if (!error && data) {
            history = data.map(d => ({
                ...d,
                estado: d.tipo_operacion,
                ultimoAbono: d.monto,
                section: d.section
            }));
            save();
        }
    } catch (err) {
        console.error("Error cargando historial:", err);
    }
}

async function loadReservaFromSupabase() {
    try {
        const { data, error } = await supabaseClient
            .from("configuracion")
            .select("id, valor")
            .in("id", ["reserva_gastada", "capital_inicial_prestamos", "caja_prestamos"]);

        if (error) throw error;

        if (data && data.length) {
            const configMap = Object.fromEntries(
                data.map(item => [item.id, Number(item.valor) || 0])
            );

            reservaGastadaGlobal = configMap.reserva_gastada || 0;
            capitalInicialPrestamos = configMap.capital_inicial_prestamos || 0;
            cajaPrestamos = configMap.caja_prestamos || 0;

            updateGeneral();
        }
    } catch (err) {
        console.error("Error cargando reserva:", err);
    }
}

async function utilizarReserva() {
    let montoAUsar = prompt("¿Cuánto dinero de la reserva vas a utilizar?");
    if (montoAUsar === null || montoAUsar === "") return;

    let montoNum = parseFloat(montoAUsar.replace(/[₡.]/g, "").replace(",", "."));

    if (isNaN(montoNum) || montoNum <= 0) {
        alert("Por favor, ingresa un monto válido.");
        return;
    }

    if (confirm(`¿Confirmas que usarás ₡${montoNum.toLocaleString("es-CR")} de la reserva?`)) {
        let nuevoTotal = reservaGastadaGlobal + montoNum;
        const { error } = await supabaseClient.from("configuracion").update({ valor: nuevoTotal }).eq("id", "reserva_gastada");

        if (!error) {
            reservaGastadaGlobal = nuevoTotal;
            updateGeneral();
            alert("Reserva actualizada en la nube.");
        } else {
            alert("Error al guardar en la nube.");
        }
    }
}

async function resetReservaNube() {
    await supabaseClient.from("configuracion").update({ valor: 0 }).eq("id", "reserva_gastada");
    reservaGastadaGlobal = 0;
    updateGeneral();
}

function changeSection(sec, btn) {
    section = sec;
    document.querySelectorAll("#navMenu button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    toggleSectionExtras();

    if (sec === "general") {
        formSection.style.display = "none";
        tableSection.style.display = "none";
        generalDashboard.style.display = "grid";
        prestamosDashboard.style.display = "block";
        updateGeneral();
    } else {
        formSection.style.display = "block";
        tableSection.style.display = "block";
        generalDashboard.style.display = "none";
        prestamosDashboard.style.display = "none";
        adjustForm();
        if (sec === "stock") loadStockFromSupabase();
        renderTable();
    }
}

function adjustForm() {
    const isStock = section === "stock";
    const isPrestamo = section === "prestamos";
    const isContado = section === "contado";

    document.getElementById("nombre").style.display = isStock ? "none" : "block";
    document.getElementById("producto").style.display = (isPrestamo || isStock) ? "none" : "block";
    document.getElementById("costo").style.display = (isPrestamo || isStock) ? "none" : "block";
    document.getElementById("precio").style.display = (isPrestamo || isStock) ? "none" : "block";
    document.getElementById("prima").style.display = (isContado || isPrestamo || isStock) ? "none" : "block";
    document.getElementById("whatsapp").style.display = (isContado || isStock) ? "none" : "block";
    document.getElementById("prestamo").style.display = isPrestamo ? "block" : "none";
    document.getElementById("tipoPrestamo").style.display = isPrestamo ? "block" : "none";

    document.getElementById("nombrePerfume").style.display = isStock ? "block" : "none";
    document.getElementById("cantidadStock").style.display = isStock ? "block" : "none";
    document.getElementById("costoStock").style.display = isStock ? "block" : "none";
    document.getElementById("proveedorStock").style.display = isStock ? "block" : "none";
}

document.getElementById("clientForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (section === "stock") {
        const stockItem = {
            nombre_perfume: document.getElementById("nombrePerfume").value,
            cantidad: parseInt(document.getElementById("cantidadStock").value),
            costo_unidad: parseFloat(document.getElementById("costoStock").value),
            proveedor: document.getElementById("proveedorStock").value,
            estado: "disponible",
            fecha: document.getElementById("fecha").value
        };
        const { error } = await supabaseClient.from(TABLE_STOCK).insert([stockItem]);
        if (!error) {
            alert("Stock registrado con éxito");
            loadStockFromSupabase();
            e.target.reset();
        }
        return;
    }

    let monto = Number(document.getElementById("prestamo").value) || 0;
    let t = document.getElementById("tipoPrestamo").value;
    let inter = 0, ct = 0, tot = 0;

    if (section === "prestamos") {
        inter = (t === "20") ? monto * 0.20 : monto * 0.05;
        tot = monto + inter;
        ct = (t === "20") ? (tot / 5).toFixed(0) : "Indefinidas";
    }

    let client = {
        id: Date.now(),
        section,
        fecha: document.getElementById("fecha").value,
        nombre: document.getElementById("nombre").value,
        producto: document.getElementById("producto").value || "",
        precio: Number(document.getElementById("precio").value) || 0,
        costo: Number(document.getElementById("costo").value) || 0,
        prima: Number(document.getElementById("prima").value) || 0,
        prestamo: monto,
        whatsapp: document.getElementById("whatsapp").value || "",
        abonado: 0,
        ultimoAbono: 0,
        fechaUltimoAbono: "",
        cuota: ct,
        interes: inter,
        totalPrestamo: tot
    };

    clients.unshift(client);
    await saveToSupabase(client);
    save();
    renderTable();
    e.target.reset();
});

async function renderTable() {
    let tbody = document.getElementById("clientTable");
    let thead = document.getElementById("tableHead");
    let resStock = document.getElementById("resumenStockContainer");
    let mainTable = document.querySelector(".tableSection table");
    tbody.innerHTML = "";
    let isMobile = window.innerWidth <= 768;

    toggleSectionExtras();

    if (mainTable) {
        if (section === "stock") mainTable.classList.add("table-stock");
        else mainTable.classList.remove("table-stock");
    }

    if (section === "stock") {
        renderStockUI(thead, tbody, resStock);
        removeOldExportButtons();
        return;
    }

    if (section === "prestamos") thead.innerHTML = `<tr><th>Fecha</th><th>Cliente</th><th>Prestamo</th><th>Cuotas</th><th>Abonado</th><th>Saldo</th><th>Acciones</th></tr>`;
    else if (section === "contado") thead.innerHTML = `<tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Costo</th><th>Precio</th><th>Ganancia</th><th>Acciones</th></tr>`;
    else thead.innerHTML = `<tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Costo</th><th>Precio</th><th>Prima</th><th>Abonado</th><th>Saldo</th><th>Acciones</th></tr>`;

    const filteredClients = clients.filter(c => c && c.section === section);

    for (const c of filteredClients) {
        let saldo = c.section === "prestamos"
            ? (c.totalPrestamo || 0) - (c.abonado || 0)
            : (c.precio || 0) - (c.prima || 0) - (c.abonado || 0);

        if (saldo <= 0) {
            const entry = { ...c, estado: "cancelado", fecha: getCRDate().toISOString().split("T")[0] };
            history.push(entry);
            await saveHistoryToSupabase(entry);
            await deleteFromSupabase(c.id);
            clients = clients.filter(x => x.id !== c.id);
            save();
            continue;
        }

        let tr = document.createElement("tr");
        if (isMobile) {
            if (section === "contado") {
                const ganancia = (c.precio || 0) - (c.costo || 0);
                tr.innerHTML = `<td colspan="100%" style="padding: 15px 0; border: none; background: transparent;">
                    <div style="text-align: center; color: white; margin-bottom: 12px;">
                        <strong style="font-size: 1.4em; letter-spacing: 0.5px;">${c.nombre || "Sin nombre"}</strong><br>
                        <small style="color: #888; font-size: 0.9em;">${c.fecha || "-"}</small>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; box-sizing: border-box; padding: 0 5px;">
                        <div class="mobileCard"><small>PRODUCTO</small><br><span>${c.producto || "-"}</span></div>
                        <div class="mobileCard"><small>COSTO</small><br><span>${formatCRC(c.costo)}</span></div>
                        <div class="mobileCard"><small>PRECIO</small><br><span>${formatCRC(c.precio)}</span></div>
                        <div class="mobileCard" style="border:1px solid #FFD700"><small>GANANCIA</small><br><span style="color:#FFD700">${formatCRC(ganancia)}</span></div>
                    </div>
                    <div style="margin-top: 15px; display: flex; justify-content: center; gap: 10px;">${actionButtons(c.id)}</div>
                </td>`;
            } else {
                const esP = c.section === "prestamos";
                const planTexto = (c.cuota === "Indefinidas") ? "5% (Indef.)" : "20% (5 Cuotas)";
                tr.innerHTML = `<td colspan="100%" style="padding: 15px 0; border: none; background: transparent;">
                    <div style="text-align: center; color: white; margin-bottom: 12px;">
                        <strong style="font-size: 1.4em; letter-spacing: 0.5px;">${c.nombre || "Sin nombre"}</strong><br>
                        <small style="color: #888; font-size: 0.9em;">${c.fecha || "-"}</small>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; box-sizing: border-box; padding: 0 5px;">
                        <div class="mobileCard"><small>DETALLE</small><br><span>${esP ? formatCRC(c.prestamo) : (c.producto || "-")}</span></div>
                        <div class="mobileCard"><small>PLAN/PRECIO</small><br><span>${esP ? planTexto : formatCRC(c.precio)}</span></div>
                        <div class="mobileCard"><small>ABONADO</small><br><span>${formatCRC(c.abonado)}</span></div>
                        <div class="mobileCard" style="border:1px solid #4caf50"><small>SALDO</small><br><span style="color:#4caf50">${formatCRC(saldo)}</span></div>
                    </div>
                    <div style="margin-top: 15px; display: flex; justify-content: center; gap: 10px;">${actionButtons(c.id)}</div>
                </td>`;
            }
        } else {
            if (section === "prestamos") tr.innerHTML = `<td>${c.fecha || "-"}</td><td>${c.nombre || "-"}</td><td>${formatCRC(c.prestamo)}</td><td>${c.cuota || "-"}</td><td>${formatCRC(c.abonado)}</td><td>${formatCRC(saldo)}</td><td>${actionButtons(c.id)}</td>`;
            else if (section === "contado") tr.innerHTML = `<td>${c.fecha || "-"}</td><td>${c.nombre || "-"}</td><td>${c.producto || "-"}</td><td>${formatCRC(c.costo)}</td><td>${formatCRC(c.precio)}</td><td>${formatCRC((c.precio || 0) - (c.costo || 0))}</td><td>${actionButtons(c.id)}</td>`;
            else tr.innerHTML = `<td>${c.fecha || "-"}</td><td>${c.nombre || "-"}</td><td>${c.producto || "-"}</td><td>${formatCRC(c.costo)}</td><td>${formatCRC(c.precio)}</td><td>${formatCRC(c.prima)}</td><td>${formatCRC(c.abonado)}</td><td>${formatCRC(saldo)}</td><td>${actionButtons(c.id)}</td>`;
        }
        tbody.appendChild(tr);
    }

    removeOldExportButtons();
}

function renderStockUI(thead, tbody, resStock) {
    thead.innerHTML = `<tr><th>Cant.</th><th>Nombre Perfume</th><th>Proveedor</th><th>Costo Unidad</th><th>Capital Invertido</th><th style="width: 200px;">Acciones</th></tr>`;
    let totalCant = 0, totalCap = 0;

    stockData.forEach(item => {
        let capInvertido = item.cantidad * item.costo_unidad;
        totalCant += item.cantidad;
        totalCap += capInvertido;

        let tr = document.createElement("tr");
        tr.style.backgroundColor = "transparent";
        tr.innerHTML = `
            <td style="background: transparent;">${item.cantidad}</td>
            <td style="background: transparent; text-align: left;">${item.nombre_perfume}</td>
            <td style="background: transparent;">${item.proveedor || "N/A"}</td>
            <td style="background: transparent;">${formatCRC(item.costo_unidad)}</td>
            <td style="background: transparent;">${formatCRC(capInvertido)}</td>
            <td style="background: transparent;">
                <div class="accionesStock">
                    <button class="actionBtn abonoBtn" style="font-size: 10px; padding: 5px;" onclick="venderStock('${item.id}', 'Pagos')">Venta pagos</button>
                    <button class="actionBtn saldoBtn" style="font-size: 10px; padding: 5px;" onclick="venderStock('${item.id}', 'Contado')">Venta Contado</button>
                    <button class="actionBtn deleteBtn" style="background: #e74c3c; padding: 5px;" onclick="eliminarStock('${item.id}')">X</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (resStock) {
        resStock.style.display = "grid";
        resStock.style.gridTemplateColumns = "1fr 1fr";
        resStock.style.gap = "10px";
        resStock.style.marginTop = "20px";
        resStock.innerHTML = `
            <div class="metricBox" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); padding: 10px; text-align: center;">
                <h3 style="font-size: 12px; color: #888; margin: 0;">Cant. Perfumes</h3>
                <p style="font-size: 16px; margin: 5px 0 0 0; color: white;">${totalCant}</p>
            </div>
            <div class="metricBox" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); padding: 10px; text-align: center;">
                <h3 style="font-size: 12px; color: #888; margin: 0;">Total Invertido</h3>
                <p style="font-size: 16px; margin: 5px 0 0 0; color: white;">${formatCRC(totalCap)}</p>
            </div>
        `;
    }
}

async function venderStock(id, tipo) {
    const item = stockData.find(s => s.id == id);
    if (!item) return;

    const nuevaCantidad = item.cantidad - 1;
    const textoEstado = tipo === "Pagos" ? "VENTA A PAGOS" : "VENTA CONTADO";

    const historyEntry = {
        nombre: item.nombre_perfume,
        monto: item.costo_unidad,
        section: "stock",
        estado: textoEstado,
        fecha: getCRDate().toISOString().split("T")[0]
    };

    history.push(historyEntry);
    await saveHistoryToSupabase(historyEntry);
    save();

    if (nuevaCantidad <= 0) {
        await supabaseClient.from(TABLE_STOCK).delete().eq("id", id);
    } else {
        await supabaseClient.from(TABLE_STOCK).update({ cantidad: nuevaCantidad }).eq("id", id);
    }
    loadStockFromSupabase();
}

async function eliminarStock(id) {
    if (confirm("¿Seguro que deseas eliminar este registro de stock?")) {
        await supabaseClient.from(TABLE_STOCK).delete().eq("id", id);
        loadStockFromSupabase();
    }
}

function actionButtons(id) {
    if (section === "contado") {
        return `
            <div class="accionesBtns">
                <button class="actionBtn deleteBtn" onclick="deleteClient(${id})">X</button>
            </div>
        `;
    }
    return `
        <div class="accionesBtns">
            <button class="actionBtn abonoBtn" onclick="addPayment(${id})">Abonos</button>
            <button class="actionBtn saldoBtn" onclick="showSaldo(${id})">Saldo</button>
            <button class="actionBtn editBtn" onclick="editPayment(${id})">Editar</button>
            <button class="actionBtn deleteBtn" onclick="deleteClient(${id})">X</button>
        </div>
    `;
}

function showSaldo(id) {
    let c = clients.find(x => x && x.id === id);
    if (!c) return;
    let s = c.section === "prestamos"
        ? (c.totalPrestamo || 0) - (c.abonado || 0)
        : (c.precio || 0) - (c.prima || 0) - (c.abonado || 0);

    document.getElementById("saldoFecha").innerText = c.fechaUltimoAbono || "Sin abonos";
    document.getElementById("saldoUltimo").innerText = formatCRC(c.ultimoAbono);
    document.getElementById("saldoPendiente").innerText = formatCRC(s);
    document.getElementById("saldoCardContainer").style.display = "flex";
}

function cerrarSaldo() {
    document.getElementById("saldoCardContainer").style.display = "none";
}

async function addPayment(id) {
    let m = prompt("Monto abonado");
    if (!m) return;

    let c = clients.find(x => x && x.id === id);
    if (!c) return;

    let montoNum = Number(m);
    c.abonado = (Number(c.abonado) || 0) + montoNum;
    c.ultimoAbono = montoNum;
    c.fechaUltimoAbono = getCRDate().toISOString().split("T")[0];

    await saveHistoryToSupabase({
        nombre: c.nombre,
        monto: montoNum,
        section: c.section,
        estado: "abono"
    });

    await updateSupabase(c);
    save();
    renderTable();
}

async function editPayment(id) {
    let c = clients.find(x => x && x.id === id);
    if (!c) return;

    let n = prompt("Editar último abono", c.ultimoAbono);
    if (!n) return;

    c.abonado = (Number(c.abonado) || 0) - (Number(c.ultimoAbono) || 0) + Number(n);
    c.ultimoAbono = Number(n);
    await updateSupabase(c);
    save();
    renderTable();
}

async function deleteClient(id) {
    let c = clients.find(x => x && x.id === id);
    if (!c) return;

    if (confirm("¿Eliminar cliente?")) {
        const entry = { ...c, estado: "eliminado", fecha: getCRDate().toISOString().split("T")[0] };
        history.push(entry);
        await saveHistoryToSupabase(entry);
        clients = clients.filter(x => x.id !== id);
        await deleteFromSupabase(id);
        save();
        renderTable();
    }
}

function updateGeneral() {
    const CAPITAL_PRESTAMOS_BASE = 150000;
    let gT = 0, cT = 0, aM = 0, primasMes = 0, gC = 0, pGan = 0, pAbo = 0;
    let saldoPrestamosActual = 0;

    const hoyCR = getCRDate();
    const mesActual = hoyCR.getMonth();
    const anioActual = hoyCR.getFullYear();

    clients.forEach(c => {
        if (!c) return;
        const valCosto = Number(c.costo) || 0;
        const valPrecio = Number(c.precio) || 0;
        const valAbonado = Number(c.abonado) || 0;
        const valPrima = Number(c.prima) || 0;

        if (c.section === "prestamos") {
            const saldoPrestamo = (Number(c.totalPrestamo) || 0) - valAbonado;
            if (saldoPrestamo > 0) saldoPrestamosActual += saldoPrestamo;

            pGan += (Number(c.interes) || 0);
            pAbo += valAbonado;
        } else if (c.section === "contado") {
            if (c.fecha) {
                const fRegistro = new Date(c.fecha + "T12:00:00");
                if (fRegistro.getMonth() === mesActual && fRegistro.getFullYear() === anioActual) {
                    gC += (valPrecio - valCosto);
                }
            }
        } else {
            gT += (valPrecio - valCosto);
            let saldo = valPrecio - valPrima - valAbonado;
            if (saldo > 0) cT += saldo;
        }
    });

    history.forEach(h => {
        if (!h.fecha) return;
        const fHistorial = new Date(h.fecha + "T12:00:00");

        if (fHistorial.getMonth() === mesActual && fHistorial.getFullYear() === anioActual) {
            const montoRegistro = Number(h.monto || h.ultimoAbono || 0);

            if (h.section === "perfumes" || h.section === "oro") {
                if (["abono", "VENTA A PAGOS", "cancelado"].includes(h.estado)) {
                    aM += montoRegistro;
                } else if (h.estado === "prima") {
                    primasMes += montoRegistro;
                }
            }
        }
    });

    let sTotal = stockData.reduce((acc, i) => acc + (Number(i.cantidad) * Number(i.costo_unidad)), 0);
    let patrimonioPrestamos = saldoPrestamosActual + cajaPrestamos;
    let capitalPrestamosTotal = CAPITAL_PRESTAMOS_BASE + pGan;
    let patrimonioCalculo = gT + cT + patrimonioPrestamos + sTotal;

    const clientesUnicosSet = new Set();

    clients.forEach(c => {
        if (!c || !c.nombre) return;
        if (!["perfumes", "oro", "prestamos"].includes(c.section)) return;

        const nombreNormalizado = c.nombre.trim().toLowerCase();
        if (nombreNormalizado) {
            clientesUnicosSet.add(nombreNormalizado);
        }
    });

    let totalClientesUnicos = clientesUnicosSet.size;

    let reservaBruta = (aM * 0.30) + (gC * 0.30);
    let reservaDisponible = reservaBruta - reservaGastadaGlobal;
    reservaDisponible = Math.round(reservaDisponible / 500) * 500;

    document.getElementById("gananciaTotal").innerText = formatCRC(gT);
    document.getElementById("capitalTotal").innerText = formatCRC(cT);
    document.getElementById("abonosMes").innerText = formatCRC(aM);

    if (document.getElementById("primasMes")) {
        document.getElementById("primasMes").innerText = formatCRC(primasMes);
    }

    document.getElementById("reservaMensual").innerText = formatCRC(reservaDisponible);
    document.getElementById("gananciaContado").innerText = formatCRC(gC);

    const stockDash = document.getElementById("stockTotalDashboard");
    if (stockDash) stockDash.innerText = formatCRC(sTotal);

    const clientesDash = document.getElementById("clientesUnicos");
    if (clientesDash) clientesDash.innerText = totalClientesUnicos;

    document.getElementById("interesCompuesto").innerText = formatCRC(patrimonioCalculo);
    document.getElementById("prestamoCapital").innerText = formatCRC(capitalPrestamosTotal);
    document.getElementById("prestamoGanancia").innerText = formatCRC(pGan);
    document.getElementById("prestamoAbonos").innerText = formatCRC(pAbo);
}

async function exportPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
        const hoy = getCRDate().toLocaleDateString("es-CR");

        doc.setFontSize(18);
        doc.setTextColor(225, 173, 1);
        doc.text(`ELITE CLUB - REPORTE DE ${section.toUpperCase()}`, 14, 15);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generado: ${hoy} | San José, Costa Rica | Valores numericos`, 14, 22);

        let bodyData = [];
        let head = [];

        if (section === "general") {
            const vGananciaTotal = formatPDF(document.getElementById("gananciaTotal").innerText.replace(/[₡,\s]/g, ""));
            const vCapitalRecuperar = formatPDF(document.getElementById("capitalTotal").innerText.replace(/[₡,\s]/g, ""));
            const vAbonosMes = formatPDF(document.getElementById("abonosMes").innerText.replace(/[₡,\s]/g, ""));
            const vPrimasMes = document.getElementById("primasMes")
                ? formatPDF(document.getElementById("primasMes").innerText.replace(/[₡,\s]/g, ""))
                : "0";
            const vReserva = formatPDF(document.getElementById("reservaMensual").innerText.replace(/[₡,\s]/g, ""));
            const vGananciaContado = formatPDF(document.getElementById("gananciaContado").innerText.replace(/[₡,\s]/g, ""));
            const vStock = document.getElementById("stockTotalDashboard")
                ? formatPDF(document.getElementById("stockTotalDashboard").innerText.replace(/[₡,\s]/g, ""))
                : "0";
            const vClientes = document.getElementById("clientesUnicos")
                ? document.getElementById("clientesUnicos").innerText
                : "0";
            const vPatrimonio = formatPDF(document.getElementById("interesCompuesto").innerText.replace(/[₡,\s]/g, ""));
            const vPreCap = formatPDF(document.getElementById("prestamoCapital").innerText.replace(/[₡,\s]/g, ""));
            const vPreGan = formatPDF(document.getElementById("prestamoGanancia").innerText.replace(/[₡,\s]/g, ""));
            const vPreAbo = formatPDF(document.getElementById("prestamoAbonos").innerText.replace(/[₡,\s]/g, ""));

            doc.autoTable({
                startY: 30,
                head: [["RESUMEN DASHBOARD", "VALOR"]],
                body: [
                    ["Ganancia Total Ventas (Credito)", vGananciaTotal],
                    ["Capital por Recuperar (Calle)", vCapitalRecuperar],
                    ["Total Abonos Recibidos (Mes)", vAbonosMes],
                    ["Total Primas Recibidas (Mes)", vPrimasMes],
                    ["Reserva Disponible (30%)", vReserva],
                    ["Ganancia Ventas Contado", vGananciaContado],
                    ["Total en Stock", vStock],
                    ["Clientes Unicos", vClientes],
                    ["Patrimonio (Ganancia + Calle)", vPatrimonio],
                    ["[Prestamos] Capital Invertido", vPreCap],
                    ["[Prestamos] Ganancia Esperada", vPreGan],
                    ["[Prestamos] Abonos Realizados", vPreAbo]
                ],
                theme: "striped",
                headStyles: { fillColor: [184, 134, 11] },
                styles: { fontSize: 9 }
            });

            const headGen = [["Sección", "Fecha", "Cliente", "Producto", "Total", "Abonado", "Saldo"]];
            clients.forEach(c => {
                if (!c) return;
                let total = c.section === "prestamos" ? (c.totalPrestamo || 0) : (c.precio || 0);
                let saldo = c.section === "prestamos"
                    ? ((c.totalPrestamo || 0) - (c.abonado || 0))
                    : ((c.precio || 0) - (c.prima || 0) - (c.abonado || 0));

                bodyData.push([
                    c.section.toUpperCase(),
                    c.fecha || "-",
                    c.nombre || "-",
                    c.producto || "Préstamo",
                    formatPDF(total),
                    formatPDF(c.abonado),
                    formatPDF(saldo)
                ]);
            });

            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 10,
                head: headGen,
                body: bodyData,
                theme: "grid",
                headStyles: { fillColor: [40, 40, 40] },
                styles: { fontSize: 8 }
            });
        } else if (section === "stock") {
            head = [["Cant.", "Nombre Perfume", "Proveedor", "Costo Unidad", "Capital Invertido"]];
            stockData.forEach(i => {
                const capital = (Number(i.cantidad) || 0) * (Number(i.costo_unidad) || 0);
                bodyData.push([
                    i.cantidad || 0,
                    i.nombre_perfume || "Sin nombre",
                    i.proveedor || "N/A",
                    formatPDF(i.costo_unidad),
                    formatPDF(capital)
                ]);
            });

            doc.autoTable({
                startY: 30,
                head: head,
                body: bodyData,
                theme: "grid",
                headStyles: { fillColor: [184, 134, 11] },
                styles: { fontSize: 8 }
            });
        } else if (section === "contado") {
            head = [["Fecha", "Cliente", "Producto", "Costo", "Precio", "Ganancia"]];
            clients.filter(c => c && c.section === "contado").forEach(c => {
                const ganancia = (c.precio || 0) - (c.costo || 0);
                bodyData.push([
                    c.fecha || "-",
                    c.nombre || "-",
                    c.producto || "-",
                    formatPDF(c.costo),
                    formatPDF(c.precio),
                    formatPDF(ganancia)
                ]);
            });

            doc.autoTable({
                startY: 30,
                head: head,
                body: bodyData,
                theme: "grid",
                headStyles: { fillColor: [184, 134, 11] },
                styles: { fontSize: 8 }
            });
        } else if (section === "prestamos") {
            head = [["Fecha", "Cliente", "Prestamo", "Cuotas", "Abonado", "Saldo"]];
            clients.filter(c => c && c.section === "prestamos").forEach(c => {
                let saldo = (c.totalPrestamo || 0) - (c.abonado || 0);
                bodyData.push([
                    c.fecha || "-",
                    c.nombre || "-",
                    formatPDF(c.prestamo),
                    c.cuota || "-",
                    formatPDF(c.abonado),
                    formatPDF(saldo)
                ]);
            });

            doc.autoTable({
                startY: 30,
                head: head,
                body: bodyData,
                theme: "grid",
                headStyles: { fillColor: [40, 40, 40] },
                styles: { fontSize: 8 }
            });
        } else if (section === "history") {
            head = [["Fecha", "Nombre/Detalle", "Monto", "Tipo", "Sección"]];
            history.forEach(h => {
                bodyData.push([
                    h.fecha || "-",
                    h.nombre || "-",
                    formatPDF(h.monto || h.ultimoAbono),
                    (h.estado || "Registro").toUpperCase(),
                    (h.section || "N/A").toUpperCase()
                ]);
            });

            doc.autoTable({
                startY: 30,
                head: head,
                body: bodyData,
                theme: "grid",
                headStyles: { fillColor: [70, 70, 70] },
                styles: { fontSize: 8 }
            });
        } else {
            head = [["Fecha", "Cliente", "Producto", "Costo", "Precio", "Prima", "Abonado", "Saldo"]];
            clients.filter(c => c && c.section === section).forEach(c => {
                let saldo = (c.precio || 0) - (c.prima || 0) - (c.abonado || 0);
                bodyData.push([
                    c.fecha || "-",
                    c.nombre || "-",
                    c.producto || "-",
                    formatPDF(c.costo),
                    formatPDF(c.precio),
                    formatPDF(c.prima),
                    formatPDF(c.abonado),
                    formatPDF(saldo)
                ]);
            });

            doc.autoTable({
                startY: 30,
                head: head,
                body: bodyData,
                theme: "grid",
                headStyles: { fillColor: [40, 40, 40] },
                styles: { fontSize: 8 }
            });
        }

        doc.save(`Reporte_Elite_${section}_${hoy.replace(/\//g, "-")}.pdf`);
    } catch (err) {
        console.error("Error al exportar:", err);
        alert("Error al generar el PDF.");
    }
}
