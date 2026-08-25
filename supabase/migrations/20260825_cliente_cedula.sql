-- Cédula/NIT opcional del cliente para facturación electrónica (2026-08-25).
--
-- El formulario /solicitar la recoge como campo OPCIONAL ("para tu factura").
-- NULL = consumidor final (comportamiento previo: la cédula no se capturaba).
-- Solo dígitos — el schema Zod del form valida /^\d{5,15}$/ antes de insertar.
--
-- Aditiva y segura: columna nullable, sin default, sin backfill.

ALTER TABLE solicitudes_servicio
  ADD COLUMN IF NOT EXISTS cliente_cedula TEXT;

COMMENT ON COLUMN solicitudes_servicio.cliente_cedula IS
  'Cédula o NIT del cliente para factura electrónica (opcional, solo dígitos). NULL = consumidor final.';
