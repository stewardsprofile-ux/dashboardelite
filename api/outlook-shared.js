const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = (authority) => `https://login.microsoftonline.com/${authority}/oauth2/v2.0/token`;

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) throw new Error(`Missing environment variable: ${name}`);
    return value;
}

function getBaseUrl(req) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    return `${protocol}://${host}`;
}

function getRedirectUri(req) {
    return process.env.MICROSOFT_REDIRECT_URI || `${getBaseUrl(req)}/api/outlook-auth-callback`;
}

function getMicrosoftAuthority() {
    // Personal Microsoft accounts (hotmail/outlook/live) work more reliably through common.
    return process.env.MICROSOFT_AUTHORITY || "common";
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const details = data?.error?.message || data?.error_description || text || response.statusText;
        throw new Error(`${response.status} ${details}`);
    }

    return data;
}

async function exchangeCodeForTokens(req, code) {
    const params = new URLSearchParams({
        client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
        client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectUri(req),
        scope: "offline_access User.Read Mail.Read"
    });

    return fetchJson(TOKEN_URL(getMicrosoftAuthority()), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params
    });
}

async function getAccessTokenFromRefreshToken() {
    const params = new URLSearchParams({
        client_id: requiredEnv("MICROSOFT_CLIENT_ID"),
        client_secret: requiredEnv("MICROSOFT_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: requiredEnv("OUTLOOK_REFRESH_TOKEN"),
        scope: "offline_access User.Read Mail.Read"
    });

    const tokens = await fetchJson(TOKEN_URL(getMicrosoftAuthority()), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params
    });

    return tokens.access_token;
}

function stripHtml(html = "") {
    return String(html)
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|table|td|th)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForMatch(value = "") {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .toUpperCase();
}

function fieldValue(text, label, nextLabels = []) {
    const labels = [label, ...nextLabels].map(normalizeForMatch);
    const normalized = normalizeForMatch(text);
    const startLabel = labels[0];
    const start = normalized.indexOf(startLabel);

    if (start < 0) return "";

    const valueStart = start + startLabel.length;
    let valueEnd = normalized.length;

    labels.slice(1).forEach(nextLabel => {
        const index = normalized.indexOf(nextLabel, valueStart);
        if (index >= 0 && index < valueEnd) valueEnd = index;
    });

    return text
        .slice(valueStart, valueEnd)
        .replace(/^[:\s]+/, "")
        .replace(/\s+$/, "")
        .trim();
}

function parseAmount(value = "") {
    const clean = String(value).replace(/[^\d.,-]/g, "");
    if (!clean) return 0;
    return Number(clean.replace(/,/g, "")) || 0;
}

function parseDebitDate(value = "") {
    const match = String(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!match) return new Date().toISOString().slice(0, 10);

    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const yearRaw = match[3];
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

    return `${year}-${month}-${day}`;
}

