-- =============================================================================
-- Shared leaderboard schema for the Software Quality & Testing Quiz
--
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Safe to re-run: every statement is idempotent.
--
-- After running this, run the snippet in README.md ("Set the Admin PIN") to
-- store your PIN. The PIN is deliberately NOT in this file, because this file
-- lives in a public repository.
--
-- Security model
-- --------------
-- The browser only ever holds the *anon* key, which is public by design. All
-- access goes through the SECURITY DEFINER functions below; the tables
-- themselves have RLS enabled with no policies, so the anon key cannot read,
-- insert, update or delete rows directly. That means the anon key grants
-- exactly three abilities: check whether an Employee ID has played, submit one
-- score for an Employee ID, and attempt a PIN-guarded admin action.
-- =============================================================================

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

create table if not exists public.quiz_scores (
  employee_id text        primary key check (employee_id ~ '^[0-9]{6,7}$'),
  name        text        not null    check (char_length(name) between 1 and 30),
  correct     smallint    not null    check (correct between 0 and 5),
  avg_time    smallint    not null    check (avg_time between 0 and 20),
  score       smallint    generated always as (correct * 20) stored,
  played_at   timestamptz not null    default now()
);

create index if not exists idx_quiz_scores_ranking
  on public.quiz_scores (score desc, avg_time asc, played_at asc);

-- Holds the Admin PIN. Never exposed to the browser.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);

-- --------------------------------------------------------------------------
-- Lock both tables down. RLS on + zero policies = no direct access for the
-- anon key. Only the SECURITY DEFINER functions below can touch the data.
-- --------------------------------------------------------------------------

alter table public.quiz_scores enable row level security;
alter table public.app_config  enable row level security;

revoke all on table public.quiz_scores from anon, authenticated;
revoke all on table public.app_config  from anon, authenticated;

-- --------------------------------------------------------------------------
-- PIN check. Private: the browser must not be able to call this directly,
-- otherwise it becomes a bare PIN oracle.
-- Returns 'ok' | 'bad' | 'unset'.
-- --------------------------------------------------------------------------

create or replace function public.admin_pin_state(p_pin text)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select case
    when not exists (select 1 from public.app_config where key = 'admin_pin')
      then 'unset'
    when exists (select 1 from public.app_config
                 where key = 'admin_pin' and value = p_pin)
      then 'ok'
    else 'bad'
  end;
$$;

revoke all on function public.admin_pin_state(text) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- Player-facing functions
-- --------------------------------------------------------------------------

-- Start screen: has this Employee ID already used its single attempt?
create or replace function public.player_has_played(p_employee_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.quiz_scores where employee_id = p_employee_id
  );
$$;

-- Result screen: record one attempt. The score is derived in the database
-- (generated column), so a tampered client cannot post an arbitrary score --
-- the worst it can claim is 5 correct answers.
create or replace function public.submit_score(
  p_employee_id text,
  p_name        text,
  p_correct     int,
  p_avg_time    int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_row  public.quiz_scores;
begin
  if p_employee_id is null or p_employee_id !~ '^[0-9]{6,7}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_employee_id');
  end if;

  if p_correct is null or p_correct < 0 or p_correct > 5
     or p_avg_time is null or p_avg_time < 0 or p_avg_time > 20 then
    return jsonb_build_object('ok', false, 'error', 'invalid_score');
  end if;

  v_name := left(coalesce(nullif(btrim(coalesce(p_name, '')), ''), 'Player'), 30);

  insert into public.quiz_scores (employee_id, name, correct, avg_time)
  values (p_employee_id, v_name, p_correct, p_avg_time)
  on conflict (employee_id) do nothing
  returning * into v_row;

  if v_row.employee_id is null then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  return jsonb_build_object(
    'ok', true,
    'entry', jsonb_build_object(
      'employeeId', v_row.employee_id,
      'name',       v_row.name,
      'score',      v_row.score,
      'correct',    v_row.correct,
      'avgTime',    v_row.avg_time
    )
  );
end;
$$;

-- --------------------------------------------------------------------------
-- Admin functions. Each one re-checks the PIN; none of them trust the client.
-- --------------------------------------------------------------------------

create or replace function public.admin_leaderboard(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state   text := public.admin_pin_state(p_pin);
  v_entries jsonb;
begin
  if v_state = 'unset' then
    return jsonb_build_object('ok', false, 'error', 'pin_unset');
  elsif v_state <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'bad_pin');
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'employeeId', s.employee_id,
               'name',       s.name,
               'score',      s.score,
               'correct',    s.correct,
               'avgTime',    s.avg_time
             )
             order by s.score desc, s.avg_time asc, s.played_at asc
           ),
           '[]'::jsonb
         )
    into v_entries
  from (
    select *
    from public.quiz_scores
    order by score desc, avg_time asc, played_at asc
    limit 10
  ) s;

  return jsonb_build_object('ok', true, 'entries', v_entries);
end;
$$;

create or replace function public.admin_clear_scores(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state   text := public.admin_pin_state(p_pin);
  v_removed int;
begin
  if v_state = 'unset' then
    return jsonb_build_object('ok', false, 'error', 'pin_unset');
  elsif v_state <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'bad_pin');
  end if;

  delete from public.quiz_scores;
  get diagnostics v_removed = row_count;

  return jsonb_build_object('ok', true, 'removed', v_removed);
end;
$$;

create or replace function public.admin_remove_player(
  p_pin         text,
  p_employee_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state   text := public.admin_pin_state(p_pin);
  v_removed int;
begin
  if v_state = 'unset' then
    return jsonb_build_object('ok', false, 'error', 'pin_unset');
  elsif v_state <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'bad_pin');
  end if;

  if p_employee_id is null or p_employee_id !~ '^[0-9]{6,7}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_employee_id');
  end if;

  delete from public.quiz_scores where employee_id = p_employee_id;
  get diagnostics v_removed = row_count;

  if v_removed = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'removed', v_removed);
end;
$$;

-- --------------------------------------------------------------------------
-- Expose exactly the five functions the quiz needs, and nothing else.
-- --------------------------------------------------------------------------

grant execute on function public.player_has_played(text)             to anon, authenticated;
grant execute on function public.submit_score(text, text, int, int)  to anon, authenticated;
grant execute on function public.admin_leaderboard(text)             to anon, authenticated;
grant execute on function public.admin_clear_scores(text)            to anon, authenticated;
grant execute on function public.admin_remove_player(text, text)     to anon, authenticated;

-- Make the new functions visible to the REST API immediately.
notify pgrst, 'reload schema';
