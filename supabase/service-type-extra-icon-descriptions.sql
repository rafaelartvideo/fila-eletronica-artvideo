-- Descrições dos ícones adicionais dos tipos de atendimento.
-- Execute uma vez no SQL Editor do Supabase usado pelo sistema de filas.

alter table public.ticket_types
  add column if not exists extra_icon_descriptions jsonb not null default '{}'::jsonb;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ticket_types_extra_icon_descriptions_object'
      and conrelid = 'public.ticket_types'::regclass
  ) then
    alter table public.ticket_types
      add constraint ticket_types_extra_icon_descriptions_object
      check (jsonb_typeof(extra_icon_descriptions) = 'object');
  end if;
end
$constraint$;

notify pgrst, 'reload schema';
