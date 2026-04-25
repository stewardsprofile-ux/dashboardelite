# Automatizar gastos desde Outlook

## Flujo recomendado

El dashboard actual es una app estatica, asi que no puede recibir webhooks de Outlook por si sola. Para automatizar los gastos necesitamos un endpoint HTTPS publico, por ejemplo Vercel Serverless Function, Supabase Edge Function o Azure Function.

Flujo:

1. Microsoft Graph detecta un correo nuevo en Inbox.
2. Graph llama a nuestro webhook HTTPS.
3. El webhook valida `clientState`.
4. El webhook usa el `message id` para leer el correo completo con Graph.
5. El parser solo acepta correos de compras con tarjeta debito.
6. El webhook guarda un registro en Supabase como `section = "gastos"`.
7. El dashboard lo muestra en la seccion Gastos.

## Endpoints agregados al proyecto

- `/api/outlook-auth-start`: inicia login/consentimiento con Microsoft.
- `/api/outlook-auth-callback`: recibe el codigo OAuth y muestra el `OUTLOOK_REFRESH_TOKEN`.
- `/api/outlook-subscribe`: crea la subscription de Microsoft Graph para Inbox.
- `/api/outlook-webhook`: recibe notificaciones, lee el correo y guarda el gasto.

## Variables de entorno en Vercel

Agrega estas variables en Vercel > Project > Settings > Environment Variables:

```text
MICROSOFT_CLIENT_ID=e1f3809d-9451-4121-ace4-10e56321dfd8
MICROSOFT_TENANT_ID=e323f46a-7b72-4409-9049-b1db6d72abd4
MICROSOFT_AUTHORITY=common
MICROSOFT_CLIENT_SECRET=valor_del_secreto_de_azure
MICROSOFT_REDIRECT_URI=https://dashboardelite.vercel.app/api/outlook-auth-callback
OUTLOOK_WEBHOOK_CLIENT_STATE=un_texto_largo_aleatorio
OUTLOOK_WEBHOOK_URL=https://dashboardelite.vercel.app/api/outlook-webhook
SUPABASE_URL=https://wpcsqjcaxxckldwfwsrn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service_role_key_de_supabase
```

Para correos personales `hotmail.com`, `outlook.com` o `live.com`, `MICROSOFT_AUTHORITY` debe ser `common`.

Despues de tener esas variables, haz redeploy y abre:

```text
https://dashboardelite.vercel.app/api/outlook-auth-start
```

Microsoft pedira permisos. Al terminar, la pagina mostrara un `refresh_token`.
Guarda ese valor en Vercel como:

```text
OUTLOOK_REFRESH_TOKEN=...
```

Haz redeploy otra vez y abre:

```text
https://dashboardelite.vercel.app/api/outlook-subscribe
```

Si responde `ok: true`, la subscription quedo activa.

## Redirect URI en Azure

En Azure > App Registration > Authentication, agrega esta redirect URI tipo Web:

```text
https://dashboardelite.vercel.app/api/outlook-auth-callback
```

La URL raiz `https://dashboardelite.vercel.app/` puede quedarse, pero el flujo OAuth usa la ruta `/api/outlook-auth-callback`.

## Renovacion

Microsoft Graph limita las subscriptions de Outlook message/event/contact a menos de 7 dias. Este proyecto crea la subscription por 6 dias. Hay que volver a abrir `/api/outlook-subscribe` antes de que expire, o luego podemos automatizarlo con un cron de Vercel.

## Filtro del correo

Usaremos varias reglas para evitar registrar correos que no sean compras:

- El asunto o cuerpo debe contener `TRANSACCIONES DE TARJETAS DE DEBITO`.
- El cuerpo debe contener `TIPO DE TRANSACCION : COMPRA`.
- El cuerpo debe contener `MONTO REBAJADO A SU CUENTA`.
- El cuerpo debe contener `NOMBRE DEL COMERCIO`.

## Campos del correo

