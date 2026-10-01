-- Ícones adicionais dos tipos de atendimento.
-- Execute uma vez no SQL Editor do Supabase usado pelo sistema de filas.

alter table public.ticket_types
  add column if not exists extra_icons text[] not null default array[]::text[];

update public.ticket_types
set extra_icons = extra_icons[1:4]
where cardinality(extra_icons) > 4;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ticket_types_extra_icons_max_four'
      and conrelid = 'public.ticket_types'::regclass
  ) then
    alter table public.ticket_types
      add constraint ticket_types_extra_icons_max_four
      check (cardinality(extra_icons) <= 4);
  end if;
end
$constraint$;

notify pgrst, 'reload schema';
