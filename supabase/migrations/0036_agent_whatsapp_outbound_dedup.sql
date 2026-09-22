-- Prevent duplicate WhatsApp outbound replies per inbound wamid (Meta retries).

CREATE UNIQUE INDEX IF NOT EXISTS agent_messages_whatsapp_outbound_inbound_uidx
  ON myself.agent_messages (external_id)
  WHERE external_id IS NOT NULL
    AND direction = 'outbound'
    AND channel = 'whatsapp';