Campos visibles en el ejemplo:

- Fecha
- Hora de la transaccion
- Monto rebajado a su cuenta
- Moneda
- Nombre del comercio
- Pais origen del comercio
- Numero de referencia
- Numero de identificacion de la terminal del comercio
- Numero de autorizacion de la transaccion
- Tipo de transaccion
- Tipo de tarjeta
- Nombre del tarjetahabiente
- Tarjeta terminada en 0499

## Registro minimo compatible con el dashboard actual

Sin tocar columnas de Supabase:

- `section`: `gastos`
- `fecha`: fecha del correo normalizada a `YYYY-MM-DD`
- `nombre`: nombre del comercio
- `producto`: `Compra con Tarjeta Debito`
- `costo`: monto
- `precio`: `0`
- `prima`: `0`
- `abonado`: `0`

## Registro completo opcional

Si quieres guardar todos los datos, ejecuta `supabase-gastos-tarjeta.sql` en Supabase y luego el webhook puede enviar tambien:

- `gasto_origen`
- `moneda`
- `hora_transaccion`
- `pais_comercio`
- `numero_referencia`
- `terminal_comercio`
- `autorizacion_transaccion`
- `tipo_transaccion`
- `tipo_tarjeta`
- `tarjetahabiente`
- `tarjeta_ultimos`
- `outlook_message_id`

## Ejemplo de subscription Microsoft Graph

```json
{
  "changeType": "created",
  "notificationUrl": "https://TU-DOMINIO.com/api/outlook-webhook",
  "resource": "/me/mailFolders('inbox')/messages",
  "expirationDateTime": "2026-04-26T20:00:00.0000000Z",
  "clientState": "UN_SECRETO_LARGO"
}
```

Importante: las subscriptions expiran, asi que hay que renovarlas con un job programado.

## Parser base

```js
function extractDebitCardPurchase(emailText) {
    const normalized = emailText
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const hasDebitNotice = /TRANSACCIONES DE TARJETAS DE D[EÉ]BITO/i.test(normalized);
    const isPurchase = /TIPO DE TRANSACCI[OÓ]N\s*:\s*COMPRA/i.test(normalized);
    const hasAmount = /MONTO REBAJADO A SU CUENTA/i.test(normalized);
    const hasMerchant = /NOMBRE DEL COMERCIO/i.test(normalized);

    if (!hasDebitNotice || !isPurchase || !hasAmount || !hasMerchant) return null;

    const pick = (label, nextLabel) => {
        const pattern = new RegExp(`${label}\\s*:\\s*(.*?)\\s+(?=${nextLabel}\\s*:|$)`, "i");
        return normalized.match(pattern)?.[1]?.trim() || "";
    };

    return {
        fecha: pick("FECHA", "HORA DE LA TRANSACCI[OÓ]N"),
        hora: pick("HORA DE LA TRANSACCI[OÓ]N", "MONTO REBAJADO A SU CUENTA"),
        monto: Number(pick("MONTO REBAJADO A SU CUENTA", "MONEDA").replace(/,/g, "")) || 0,
        moneda: pick("MONEDA", "NOMBRE DEL COMERCIO"),
        comercio: pick("NOMBRE DEL COMERCIO", "PA[IÍ]S ORIGEN DEL COMERCIO"),
        pais: pick("PA[IÍ]S ORIGEN DEL COMERCIO", "N[UÚ]MERO DE REFERENCIA"),
        referencia: pick("N[UÚ]MERO DE REFERENCIA", "N[UÚ]MERO DE IDENTIFICACI[OÓ]N"),
        tipoTransaccion: pick("TIPO DE TRANSACCI[OÓ]N", "TIPO DE TARJETA"),
        tipoTarjeta: pick("TIPO DE TARJETA", "NOMBRE DEL TARJETAHABIENTE"),
        tarjetahabiente: pick("NOMBRE DEL TARJETAHABIENTE", "$")
    };
}
```
