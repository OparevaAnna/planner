-- =========================================================
-- Planner tracker — схема Supabase (v2)
-- Выполнять в SQL Editor пустого проекта.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- 1. Владелец
-- ---------------------------------------------------------
create table public.app_config (
  id                 smallint primary key default 1 check (id = 1),
  owner_auth_id      uuid not null,
  owner_email        text not null,
  owner_telegram_id  bigint not null,
  timezone           text not null default 'Europe/Moscow',
  updated_at         timestamptz not null default now()
);

create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_config c
    where c.id = 1 and c.owner_auth_id = auth.uid()
  );
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- ---------------------------------------------------------
-- 2. Шапка дня
-- ---------------------------------------------------------
create table public.daily_plans (
  plan_date   date primary key,
  mode        text not null default 'green'
              check (mode in ('green','yellow','red')),
  main_goal   text,
  first_step  text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 3. Задачи дня
-- ---------------------------------------------------------
create table public.daily_tasks (
  id              uuid primary key default gen_random_uuid(),
  plan_date       date not null references public.daily_plans(plan_date) on delete cascade,
  position        smallint not null default 0,
  title           text not null check (char_length(title) between 1 and 200),
  category        text not null default 'work'
                  check (category in ('work','study','sport','health','home','family','friends','rest','other')),
  planned_time    time,
  planned_minutes smallint check (planned_minutes between 5 and 600),
  is_anchor       boolean not null default false,

  status          text not null default 'planned'
                  check (status in ('planned','active','paused','done','skipped')),

  started_at      timestamptz,
  completed_at    timestamptz,
  actual_minutes  int,
  time_source     text not null default 'none'
                  check (time_source in ('none','tracked','planned','fact')),
  comment         text check (char_length(comment) <= 500),
  energy          smallint check (energy between 1 and 5),

  source          text not null default 'opencode'
                  check (source in ('opencode','telegram','manual')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint daily_tasks_time_order
    check (completed_at is null or started_at is null or completed_at >= started_at)
);

create index daily_tasks_date_pos_idx on public.daily_tasks (plan_date, position);
create index daily_tasks_open_idx     on public.daily_tasks (plan_date)
  where status in ('planned','active','paused');
create unique index daily_tasks_one_active_idx on public.daily_tasks (plan_date)
  where status = 'active';

-- ---------------------------------------------------------
-- 4. Сессии работы (старт / пауза / продолжение)
-- ---------------------------------------------------------
create table public.task_sessions (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.daily_tasks(id) on delete cascade,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  minutes      int generated always as (
    case when ended_at is not null
      then greatest(0, round(extract(epoch from (ended_at - started_at)) / 60)::int)
    end
  ) stored,
  pause_reason text check (char_length(pause_reason) <= 200),
  created_at   timestamptz not null default now(),
  constraint task_sessions_order check (ended_at is null or ended_at >= started_at)
);

create index task_sessions_task_idx on public.task_sessions (task_id, started_at);
-- одновременно тикать может только одна сессия на весь трекер
create unique index task_sessions_single_open_idx on public.task_sessions ((1))
  where ended_at is null;

-- ---------------------------------------------------------
-- 5. Факты: внеплановое и «паузы-дела»
-- ---------------------------------------------------------
create table public.fact_logs (
  id               uuid primary key default gen_random_uuid(),
  fact_date        date not null default ((now() at time zone 'Europe/Moscow')::date),
  title            text not null check (char_length(title) between 1 and 200),
  category         text not null default 'other'
                   check (category in ('work','study','sport','health','home','family','friends','rest','other')),
  started_at       timestamptz,
  ended_at         timestamptz,
  duration_minutes int generated always as (
    case when started_at is not null and ended_at is not null
      then greatest(0, round(extract(epoch from (ended_at - started_at)) / 60)::int)
    end
  ) stored,
  comment          text check (char_length(comment) <= 500),
  energy           smallint check (energy between 1 and 5),
  task_id          uuid references public.daily_tasks(id) on delete set null,
  source           text not null default 'telegram'
                   check (source in ('opencode','telegram','manual')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint fact_logs_order check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index fact_logs_date_idx on public.fact_logs (fact_date, started_at);
create unique index fact_logs_single_open_idx on public.fact_logs ((1))
  where ended_at is null and started_at is not null;

-- ---------------------------------------------------------
-- 6. Итог дня (пишет десктоп вечером)
-- ---------------------------------------------------------
create table public.daily_summaries (
  summary_date    date primary key,
  done_count      smallint not null default 0,
  planned_count   smallint not null default 0,
  planned_minutes int not null default 0,
  tracked_minutes int not null default 0,
  imputed_minutes int not null default 0,
  fact_minutes    int not null default 0,
  energy_avg      numeric(3,1),
  wins            text,
  blockers        text,
  ai_review       text,
  tomorrow_mode   text check (tomorrow_mode in ('green','yellow','red')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 7. updated_at
-- ---------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger trg_touch_app_config   before update on public.app_config      for each row execute function public.touch_updated_at();
create trigger trg_touch_daily_plans  before update on public.daily_plans     for each row execute function public.touch_updated_at();
create trigger trg_touch_daily_tasks  before update on public.daily_tasks     for each row execute function public.touch_updated_at();
create trigger trg_touch_fact_logs    before update on public.fact_logs       for each row execute function public.touch_updated_at();
create trigger trg_touch_summaries    before update on public.daily_summaries for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------
-- 8. Пересчёт фактического времени задачи по сессиям
-- ---------------------------------------------------------
create or replace function public.recalc_task_actual()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_task  uuid := case when tg_op = 'DELETE' then old.task_id else new.task_id end;
  v_total int;
  v_first timestamptz;
begin
  select sum(minutes)::int, min(started_at)
    into v_total, v_first
    from public.task_sessions
   where task_id = v_task;

  update public.daily_tasks
     set actual_minutes = v_total,
         started_at     = coalesce(started_at, v_first),
         time_source    = case when v_total is null then 'none' else 'tracked' end
   where id = v_task;

  return null;
end $$;

create trigger trg_recalc_task_actual
after insert or update or delete on public.task_sessions
for each row execute function public.recalc_task_actual();

-- ---------------------------------------------------------
-- 9. View для вечернего разбора
-- ---------------------------------------------------------
create or replace view public.v_day_facts
with (security_invoker = true) as
select t.plan_date as day, t.id, 'task'::text as kind, t.title, t.category,
       t.planned_time, t.planned_minutes, t.status, t.is_anchor, t.time_source,
       t.started_at, t.completed_at,
       coalesce(t.actual_minutes, 0) as actual_minutes,
       t.comment, t.energy
from public.daily_tasks t
union all
select f.fact_date, f.id, 'fact', f.title, f.category,
       null, null, 'fact', false, 'tracked',
       f.started_at, f.ended_at,
       coalesce(f.duration_minutes, 0),
       f.comment, f.energy
from public.fact_logs f;

create or replace view public.v_day_stats
with (security_invoker = true) as
select d.plan_date,
       count(t.id)                                              as planned_count,
       count(*) filter (where t.status = 'done')                as done_count,
       coalesce(sum(t.planned_minutes), 0)                      as planned_minutes,
       coalesce(sum(t.actual_minutes), 0)                       as actual_minutes,
       coalesce(sum(t.actual_minutes) filter (where t.time_source = 'tracked'), 0) as tracked_minutes,
       coalesce(sum(t.actual_minutes) filter (where t.time_source = 'planned'), 0) as imputed_minutes,
       count(*) filter (where t.status = 'done' and t.actual_minutes is null)       as done_untracked,
       round(avg(t.energy)::numeric, 1)                         as energy_avg,
       (select coalesce(sum(f.duration_minutes), 0)
          from public.fact_logs f where f.fact_date = d.plan_date)                  as fact_minutes
from public.daily_plans d
left join public.daily_tasks t on t.plan_date = d.plan_date
group by d.plan_date;

-- ---------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------
alter table public.app_config      enable row level security;
alter table public.daily_plans     enable row level security;
alter table public.daily_tasks     enable row level security;
alter table public.task_sessions   enable row level security;
alter table public.fact_logs       enable row level security;
alter table public.daily_summaries enable row level security;

revoke all on public.app_config from anon, authenticated;

grant select, insert, update, delete
  on public.daily_plans, public.daily_tasks, public.task_sessions,
     public.fact_logs, public.daily_summaries
  to authenticated;
grant select on public.v_day_facts, public.v_day_stats to authenticated;

create policy owner_all_daily_plans on public.daily_plans
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all_daily_tasks on public.daily_tasks
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all_task_sessions on public.task_sessions
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all_fact_logs on public.fact_logs
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy owner_all_summaries on public.daily_summaries
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------
-- 11. RPC телефона
-- ---------------------------------------------------------
create or replace function public.start_task(p_task_id uuid)
returns public.daily_tasks
language plpgsql security invoker set search_path = public
as $$
declare v_row public.daily_tasks;
begin
  update public.task_sessions set ended_at = now() where ended_at is null;
  update public.fact_logs     set ended_at = now() where ended_at is null and started_at is not null;
  update public.daily_tasks   set status = 'planned' where status = 'active' and id <> p_task_id;

  insert into public.task_sessions (task_id) values (p_task_id);
  update public.daily_tasks
     set status = 'active', source = 'telegram'
   where id = p_task_id
  returning * into v_row;

  return v_row;
end $$;

create or replace function public.pause_task(
  p_task_id       uuid,
  p_reason        text     default null,
  p_as_fact       boolean  default false,
  p_fact_category text     default null
)
returns public.daily_tasks
language plpgsql security invoker set search_path = public
as $$
declare v_row public.daily_tasks;
begin
  update public.task_sessions
     set ended_at = now(), pause_reason = nullif(p_reason, '')
   where task_id = p_task_id and ended_at is null;

  update public.daily_tasks
     set status = 'paused', source = 'telegram'
   where id = p_task_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'task % not found', p_task_id;
  end if;

  if p_as_fact then
    insert into public.fact_logs (fact_date, title, category, started_at, comment, source, task_id)
    values (v_row.plan_date,
            coalesce(nullif(p_reason, ''), 'пауза'),
            coalesce(p_fact_category, 'other'),
            now(),
            nullif(p_reason, ''),
            'telegram',
            p_task_id);
  end if;

  return v_row;
end $$;

create or replace function public.resume_task(p_task_id uuid)
returns public.daily_tasks
language plpgsql security invoker set search_path = public
as $$
declare v_row public.daily_tasks;
begin
  update public.fact_logs
     set ended_at = now()
   where ended_at is null and started_at is not null and task_id = p_task_id;

  insert into public.task_sessions (task_id) values (p_task_id);

  update public.daily_tasks
     set status = 'active', source = 'telegram'
   where id = p_task_id
  returning * into v_row;

  return v_row;
end $$;

create or replace function public.complete_task(
  p_task_id uuid,
  p_comment text     default null,
  p_energy  smallint default null
)
returns public.daily_tasks
language plpgsql security invoker set search_path = public
as $$
declare v_row public.daily_tasks; v_sessions int;
begin
  update public.task_sessions set ended_at = now() where task_id = p_task_id and ended_at is null;
  update public.fact_logs     set ended_at = now()
   where ended_at is null and started_at is not null and task_id = p_task_id;

  update public.daily_tasks
     set status       = 'done',
         completed_at = now(),
         comment      = coalesce(p_comment, comment),
         energy       = coalesce(p_energy, energy),
         source       = 'telegram'
   where id = p_task_id and status in ('planned','active','paused')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'task % not found or already closed', p_task_id;
  end if;

  select count(*) into v_sessions from public.task_sessions where task_id = p_task_id;
  if v_sessions = 0 and v_row.planned_minutes is not null then
    update public.daily_tasks
       set actual_minutes = planned_minutes, time_source = 'planned'
     where id = p_task_id
    returning * into v_row;
  end if;

  return v_row;
end $$;

create or replace function public.reopen_task(p_task_id uuid)
returns public.daily_tasks
language plpgsql security invoker set search_path = public
as $$
declare v_row public.daily_tasks;
begin
  update public.daily_tasks
     set status         = 'planned',
         completed_at   = null,
         actual_minutes = null,
         time_source    = 'none'
   where id = p_task_id
  returning * into v_row;
  return v_row;
end $$;

revoke all on function
  public.start_task(uuid),
  public.pause_task(uuid,text,boolean,text),
  public.resume_task(uuid),
  public.complete_task(uuid,text,smallint),
  public.reopen_task(uuid)
  from public, anon;
grant execute on function
  public.start_task(uuid),
  public.pause_task(uuid,text,boolean,text),
  public.resume_task(uuid),
  public.complete_task(uuid,text,smallint),
  public.reopen_task(uuid)
  to authenticated;

-- ---------------------------------------------------------
-- 12. Бутстрап (подставить свои значения)
-- ---------------------------------------------------------
insert into public.app_config (id, owner_auth_id, owner_email, owner_telegram_id)
values (1, '00000000-0000-0000-0000-000000000000', 'tg@local.invalid', 123456789)
on conflict (id) do update
  set owner_auth_id     = excluded.owner_auth_id,
      owner_email       = excluded.owner_email,
      owner_telegram_id = excluded.owner_telegram_id;
