// ===== SUPABASE CONFIG =====
const SUPABASE_URL = "https://wpcsqjcaxxckldwfwsrn.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZXxwRu-TXDFdCLhrKtNKfA_emZA1NNN";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLE_NAME = "clients";
const TABLE_STOCK = "stock_movimientos";
const TABLE_HISTORY = "history";
const TABLE_PEDIDOS = "pedidos";
const TABLE_PEDIDO_ITEMS = "pedido_items";

let clients = [];
let stockData = [];
let history = JSON.parse(localStorage.getItem("eliteHistory")) || [];
let pedidos = [];
let section = "general";
let reservaGastadaGlobal = 0;
let capitalInicialPrestamos = 0;
let cajaPrestamos = 0;
let activeSaldoClientId = null;
let pedidoDraft = [];
let pedidosExpanded = new Set();
let pedidosFilterMonth = "";
let tableSearchTerm = "";

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
    return "\u20A1" + Number(num || 0).toLocaleString("es-CR");
}

function formatPDF(num) {
    return Number(num || 0).toLocaleString("es-CR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function getDiaPago(fecha) {
    if (!fecha) return "-";

    const date = new Date(`${fecha}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "-";

    const dias = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    return dias[date.getDay()];
}

function getMonthKey(dateStr) {
    if (!dateStr) return "";
    return String(dateStr).slice(0, 7);
}

function getCurrentMonthKey() {
    return getCRDate().toISOString().slice(0, 7);
}

function getPedidoTotal(pedido) {
    const itemsTotal = (pedido.items || []).reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
    return itemsTotal + (Number(pedido.envio) || 0);
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
    const pedidosWrap = document.getElementById("pedidosContainer");
    const tableSearchWrap = document.getElementById("tableSearchWrap");
    const tableSearchInput = document.getElementById("tableSearchInput");
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

    if (pedidosWrap) {
        if (section === "pedidos") pedidosWrap.style.display = "block";
        else pedidosWrap.style.display = "none";
    }

    const canSearchTable = ["perfumes", "oro", "prestamos", "contado", "gastos"].includes(section);
    if (tableSearchWrap) {
        tableSearchWrap.style.display = canSearchTable ? "flex" : "none";
    }
    if (tableSearchInput) {
        if (!canSearchTable) {
            tableSearchTerm = "";
            tableSearchInput.value = "";
        } else {
            tableSearchInput.placeholder = section === "gastos" ? "Buscar gasto por comercio o detalle" : "Buscar cliente por nombre";
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
    loadPedidosFromSupabase();
    toggleSectionExtras();
});

window.addEventListener("resize", renderTable);

document.getElementById("btnAgregarPedidoItem")?.addEventListener("click", addPedidoItemToDraft);
document.getElementById("envioPedido")?.addEventListener("input", renderPedidoDraft);
document.getElementById("perfumePedido")?.addEventListener("input", renderPedidoDraft);
document.getElementById("cantidadPedido")?.addEventListener("input", renderPedidoDraft);
document.getElementById("precioPedido")?.addEventListener("input", renderPedidoDraft);
document.getElementById("tableSearchInput")?.addEventListener("input", (e) => {
    tableSearchTerm = (e.target.value || "").trim().toLowerCase();
    renderTable();
});

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
            client_id: entry.client_id || entry.id || null,
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
                client_id: d.client_id || null,
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

async function loadPedidosFromSupabase() {
    try {
        const { data: pedidosData, error: pedidosError } = await supabaseClient
            .from(TABLE_PEDIDOS)
            .select("*")
            .order("fecha", { ascending: false })
            .order("id", { ascending: false });

        const { data: itemsData, error: itemsError } = await supabaseClient
            .from(TABLE_PEDIDO_ITEMS)
            .select("*")
            .order("id", { ascending: true });

        if (pedidosError) throw pedidosError;
        if (itemsError) throw itemsError;

        const itemsByPedido = (itemsData || []).reduce((acc, item) => {
            const pedidoId = Number(item.pedido_id);
            if (!acc[pedidoId]) acc[pedidoId] = [];
            acc[pedidoId].push(item);
            return acc;
        }, {});

        pedidos = (pedidosData || []).map(pedido => ({
            ...pedido,
            items: itemsByPedido[Number(pedido.id)] || []
        }));

        if (!pedidosFilterMonth) pedidosFilterMonth = getCurrentMonthKey();

        if (section === "pedidos") renderTable();
        updateGeneral();
    } catch (err) {
        console.error("Error cargando pedidos:", err);
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
        if (sec === "pedidos") loadPedidosFromSupabase();
        renderTable();
    }
}

function adjustForm() {
    const isStock = section === "stock";
    const isPrestamo = section === "prestamos";
    const isContado = section === "contado";
    const isPedidos = section === "pedidos";
    const isGastos = section === "gastos";

    const nombreInput = document.getElementById("nombre");
    const productoInput = document.getElementById("producto");
    const costoInput = document.getElementById("costo");
    const precioInput = document.getElementById("precio");
    const primaInput = document.getElementById("prima");
    const whatsappInput = document.getElementById("whatsapp");

    nombreInput.placeholder = isGastos ? "Nombre del comercio" : "Cliente";
    productoInput.placeholder = isGastos ? "Detalle del gasto" : "Producto";
    costoInput.placeholder = isGastos ? "Monto del gasto" : "Costo producto";
    precioInput.placeholder = "Precio venta";
    primaInput.placeholder = "Prima";
    whatsappInput.placeholder = "Whatsapp";

    nombreInput.style.display = (isStock || isPedidos) ? "none" : "block";
    productoInput.style.display = (isPrestamo || isStock || isPedidos) ? "none" : "block";
    costoInput.style.display = (isPrestamo || isStock || isPedidos) ? "none" : "block";
    precioInput.style.display = (isPrestamo || isStock || isPedidos || isGastos) ? "none" : "block";
    primaInput.style.display = (isContado || isPrestamo || isStock || isPedidos || isGastos) ? "none" : "block";
    whatsappInput.style.display = (isContado || isStock || isPedidos || isGastos) ? "none" : "block";
    document.getElementById("prestamo").style.display = isPrestamo ? "block" : "none";
    document.getElementById("tipoPrestamo").style.display = isPrestamo ? "block" : "none";

    document.getElementById("nombrePerfume").style.display = isStock ? "block" : "none";
    document.getElementById("cantidadStock").style.display = isStock ? "block" : "none";
    document.getElementById("costoStock").style.display = isStock ? "block" : "none";
    document.getElementById("proveedorStock").style.display = isStock ? "block" : "none";

    document.getElementById("proveedorPedido").style.display = isPedidos ? "block" : "none";
    document.getElementById("perfumePedido").style.display = isPedidos ? "block" : "none";
    document.getElementById("cantidadPedido").style.display = isPedidos ? "block" : "none";
    document.getElementById("precioPedido").style.display = isPedidos ? "block" : "none";
    document.getElementById("envioPedido").style.display = isPedidos ? "block" : "none";
    document.getElementById("pedidoDraftContainer").style.display = isPedidos ? "block" : "none";
    document.getElementById("pedidoButtons").style.display = isPedidos ? "grid" : "none";
    document.getElementById("btnRegistrar").style.display = isPedidos ? "none" : "block";

    renderPedidoDraft();
}

function resetPedidoInputs() {
    document.getElementById("perfumePedido").value = "";
    document.getElementById("cantidadPedido").value = "";
    document.getElementById("precioPedido").value = "";
}

function renderPedidoDraft() {
    const draftList = document.getElementById("pedidoDraftList");
    const draftTotal = document.getElementById("pedidoDraftTotal");
    if (!draftList || !draftTotal) return;

    const envio = Number(document.getElementById("envioPedido")?.value || 0);
    const perfumePreview = (document.getElementById("perfumePedido")?.value || "").trim();
    const cantidadPreview = Number(document.getElementById("cantidadPedido")?.value || 0);
    const precioPreview = Number(document.getElementById("precioPedido")?.value || 0);
    const previewSubtotal = (perfumePreview && cantidadPreview > 0 && precioPreview > 0)
        ? cantidadPreview * precioPreview
        : 0;
    const itemsTotal = pedidoDraft.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
    draftTotal.innerText = formatCRC(itemsTotal + envio + previewSubtotal);

    if (!pedidoDraft.length) {
        draftList.innerHTML = previewSubtotal > 0
            ? `
                <div class="pedidoDraftItem pedidoDraftPreview">
                    <div>
                        <strong>${cantidadPreview}x ${perfumePreview}</strong>
                        <small>Vista previa antes de agregar</small>
                    </div>
                    <div class="pedidoDraftItemActions">
                        <span>${formatCRC(previewSubtotal)}</span>
                    </div>
                </div>
            `
            : `<div class="pedidoDraftEmpty">Todavia no has agregado perfumes a este pedido.</div>`;
        return;
    }

    let draftHtml = pedidoDraft.map((item, index) => `
        <div class="pedidoDraftItem">
            <div>
                <strong>${item.cantidad}x ${item.nombre_perfume}</strong>
                <small>${formatCRC(item.precio)} c/u</small>
            </div>
            <div class="pedidoDraftItemActions">
                <span>${formatCRC(item.subtotal)}</span>
                <button type="button" onclick="removePedidoDraftItem(${index})">X</button>
            </div>
        </div>
    `).join("");

    if (previewSubtotal > 0) {
        draftHtml += `
            <div class="pedidoDraftItem pedidoDraftPreview">
                <div>
                    <strong>${cantidadPreview}x ${perfumePreview}</strong>
                    <small>Vista previa antes de agregar</small>
                </div>
                <div class="pedidoDraftItemActions">
                    <span>${formatCRC(previewSubtotal)}</span>
                </div>
            </div>
        `;
    }

    draftList.innerHTML = draftHtml;
}

function addPedidoItemToDraft() {
    const fecha = (document.getElementById("fecha").value || "").trim();
    const proveedor = (document.getElementById("proveedorPedido").value || "").trim();
    const perfume = (document.getElementById("perfumePedido").value || "").trim();
    const cantidad = Number(document.getElementById("cantidadPedido").value || 0);
    const precio = Number(document.getElementById("precioPedido").value || 0);

    if (!fecha || !proveedor) {
        alert("Primero completa la fecha y el proveedor del pedido.");
        return;
    }

    if (!perfume || cantidad <= 0 || precio <= 0) {
        alert("Completa nombre del perfume, cantidad y precio para agregarlo al pedido.");
        return;
    }

    pedidoDraft.push({
        nombre_perfume: perfume,
        cantidad,
        precio,
        subtotal: cantidad * precio
    });

    resetPedidoInputs();
    renderPedidoDraft();
}

function removePedidoDraftItem(index) {
    pedidoDraft.splice(index, 1);
    renderPedidoDraft();
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

    if (section === "pedidos") {
        const fecha = document.getElementById("fecha").value;
        const proveedor = (document.getElementById("proveedorPedido").value || "").trim();
        const envio = Number(document.getElementById("envioPedido").value || 0);

        if (!fecha || !proveedor || !pedidoDraft.length) {
            alert("Completa fecha, proveedor y agrega al menos un perfume al pedido.");
            return;
        }

        const totalPedido = pedidoDraft.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0) + envio;
        const { data: pedidoData, error: pedidoError } = await supabaseClient
            .from(TABLE_PEDIDOS)
            .insert([{
                fecha,
                proveedor,
                envio,
                total: totalPedido
            }])
            .select()
            .single();

        if (pedidoError || !pedidoData) {
            console.error("Error guardando pedido:", pedidoError);
            alert("No se pudo registrar el pedido.");
            return;
        }

        const itemsPayload = pedidoDraft.map(item => ({
            pedido_id: pedidoData.id,
            nombre_perfume: item.nombre_perfume,
            cantidad: item.cantidad,
            precio: item.precio,
            subtotal: item.subtotal
        }));

        const { error: itemsError } = await supabaseClient.from(TABLE_PEDIDO_ITEMS).insert(itemsPayload);
        if (itemsError) {
            console.error("Error guardando detalle de pedido:", itemsError);
            alert("El pedido se guardó incompleto. Revisa Supabase.");
            return;
        }

        pedidoDraft = [];
        pedidosExpanded.delete(Number(pedidoData.id));
        e.target.reset();
        renderPedidoDraft();
        await loadPedidosFromSupabase();
        return;
    }

    if (section === "gastos") {
        const gasto = {
            id: Date.now(),
            section,
            fecha: document.getElementById("fecha").value,
            nombre: (document.getElementById("nombre").value || "").trim(),
            producto: (document.getElementById("producto").value || "").trim(),
            costo: Number(document.getElementById("costo").value) || 0,
            precio: 0,
            prima: 0,
            prestamo: 0,
            whatsapp: "",
            abonado: 0,
            ultimoAbono: 0,
            fechaUltimoAbono: "",
            cuota: "",
            interes: 0,
            totalPrestamo: 0
        };

        if (!gasto.fecha || !gasto.nombre || gasto.costo <= 0) {
            alert("Completa fecha, comercio y monto del gasto.");
            return;
        }

        clients.unshift(gasto);
        await saveToSupabase(gasto);
        save();
        renderTable();
        e.target.reset();
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
    let pedidosWrap = document.getElementById("pedidosContainer");
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

    if (section === "pedidos") {
        if (mainTable) mainTable.style.display = "none";
        if (resStock) resStock.style.display = "none";
        renderPedidosUI(pedidosWrap);
        removeOldExportButtons();
        return;
    }

    if (mainTable) mainTable.style.display = "table";

    if (section === "prestamos") thead.innerHTML = `<tr><th>Fecha</th><th>Cliente</th><th>Dia de Pago</th><th>Prestamo</th><th>Cuotas</th><th>Abonado</th><th>Saldo</th><th>Acciones</th></tr>`;
    else if (section === "contado") thead.innerHTML = `<tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Costo</th><th>Precio</th><th>Ganancia</th><th>Acciones</th></tr>`;
    else if (section === "gastos") thead.innerHTML = `<tr><th>Fecha</th><th>Comercio</th><th>Detalle</th><th>Monto</th><th>Acciones</th></tr>`;
    else thead.innerHTML = `<tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Costo</th><th>Precio</th><th>Prima</th><th>Abonado</th><th>Saldo</th><th>Acciones</th></tr>`;

    const filteredClients = clients.filter(c => {
        if (!c || c.section !== section) return false;
        if (!tableSearchTerm) return true;
        const nombre = (c.nombre || "").trim().toLowerCase();
        const producto = (c.producto || "").trim().toLowerCase();
        return nombre.includes(tableSearchTerm) || (section === "gastos" && producto.includes(tableSearchTerm));
    });

    for (const c of filteredClients) {
        if (section === "gastos") {
            let tr = document.createElement("tr");
            if (isMobile) {
                tr.innerHTML = `<td colspan="100%" style="padding: 15px 0; border: none; background: transparent;">
                    <div style="text-align: center; color: white; margin-bottom: 12px;">
                        <strong style="font-size: 1.4em; letter-spacing: 0.5px;">${c.nombre || "Sin comercio"}</strong><br>
                        <small style="color: #888; font-size: 0.9em;">${c.fecha || "-"}</small>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; box-sizing: border-box; padding: 0 5px;">
                        <div class="mobileCard"><small>DETALLE</small><br><span>${c.producto || "-"}</span></div>
                        <div class="mobileCard gastoMobileAmount"><small>MONTO</small><br><span>${formatCRC(c.costo)}</span></div>
                    </div>
                    <div style="margin-top: 15px; display: flex; justify-content: center; gap: 10px;">${actionButtons(c.id)}</div>
                </td>`;
            } else {
                tr.innerHTML = `<td>${c.fecha || "-"}</td><td>${c.nombre || "-"}</td><td>${c.producto || "-"}</td><td class="gastoAmount">${formatCRC(c.costo)}</td><td>${actionButtons(c.id)}</td>`;
            }
            tbody.appendChild(tr);
            continue;
        }

        let saldo = c.section === "prestamos"
            ? (c.totalPrestamo || 0) - (c.abonado || 0)
            : (c.precio || 0) - (c.prima || 0) - (c.abonado || 0);

        if (saldo <= 0) {
            const entry = { ...c, client_id: c.id, estado: "cancelado", fecha: getCRDate().toISOString().split("T")[0] };
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
                const diaPagoCard = esP ? `<div class="mobileCard"><small>DIA DE PAGO</small><br><span>${getDiaPago(c.fecha)}</span></div>` : "";
                tr.innerHTML = `<td colspan="100%" style="padding: 15px 0; border: none; background: transparent;">
                    <div style="text-align: center; color: white; margin-bottom: 12px;">
                        <strong style="font-size: 1.4em; letter-spacing: 0.5px;">${c.nombre || "Sin nombre"}</strong><br>
                        <small style="color: #888; font-size: 0.9em;">${c.fecha || "-"}</small>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; box-sizing: border-box; padding: 0 5px;">
                        ${diaPagoCard}
                        <div class="mobileCard"><small>DETALLE</small><br><span>${esP ? formatCRC(c.prestamo) : (c.producto || "-")}</span></div>
                        <div class="mobileCard"><small>PLAN/PRECIO</small><br><span>${esP ? planTexto : formatCRC(c.precio)}</span></div>
                        <div class="mobileCard"><small>ABONADO</small><br><span>${formatCRC(c.abonado)}</span></div>
                        <div class="mobileCard" style="border:1px solid #4caf50"><small>SALDO</small><br><span style="color:#4caf50">${formatCRC(saldo)}</span></div>
                    </div>
                    <div style="margin-top: 15px; display: flex; justify-content: center; gap: 10px;">${actionButtons(c.id)}</div>
                </td>`;
            }
        } else {
            if (section === "prestamos") tr.innerHTML = `<td>${c.fecha || "-"}</td><td>${c.nombre || "-"}</td><td>${getDiaPago(c.fecha)}</td><td>${formatCRC(c.prestamo)}</td><td>${c.cuota === "Indefinidas" ? c.cuota : formatCRC(c.cuota)}</td><td>${formatCRC(c.abonado)}</td><td>${formatCRC(saldo)}</td><td>${actionButtons(c.id)}</td>`;
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

function togglePedidoItems(pedidoId) {
    const numericId = Number(pedidoId);
    if (pedidosExpanded.has(numericId)) pedidosExpanded.delete(numericId);
    else pedidosExpanded.add(numericId);
    renderTable();
}

async function syncPedidoTotal(pedidoId) {
    const pedido = pedidos.find(p => Number(p.id) === Number(pedidoId));
    if (!pedido) return;

    const totalActualizado = getPedidoTotal(pedido);
    pedido.total = totalActualizado;

    const { error } = await supabaseClient
        .from(TABLE_PEDIDOS)
        .update({ total: totalActualizado })
        .eq("id", pedidoId);

    if (error) {
        console.error("Error actualizando total del pedido:", error);
        alert("No se pudo actualizar el total del pedido.");
        return;
    }

    updateGeneral();
}

async function editPedido(pedidoId) {
    const pedido = pedidos.find(p => Number(p.id) === Number(pedidoId));
    if (!pedido || !(pedido.items || []).length) {
        alert("Este pedido no tiene perfumes para editar.");
        return;
    }

    const resumen = pedido.items
        .map((item, index) => `${index + 1}. ${item.cantidad}x ${item.nombre_perfume} - ${formatCRC(item.precio)}`)
        .join("\n");

    const seleccion = prompt(`Selecciona el número del perfume que deseas editar:\n\n${resumen}`);
    if (!seleccion) return;

    const index = Number(seleccion) - 1;
    const item = pedido.items[index];
    if (!item) {
        alert("Selecciona un número válido.");
        return;
    }

    const nuevoNombre = prompt("Editar nombre del perfume", item.nombre_perfume);
    if (nuevoNombre === null || !nuevoNombre.trim()) return;

    const nuevaCantidad = prompt("Editar cantidad", item.cantidad);
    if (nuevaCantidad === null) return;

    const nuevoPrecio = prompt("Editar precio unitario", item.precio);
    if (nuevoPrecio === null) return;

    const cantidadNum = Number(nuevaCantidad);
    const precioNum = Number(nuevoPrecio);
    if (cantidadNum <= 0 || precioNum <= 0) {
        alert("Cantidad y precio deben ser mayores a cero.");
        return;
    }

    const payload = {
        nombre_perfume: nuevoNombre.trim(),
        cantidad: cantidadNum,
        precio: precioNum,
        subtotal: cantidadNum * precioNum
    };

    const { error } = await supabaseClient
        .from(TABLE_PEDIDO_ITEMS)
        .update(payload)
        .eq("id", item.id);

    if (error) {
        console.error("Error editando item del pedido:", error);
        alert("No se pudo editar el perfume del pedido.");
        return;
    }

    Object.assign(item, payload);
    await syncPedidoTotal(pedidoId);
    renderTable();
}

async function addPerfumeToPedido(pedidoId) {
    const pedido = pedidos.find(p => Number(p.id) === Number(pedidoId));
    if (!pedido) return;

    const nombre = prompt("Nombre del perfume a agregar");
    if (!nombre || !nombre.trim()) return;

    const cantidad = prompt("Cantidad", "1");
    if (cantidad === null) return;

    const precio = prompt("Precio unitario");
    if (precio === null) return;

    const cantidadNum = Number(cantidad);
    const precioNum = Number(precio);
    if (cantidadNum <= 0 || precioNum <= 0) {
        alert("Cantidad y precio deben ser mayores a cero.");
        return;
    }

    const payload = {
        pedido_id: pedidoId,
        nombre_perfume: nombre.trim(),
        cantidad: cantidadNum,
        precio: precioNum,
        subtotal: cantidadNum * precioNum
    };

    const { data, error } = await supabaseClient
        .from(TABLE_PEDIDO_ITEMS)
        .insert([payload])
        .select()
        .single();

    if (error || !data) {
        console.error("Error agregando perfume al pedido:", error);
        alert("No se pudo agregar el perfume al pedido.");
        return;
    }

    pedido.items.push(data);
    await syncPedidoTotal(pedidoId);
    renderTable();
}

function openWhatsApp(id) {
    const client = clients.find(x => x && x.id === id);
    if (!client) return;

    const rawPhone = String(client.whatsapp || "").trim();
    if (!rawPhone) {
        alert("Este cliente no tiene numero de Whatsapp registrado.");
        return;
    }

    let phone = rawPhone.replace(/\D/g, "");
    if (phone.length === 8) phone = `506${phone}`;

    const message = "Pura vida! paso a recordarte el abono de hoy, gracias por tu responsabilidad como siempre.";
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
}

function renderPedidosUI(container) {
    if (!container) return;

    if (!pedidosFilterMonth) pedidosFilterMonth = getCurrentMonthKey();

    const pedidosFiltrados = pedidos.filter(p => getMonthKey(p.fecha) === pedidosFilterMonth);
    const totalInvertido = pedidosFiltrados.reduce((acc, pedido) => acc + getPedidoTotal(pedido), 0);

    container.innerHTML = `
        <div class="pedidosToolbar">
            <div>
                <h2>Historial de compras del mes</h2>
                <p>Consulta los pedidos registrados y el total invertido del periodo seleccionado.</p>
            </div>
            <div class="pedidosFilterBox">
                <label for="pedidosMonthFilter">Mes a consultar</label>
                <input type="month" id="pedidosMonthFilter" value="${pedidosFilterMonth}">
            </div>
        </div>
        <div class="pedidosResumenCard">
            <span>Total invertido del mes</span>
            <strong>${formatCRC(totalInvertido)}</strong>
        </div>
        <div class="pedidosCardsGrid">
            ${pedidosFiltrados.length ? pedidosFiltrados.map(pedido => {
                const items = pedido.items || [];
                const expanded = pedidosExpanded.has(Number(pedido.id));
                const visibleItems = expanded ? items : items.slice(0, 5);
                const hiddenCount = Math.max(items.length - 5, 0);

                return `
                    <article class="pedidoCardVoucher">
                        <div class="pedidoCardTop">
                            <div>
                                <p class="pedidoProveedor">${pedido.proveedor || "Proveedor sin nombre"}</p>
                                <small>${pedido.fecha || "-"}</small>
                            </div>
                            <span class="pedidoNumero">#${pedido.numero_pedido || pedido.id}</span>
                        </div>
                        <div class="pedidoMeta">
                            <div>
                                <span>Perfumes</span>
                                <strong>${items.length}</strong>
                            </div>
                            <div>
                                <span>Envio</span>
                                <strong>${formatCRC(pedido.envio)}</strong>
                            </div>
                        </div>
                        <div class="pedidoItemsList">
                            ${visibleItems.map(item => `
                                <div class="pedidoItemRow">
                                    <span>${item.cantidad}x ${item.nombre_perfume}</span>
                                    <strong>${formatCRC(item.subtotal)}</strong>
                                </div>
                            `).join("")}
                        </div>
                        <div class="pedidoCardActions">
                            <button type="button" class="pedidoActionBtn pedidoEditBtn" onclick="editPedido(${pedido.id})">Editar</button>
                            <button type="button" class="pedidoActionBtn pedidoAddBtn" onclick="addPerfumeToPedido(${pedido.id})">Agregar perfume</button>
                        </div>
                        ${hiddenCount > 0 ? `<button type="button" class="pedidoExpandBtn" onclick="togglePedidoItems(${pedido.id})">${expanded ? "Ocultar lista completa" : `Mostrar lista completa (+${hiddenCount})`}</button>` : ""}
                        <div class="pedidoTotalRow">
                            <span>Total</span>
                            <strong>${formatCRC(getPedidoTotal(pedido))}</strong>
                        </div>
                    </article>
                `;
            }).join("") : `<div class="pedidoEmptyState">No hay pedidos registrados para este mes.</div>`}
        </div>
    `;

    const filterInput = document.getElementById("pedidosMonthFilter");
    if (filterInput) {
        filterInput.addEventListener("change", (e) => {
            pedidosFilterMonth = e.target.value || getCurrentMonthKey();
            renderPedidosUI(container);
        });
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
    if (section === "contado" || section === "gastos") {
        return `
            <div class="accionesBtns">
                <button class="actionBtn deleteBtn" onclick="deleteClient(${id})">X</button>
            </div>
        `;
    }

    const showWhatsapp = ["perfumes", "oro", "prestamos"].includes(section);

    return `
        <div class="accionesBtns">
            <button class="actionBtn abonoBtn" onclick="addPayment(${id})">Abonos</button>
            ${showWhatsapp ? `<button class="actionBtn whatsappBtn" onclick="openWhatsApp(${id})">Whatsapp</button>` : ""}
            <button class="actionBtn saldoBtn" onclick="showSaldo(${id})">Saldo</button>
            <button class="actionBtn editBtn" onclick="editPayment(${id})">Editar</button>
            <button class="actionBtn deleteBtn" onclick="deleteClient(${id})">X</button>
        </div>
    `;
}

function getClientPaymentHistory(client) {
    if (!client) return [];

    return history
        .filter(h => {
            if (!h) return false;
            if (Number(h.client_id || 0) !== Number(client.id || 0)) return false;
            return ["abono", "cancelado", "prima"].includes((h.estado || h.tipo_operacion || "").toLowerCase());
        })
        .sort((a, b) => new Date((b.fecha || "") + "T12:00:00") - new Date((a.fecha || "") + "T12:00:00"));
}

function getLegacyClientPaymentHistory(client) {
    if (!client) return [];

    const sameNameAccounts = clients
        .filter(c => {
            if (!c) return false;
            if ((c.section || "") !== (client.section || "")) return false;
            return (c.nombre || "").trim().toLowerCase() === (client.nombre || "").trim().toLowerCase();
        })
        .sort((a, b) => {
            const dateA = new Date((a.fecha || "1900-01-01") + "T12:00:00").getTime();
            const dateB = new Date((b.fecha || "1900-01-01") + "T12:00:00").getTime();
            if (dateA !== dateB) return dateA - dateB;
            return Number(a.id || 0) - Number(b.id || 0);
        });

    const currentIndex = sameNameAccounts.findIndex(c => Number(c.id || 0) === Number(client.id || 0));
    const currentStart = new Date((client.fecha || "1900-01-01") + "T12:00:00").getTime();
    const nextAccount = currentIndex >= 0 ? sameNameAccounts[currentIndex + 1] : null;
    const nextStart = nextAccount
        ? new Date((nextAccount.fecha || "1900-01-01") + "T12:00:00").getTime()
        : Number.POSITIVE_INFINITY;

    return history
        .filter(h => {
            if (!h) return false;
            if (h.client_id) return false;
            if ((h.section || "") !== (client.section || "")) return false;
            if ((h.nombre || "").trim().toLowerCase() !== (client.nombre || "").trim().toLowerCase()) return false;
            if (!["abono", "cancelado", "prima"].includes((h.estado || h.tipo_operacion || "").toLowerCase())) return false;

            const historyTime = new Date((h.fecha || "1900-01-01") + "T12:00:00").getTime();
            return historyTime >= currentStart && historyTime < nextStart;
        })
        .sort((a, b) => new Date((b.fecha || "") + "T12:00:00") - new Date((a.fecha || "") + "T12:00:00"));
}

function hasLegacyHistoryEntries(client) {
    if (!client) return false;

    return history.some(h => {
        if (!h) return false;
        if (h.client_id) return false;
        if ((h.section || "") !== (client.section || "")) return false;
        if ((h.nombre || "").trim().toLowerCase() !== (client.nombre || "").trim().toLowerCase()) return false;
        return ["abono", "cancelado", "prima"].includes((h.estado || h.tipo_operacion || "").toLowerCase());
    });
}

function renderSaldoHistory(client) {
    const historyList = document.getElementById("saldoHistoryList");
    const historyBox = document.getElementById("saldoHistoryBox");
    const historyBtn = document.querySelector(".saldoHistoryBtn");
    if (!historyList || !historyBox || !historyBtn) return;

    const linkedHistory = getClientPaymentHistory(client);
    const legacyHistory = getLegacyClientPaymentHistory(client);
    const clientHistory = linkedHistory.length ? linkedHistory : legacyHistory;
    const hasLegacyEntries = hasLegacyHistoryEntries(client);

    if (!clientHistory.length) {
        historyList.innerHTML = hasLegacyEntries
            ? `<div class="saldoHistoryEmpty">Esta cuenta no tiene pagos vinculados por id. Hay movimientos antiguos con el mismo nombre, pero quedaron sin enlazar a una cuenta exacta.</div>`
            : `<div class="saldoHistoryEmpty">No hay pagos registrados para esta cuenta.</div>`;
    } else {
        historyList.innerHTML = clientHistory.map(item => {
            const tipo = item.estado || item.tipo_operacion || "movimiento";
            return `
                <div class="saldoHistoryItem">
                    <div>
                        <strong>${tipo.toUpperCase()}</strong>
                        <small>${item.fecha || "Sin fecha"}</small>
                    </div>
                    <span>${formatCRC(item.monto || item.ultimoAbono)}</span>
                </div>
            `;
        }).join("");
    }

    historyBox.style.display = "block";
    historyBtn.innerText = "Ocultar historial";
}

function showSaldo(id) {
    let c = clients.find(x => x && x.id === id);
    if (!c) return;
    let s = c.section === "prestamos"
        ? (c.totalPrestamo || 0) - (c.abonado || 0)
        : (c.precio || 0) - (c.prima || 0) - (c.abonado || 0);

    activeSaldoClientId = id;
    const saldoLabels = {
        saldoFechaLabel: "Fecha ultimo abono:",
        saldoMontoLabel: "Monto ultimo abono:",
        saldoPendienteLabel: "Saldo pendiente:"
    };
    Object.entries(saldoLabels).forEach(([labelId, labelText]) => {
        const label = document.getElementById(labelId);
        if (label) label.textContent = labelText;
    });
    document.getElementById("saldoFecha").innerText = c.fechaUltimoAbono || "Sin abonos";
    document.getElementById("saldoUltimo").innerText = formatCRC(c.ultimoAbono);
    document.getElementById("saldoPendiente").innerText = formatCRC(s);
    document.getElementById("saldoHistoryBox").style.display = "none";
    document.getElementById("saldoHistoryList").innerHTML = "";
    document.querySelector(".saldoHistoryBtn").innerText = "Historial de pagos";
    document.getElementById("saldoCardContainer").style.display = "flex";
}

function toggleSaldoHistory() {
    const historyBox = document.getElementById("saldoHistoryBox");
    const historyBtn = document.querySelector(".saldoHistoryBtn");
    const client = clients.find(x => x && x.id === activeSaldoClientId);
    if (!historyBox || !historyBtn || !client) return;

    if (historyBox.style.display === "block") {
        historyBox.style.display = "none";
        historyBtn.innerText = "Historial de pagos";
        return;
    }

    renderSaldoHistory(client);
}

function cerrarSaldo() {
    activeSaldoClientId = null;
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

    const historyEntry = {
        client_id: c.id,
        nombre: c.nombre,
        monto: montoNum,
        section: c.section,
        estado: "abono",
        fecha: c.fechaUltimoAbono
    };

    history.unshift(historyEntry);

    await saveHistoryToSupabase(historyEntry);

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
        const entry = { ...c, client_id: c.id, estado: "eliminado", fecha: getCRDate().toISOString().split("T")[0] };
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
    let pedidosMes = 0;
    let gastosMes = 0;

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
        } else if (c.section === "gastos") {
            if (c.fecha) {
                const fRegistro = new Date(c.fecha + "T12:00:00");
                if (fRegistro.getMonth() === mesActual && fRegistro.getFullYear() === anioActual) {
                    gastosMes += valCosto;
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

    pedidos.forEach(pedido => {
        if (!pedido || !pedido.fecha) return;
        const fPedido = new Date(pedido.fecha + "T12:00:00");
        if (fPedido.getMonth() === mesActual && fPedido.getFullYear() === anioActual) {
            pedidosMes += getPedidoTotal(pedido);
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
    reservaDisponible = Math.max(0, reservaDisponible);

    document.getElementById("gananciaTotal").innerText = formatCRC(gT);
    document.getElementById("capitalTotal").innerText = formatCRC(cT);
    document.getElementById("abonosMes").innerText = formatCRC(aM);

    if (document.getElementById("primasMes")) {
        document.getElementById("primasMes").innerText = formatCRC(primasMes);
    }

    document.getElementById("reservaMensual").innerText = formatCRC(reservaDisponible);
    document.getElementById("pedidosMesTotal").innerText = formatCRC(pedidosMes);
    document.getElementById("gananciaContado").innerText = formatCRC(gC);

    const gastosDash = document.getElementById("gastosMesTotal");
    if (gastosDash) gastosDash.innerText = formatCRC(gastosMes);

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
            const vGastos = document.getElementById("gastosMesTotal")
                ? formatPDF(document.getElementById("gastosMesTotal").innerText.replace(/[₡,\s]/g, ""))
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
                    ["Gastos del Mes", vGastos],
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
        } else if (section === "pedidos") {
            head = [["Pedido", "Fecha", "Proveedor", "Items", "Envio", "Total"]];
            const pedidosPdf = pedidos.filter(p => getMonthKey(p.fecha) === (pedidosFilterMonth || getCurrentMonthKey()));
            pedidosPdf.forEach(p => {
                bodyData.push([
                    `#${p.numero_pedido || p.id}`,
                    p.fecha || "-",
                    p.proveedor || "-",
                    String((p.items || []).length),
                    formatPDF(p.envio),
                    formatPDF(getPedidoTotal(p))
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

            pedidosPdf.forEach(p => {
                const detalleBody = (p.items || []).map(item => [
                    `${item.cantidad || 0}x`,
                    item.nombre_perfume || "-",
                    formatPDF(item.precio),
                    formatPDF(item.subtotal)
                ]);

                if (Number(p.envio || 0) > 0) {
                    detalleBody.push(["1x", "Envio", formatPDF(p.envio), formatPDF(p.envio)]);
                }

                detalleBody.push(["", "", "TOTAL", formatPDF(getPedidoTotal(p))]);

                doc.autoTable({
                    startY: doc.lastAutoTable.finalY + 10,
                    head: [[`DETALLE PEDIDO #${p.numero_pedido || p.id}`, `${p.proveedor || "-"}`, `${p.fecha || "-"}`, ""]],
                    body: detalleBody,
                    theme: "grid",
                    headStyles: { fillColor: [40, 40, 40] },
                    styles: { fontSize: 8 },
                    columnStyles: {
                        0: { cellWidth: 22 },
                        1: { cellWidth: 110 },
                        2: { cellWidth: 30, halign: "right" },
                        3: { cellWidth: 30, halign: "right" }
                    }
                });
            });
        } else if (section === "gastos") {
            head = [["Fecha", "Comercio", "Detalle", "Monto"]];
            clients.filter(c => c && c.section === "gastos").forEach(c => {
                bodyData.push([
                    c.fecha || "-",
                    c.nombre || "-",
                    c.producto || "-",
                    formatPDF(c.costo)
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
            head = [["Fecha", "Cliente", "Dia de Pago", "Prestamo", "Cuotas", "Abonado", "Saldo"]];
            clients.filter(c => c && c.section === "prestamos").forEach(c => {
                let saldo = (c.totalPrestamo || 0) - (c.abonado || 0);
                bodyData.push([
                    c.fecha || "-",
                    c.nombre || "-",
                    getDiaPago(c.fecha),
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
