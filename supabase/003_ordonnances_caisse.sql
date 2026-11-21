-- =====================================================================
-- Cabinet Médical Amidou Dounake — migration 003
-- Ordonnances, tarifs des actes, caisse (paiements / reçus)
-- À exécuter APRÈS 002_roles_patients.sql
-- =====================================================================

-- ---------- Ordonnances ----------
-- lignes : [{ "medicament": "...", "posologie": "...", "duree": "...", "quantite": "..." }]
create table if not exists public.ordonnances (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint generated always as identity unique,
  patient_id       uuid not null references public.patients(id) on delete cascade,
  consultation_id  uuid references public.consultations(id) on delete set null,
  date             timestamptz not null default now(),
  lignes           jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) between 1 and 30),
  notes            text,
  medecin_id       uuid default auth.uid() references public.profils(id) on delete set null,
  medecin_nom      text default public.mon_nom(),
  cree_le          timestamptz not null default now()
);
create index if not exists ordonnances_patient_idx on public.ordonnances (patient_id, date desc);

-- ---------- Tarifs des actes ----------
create table if not exists public.actes (
  id     uuid primary key default gen_random_uuid(),
  nom    text not null unique,
  prix   integer not null check (prix >= 0),
  actif  boolean not null default true,
  ordre  integer not null default 100
);

-- Tarifs indicatifs À VÉRIFIER avec le cabinet (modifiables dans Caisse → Tarifs)
insert into public.actes (nom, prix, ordre) values
  ('Consultation', 2000, 1),
  ('Consultation de contrôle', 1000, 2),
  ('Injection', 500, 10),
  ('Perfusion', 2500, 11),
  ('Pansement', 1000, 12),
  ('Test rapide paludisme (TDR)', 1000, 20),
  ('Glycémie capillaire', 500, 21)
on conflict (nom) do nothing;

-- ---------- Paiements (un paiement = un reçu) ----------
-- lignes : [{ "libelle": "...", "prix": 2000, "quantite": 1 }]
create table if not exists public.paiements (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint generated always as identity unique,
  date              timestamptz not null default now(),
  patient_id        uuid references public.patients(id) on delete set null,
  patient_nom       text not null check (char_length(patient_nom) between 1 and 160),
  consultation_id   uuid references public.consultations(id) on delete set null,
  lignes            jsonb not null check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) between 1 and 50),
  total             integer not null default 0,
  mode              text not null check (mode in ('especes', 'orange_money', 'moov_money', 'autre')),
  reference         text,
  encaisse_par      uuid default auth.uid() references public.profils(id) on delete set null,
  encaisse_par_nom  text default public.mon_nom(),
  annule            boolean not null default false,
  motif_annulation  text,
  annule_le         timestamptz
);
create index if not exists paiements_date_idx on public.paiements (date desc);
create index if not exists paiements_patient_idx on public.paiements (patient_id);

-- Le total est TOUJOURS recalculé par la base à partir des lignes (impossible de le falsifier)
create or replace function public.calculer_total_paiement() returns trigger
language plpgsql as $$
declare
  l jsonb;
  t bigint := 0;
begin
  for l in select * from jsonb_array_elements(new.lignes) loop
    if coalesce(l->>'libelle', '') = '' then raise exception 'Ligne sans libellé'; end if;
    if (l->>'prix')::integer < 0 or (l->>'quantite')::integer < 1 then raise exception 'Prix ou quantité invalide'; end if;
    t := t + (l->>'prix')::integer * (l->>'quantite')::integer;
  end loop;
  new.total := t;
  return new;
end $$;

drop trigger if exists paiements_total on public.paiements;
create trigger paiements_total before insert on public.paiements
for each row execute function public.calculer_total_paiement();

-- Un reçu ne se modifie jamais : seule l'annulation (par l'admin) est possible
create or replace function public.proteger_paiement() returns trigger
language plpgsql as $$
begin
  if old.annule then raise exception 'Ce reçu est déjà annulé'; end if;
  if new.annule is distinct from true or coalesce(trim(new.motif_annulation), '') = '' then
    raise exception 'Seule l''annulation avec motif est autorisée';
  end if;
  if (to_jsonb(new) - 'annule' - 'motif_annulation' - 'annule_le')
     is distinct from (to_jsonb(old) - 'annule' - 'motif_annulation' - 'annule_le') then
    raise exception 'Un reçu ne peut pas être modifié';
  end if;
  new.annule_le := now();
  return new;
end $$;

drop trigger if exists paiements_protection on public.paiements;
create trigger paiements_protection before update on public.paiements
for each row execute function public.proteger_paiement();

-- Journal
do $$
declare t text;
begin
  foreach t in array array['ordonnances','actes','paiements'] loop
    execute format('drop trigger if exists journal_%1$s on public.%1$I', t);
    execute format('create trigger journal_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.journaliser()', t);
  end loop;
end $$;

-- =====================================================================
--                        SÉCURITÉ
-- Ordonnances : lecture soignants ; rédaction médecin / admin
-- Tarifs      : lecture tout le personnel ; modification admin
-- Caisse      : admin, médecin, secrétaire ; annulation admin ; jamais de suppression
-- =====================================================================
alter table public.ordonnances enable row level security;
alter table public.actes       enable row level security;
alter table public.paiements   enable row level security;

drop policy if exists "ordonnances - lecture" on public.ordonnances;
create policy "ordonnances - lecture" on public.ordonnances for select to authenticated
  using (public.a_role('admin','medecin','infirmier'));
drop policy if exists "ordonnances - creation" on public.ordonnances;
create policy "ordonnances - creation" on public.ordonnances for insert to authenticated
  with check (public.a_role('admin','medecin'));
drop policy if exists "ordonnances - modification" on public.ordonnances;
create policy "ordonnances - modification" on public.ordonnances for update to authenticated
  using (public.a_role('admin','medecin')) with check (public.a_role('admin','medecin'));
drop policy if exists "ordonnances - suppression" on public.ordonnances;
create policy "ordonnances - suppression" on public.ordonnances for delete to authenticated
  using (public.a_role('admin'));

drop policy if exists "actes - lecture" on public.actes;
create policy "actes - lecture" on public.actes for select to authenticated
  using (public.a_role('admin','medecin','infirmier','secretaire'));
drop policy if exists "actes - admin" on public.actes;
create policy "actes - admin" on public.actes for all to authenticated
  using (public.a_role('admin')) with check (public.a_role('admin'));

drop policy if exists "paiements - lecture" on public.paiements;
create policy "paiements - lecture" on public.paiements for select to authenticated
  using (public.a_role('admin','medecin','secretaire'));
drop policy if exists "paiements - encaissement" on public.paiements;
create policy "paiements - encaissement" on public.paiements for insert to authenticated
  with check (public.a_role('admin','medecin','secretaire') and not annule);
drop policy if exists "paiements - annulation" on public.paiements;
create policy "paiements - annulation" on public.paiements for update to authenticated
  using (public.a_role('admin')) with check (public.a_role('admin'));

grant select, insert, update, delete on public.ordonnances to authenticated;
grant select, insert, update, delete on public.actes to authenticated;
grant select, insert, update on public.paiements to authenticated;
revoke delete on public.paiements from authenticated;
revoke all on public.ordonnances, public.actes, public.paiements from anon;
