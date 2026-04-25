-- Opcional: ejecuta esto en Supabase SQL Editor si quieres guardar todos
-- los datos del correo de tarjeta debito dentro de la tabla clients.
-- El dashboard ya funciona sin estas columnas usando:
-- nombre = comercio, producto = detalle, costo = monto.

alter table public.clients
    add column if not exists gasto_origen text,
    add column if not exists moneda text,
    add column if not exists hora_transaccion text,
    add column if not exists pais_comercio text,
    add column if not exists numero_referencia text,
    add column if not exists terminal_comercio text,
    add column if not exists autorizacion_transaccion text,
    add column if not exists tipo_transaccion text,
    add column if not exists tipo_tarjeta text,
    add column if not exists tarjetahabiente text,
    add column if not exists tarjeta_ultimos text,
    add column if not exists outlook_message_id text;

create unique index if not exists clients_outlook_message_id_idx
    on public.clients (outlook_message_id)
    where outlook_message_id is not null;
