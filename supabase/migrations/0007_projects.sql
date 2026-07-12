-- Projects entity (FR-PROJ-01)
create table if not exists myself.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Seed from legacy task enum + default for relationships (FR-PROJ-06)
insert into myself.projects (name, sort_order)
select v.name, v.sort_order
from (values
  ('Digital Scale', 10),
  ('Glowy', 20),
  ('KupaPay', 30),
  ('אישי', 40),
  ('אחר', 50),
  ('כללי', 60)
) as v(name, sort_order)
where not exists (select 1 from myself.projects p where p.name = v.name);

-- Tasks: project text → project_id FK
alter table myself.tasks
  add column if not exists project_id uuid references myself.projects (id);

update myself.tasks t
set project_id = p.id
from myself.projects p
where p.name = t.project
  and t.project_id is null;

update myself.tasks t
set project_id = (select id from myself.projects where name = 'אישי' limit 1)
where t.project_id is null;

alter table myself.tasks
  alter column project_id set not null;

alter table myself.tasks
  drop column if exists project;

drop index if exists myself.tasks_project_idx;
create index if not exists tasks_project_id_idx
  on myself.tasks (project_id, status);

-- Relationships: add project_id FK
alter table myself.relationships
  add column if not exists project_id uuid references myself.projects (id);

update myself.relationships r
set project_id = (select id from myself.projects where name = 'כללי' limit 1)
where r.project_id is null;

alter table myself.relationships
  alter column project_id set not null;

create index if not exists relationships_project_id_idx
  on myself.relationships (project_id);

grant all on myself.projects to anon, authenticated, service_role;
