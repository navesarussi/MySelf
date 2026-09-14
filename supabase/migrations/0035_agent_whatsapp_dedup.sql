-- Prevent duplicate WhatsApp webhook processing (Meta retries on slow/5xx responses).

CREATE UNIQUE INDEX IF NOT EXISTS agent_messages_whatsapp_inbound_external_id_uidx
  ON myself.agent_messages (external_id)
  WHERE external_id IS NOT NULL
    AND direction = 'inbound'
    AND channel = 'whatsapp';
