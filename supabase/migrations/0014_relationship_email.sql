-- Optional email on relationships (FR-REL-EMAIL)
alter table myself.relationships
  add column if not exists email text;