function extractDebitCardPurchase(message) {
    const bodyText = stripHtml(message?.body?.content || message?.bodyPreview || "");
    const subject = message?.subject || "";
    const fullText = `${subject} ${bodyText}`;
    const searchable = normalizeForMatch(fullText);

    const isDebitNotice = searchable.includes("TRANSACCIONES DE TARJETAS DE DEBITO");
    const isPurchase = searchable.includes("TIPO DE TRANSACCION : COMPRA") || searchable.includes("TIPO DE TRANSACCION: COMPRA");
    const hasAmount = searchable.includes("MONTO REBAJADO A SU CUENTA");
    const hasMerchant = searchable.includes("NOMBRE DEL COMERCIO");

    if (!isDebitNotice || !isPurchase || !hasAmount || !hasMerchant) return null;

    const labels = {
        fecha: "FECHA",
        hora: "HORA DE LA TRANSACCION",
        monto: "MONTO REBAJADO A SU CUENTA",
        moneda: "MONEDA",
        comercio: "NOMBRE DEL COMERCIO",
        pais: "PAIS ORIGEN DEL COMERCIO",
        referencia: "NUMERO DE REFERENCIA",
        terminal: "NUMERO DE IDENTIFICACION DE LA TERMINAL DEL COMERCIO",
        autorizacion: "NUMERO DE AUTORIZACION DE LA TRANSACCION",
        tipoTransaccion: "TIPO DE TRANSACCION",
        tipoTarjeta: "TIPO DE TARJETA",
        tarjetahabiente: "NOMBRE DEL TARJETAHABIENTE"
    };

    const tarjetaMatch = searchable.match(/TARJETA\s+DEBITO\s+VISA\s+TERMINADA\s+EN\s+(\d{3,4})/);
    const montoRaw = fieldValue(bodyText, labels.monto, [labels.moneda]);
    const fechaRaw = fieldValue(bodyText, labels.fecha, [labels.hora]);
    const comercio = fieldValue(bodyText, labels.comercio, [labels.pais]);

    return {
        fecha: parseDebitDate(fechaRaw),
        hora: fieldValue(bodyText, labels.hora, [labels.monto]),
        monto: parseAmount(montoRaw),
        moneda: fieldValue(bodyText, labels.moneda, [labels.comercio]),
        comercio,
        pais: fieldValue(bodyText, labels.pais, [labels.referencia]),
        referencia: fieldValue(bodyText, labels.referencia, [labels.terminal]),
        terminal: fieldValue(bodyText, labels.terminal, [labels.autorizacion]),
        autorizacion: fieldValue(bodyText, labels.autorizacion, [labels.tipoTransaccion]),
        tipoTransaccion: fieldValue(bodyText, labels.tipoTransaccion, [labels.tipoTarjeta]),
        tipoTarjeta: fieldValue(bodyText, labels.tipoTarjeta, [labels.tarjetahabiente]),
        tarjetahabiente: fieldValue(bodyText, labels.tarjetahabiente),
        tarjetaUltimos: tarjetaMatch?.[1] || "",
        subject
    };
}

async function graphGetMessage(messageId) {
    const accessToken = await getAccessTokenFromRefreshToken();
    const select = "$select=id,subject,from,receivedDateTime,body,bodyPreview,internetMessageId";

    return fetchJson(`${GRAPH_BASE_URL}/me/messages/${encodeURIComponent(messageId)}?${select}`, {
        headers: { authorization: `Bearer ${accessToken}` }
    });
}

function parseMessageId(notification) {
    if (notification?.resourceData?.id) return notification.resourceData.id;

    const resource = notification?.resource || "";
    const match = resource.match(/messages\/([^/?]+)/i);
    return match?.[1] || "";
}

async function insertGastoFromPurchase(purchase, message) {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const supabaseKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/clients`;
    const basePayload = {
        id: Date.now(),
        section: "gastos",
        fecha: purchase.fecha,
        nombre: purchase.comercio || "Compra con Tarjeta Debito",
        producto: "Compra con Tarjeta Debito",
        costo: purchase.monto,
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

    const fullPayload = {
        ...basePayload,
        gasto_origen: "outlook_tarjeta_debito",
        moneda: purchase.moneda,
        hora_transaccion: purchase.hora,
        pais_comercio: purchase.pais,
        numero_referencia: purchase.referencia,
        terminal_comercio: purchase.terminal,
        autorizacion_transaccion: purchase.autorizacion,
        tipo_transaccion: purchase.tipoTransaccion,
        tipo_tarjeta: purchase.tipoTarjeta,
        tarjetahabiente: purchase.tarjetahabiente,
        tarjeta_ultimos: purchase.tarjetaUltimos,
        outlook_message_id: message.id
    };

    const headers = {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        "content-type": "application/json",
        prefer: "return=minimal"
    };

    let response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(fullPayload)
    });

    if (response.status === 409) return { inserted: false, reason: "duplicate" };

    if (!response.ok) {
        const details = await response.text();
        const missingColumn = /column|schema cache|PGRST204/i.test(details);
        if (!missingColumn) throw new Error(details);

        response = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(basePayload)
        });

        if (!response.ok) throw new Error(await response.text());
    }

    return { inserted: true };
}

module.exports = {
    GRAPH_BASE_URL,
    requiredEnv,
    fetchJson,
    exchangeCodeForTokens,
    getAccessTokenFromRefreshToken,
    getMicrosoftAuthority,
    getRedirectUri,
    getBaseUrl,
    extractDebitCardPurchase,
    graphGetMessage,
    parseMessageId,
    insertGastoFromPurchase
};
