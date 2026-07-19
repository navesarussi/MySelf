-- Multi-account integration tokens (Monday.com personal + work, etc.)

alter table myself.integration_tokens
  add column if not exists account_key text not null default '';

update myself.integration_tokens
set account_key = ''
where account_key is null;

alter table myself.integration_tokens
  drop constraint if exists integration_tokens_pkey;

alter table myself.integration_tokens
  add primary key (provider, account_key);

alter table myself.integration_tokens
  alter column refresh_token drop not null;

alter table myself.integration_tokens
  alter column expires_at drop not null;
