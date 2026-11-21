-- =====================================================================
-- Cabinet Médical Amidou Dounake — migration 002
-- Rôles du personnel, patients, constantes, consultations, journal
-- À exécuter APRÈS schema.sql : Supabase → SQL Editor → New query → Run
-- =====================================================================

-- ---------- Profils du personnel ----------
create table if not exists public.profils (
  id       uuid primary key references auth.users(id) on delete cascade,
  email    text not null,
  nom      text not null,
  role     text not null check (role in ('admin', 'medecin', 'infirmier', 'secretaire')),
  actif    boolean not null default true,
  cree_le  timestamptz not null default now()
);

-- Rôle de l'utilisateur connecté (null si pas de profil ou compte désactivé)
create or replace function public.mon_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profils where id = auth.uid() and actif
$$;

create or replace function public.a_role(variadic roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mon_role() = any(roles), false)
$$;

create or replace function public.mon_nom() returns text
language sql stable security definer set search_path = public as $$
  select nom from public.profils where id = auth.uid()
$$;

grant execute on function public.mon_role() to authenticated;
grant execute on function public.mon_nom() to authenticated;
grant execute on function public.a_role(text[]) to authenticated;

-- Premier administrateur : tous les comptes existants au moment de la migration
-- (à ce stade, uniquement le compte créé dans le tableau de bord Supabase).
insert into public.profils (id, email, nom, role)
select id, email, coalesce(raw_user_meta_data->>'nom', split_part(email, '@', 1)), 'admin'
from auth.users
on conflict (id) do nothing;

-- ---------- Patients (identité : visible par tout le personnel) ----------
create table if not exists public.patients (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint generated always as identity unique,
  nom              text not null check (char_length(nom) between 1 and 80),
  prenom           text not null check (char_length(prenom) between 1 and 80),
  sexe             text check (sexe in ('F', 'M')),
  date_naissance   date,
  telephone        text,
  adresse          text,
  profession       text,
  contact_urgence  text,
  cree_le          timestamptz not null default now(),
  cree_par         uuid default auth.uid()
);
create index if not exists patients_nom_idx on public.patients (lower(nom), lower(prenom));
create index if not exists patients_tel_idx on public.patients (telephone);

-- ---------- Informations médicales (séparées : la secrétaire n'y a pas accès) ----------
create table if not exists public.patients_medical (
  patient_id      uuid primary key references public.patients(id) on delete cascade,
  groupe_sanguin  text check (groupe_sanguin in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  allergies       text,
  antecedents     text,
  traitements_en_cours text,
  modifie_le      timestamptz not null default now()
);

-- ---------- Consultations ----------
create table if not exists public.consultations (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  date        timestamptz not null default now(),
  motif       text not null,
  examen      text,
  diagnostic  text,
  traitement  text,
  notes       text,
  medecin_id  uuid default auth.uid() references public.profils(id) on delete set null,
  medecin_nom text default public.mon_nom(),
  cree_le     timestamptz not null default now()
);
create index if not exists consultations_patient_idx on public.consultations (patient_id, date desc);

-- ---------- Constantes (prises par l'infirmier ou le médecin) ----------
create table if not exists public.constantes (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients(id) on delete cascade,
  consultation_id  uuid references public.consultations(id) on delete set null,
  tension_sys      smallint check (tension_sys between 40 and 300),
  tension_dia      smallint check (tension_dia between 20 and 200),
  temperature      numeric(3,1) check (temperature between 30 and 45),
  pouls            smallint check (pouls between 20 and 250),
  poids            numeric(5,1) check (poids between 0.3 and 400),
  taille           smallint check (taille between 20 and 250),
  saturation       smallint check (saturation between 40 and 100),
  glycemie         numeric(4,2) check (glycemie between 0.1 and 10),
  note             text,
  pris_par         uuid default auth.uid() references public.profils(id) on delete set null,
  pris_par_nom     text default public.mon_nom(),
  pris_le          timestamptz not null default now()
);
create index if not exists constantes_patient_idx on public.constantes (patient_id, pris_le desc);

-- Lien rendez-vous → patient (optionnel)
alter table public.rendez_vous add column if not exists patient_id uuid references public.patients(id) on delete set null;

-- ---------- Journal (qui a créé / modifié / supprimé quoi) ----------
create table if not exists public.journal (
  id           bigint generated always as identity primary key,
  quand        timestamptz not null default now(),
  utilisateur  uuid,
  table_nom    text not null,
  action       text not null,
  ligne_id     text
);
create index if not exists journal_quand_idx on public.journal (quand desc);

create or replace function public.journaliser() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rid text;
begin
  if tg_op = 'DELETE' then
    rid := coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'patient_id');
  else
    rid := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'patient_id');
  end if;
  insert into public.journal (utilisateur, table_nom, action, ligne_id)
  values (auth.uid(), tg_table_name, tg_op, rid);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['patients','patients_medical','consultations','constantes','articles','rendez_vous','profils'] loop
    execute format('drop trigger if exists journal_%1$s on public.%1$I', t);
    execute format('create trigger journal_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.journaliser()', t);
  end loop;
end $$;

-- =====================================================================
--                    SÉCURITÉ : DROITS PAR RÔLE
-- admin       : tout
-- medecin     : patients, infos médicales, constantes, consultations, stock, rendez-vous
-- infirmier   : patients, infos médicales, constantes, stock ; lecture consultations et rendez-vous
-- secretaire  : identité des patients, rendez-vous ; rien de médical, pas le stock
-- =====================================================================
alter table public.profils          enable row level security;
alter table public.patients         enable row level security;
alter table public.patients_medical enable row level security;
alter table public.consultations    enable row level security;
alter table public.constantes       enable row level security;
alter table public.journal          enable row level security;

-- Supprime les anciennes règles "tout utilisateur connecté" de schema.sql
drop policy if exists "personnel - articles"   on public.articles;
drop policy if exists "personnel - mouvements" on public.mouvements;
drop policy if exists "personnel - rdv"        on public.rendez_vous;

-- Profils : chacun voit le sien, l'admin voit tout. Écritures : uniquement via la fonction serveur.
drop policy if exists "profils - lecture" on public.profils;
create policy "profils - lecture" on public.profils for select to authenticated
  using (id = auth.uid() or public.a_role('admin'));

-- Patients (identité)
drop policy if exists "patients - lecture" on public.patients;
create policy "patients - lecture" on public.patients for select to authenticated
  using (public.a_role('admin','medecin','infirmier','secretaire'));
drop policy if exists "patients - creation" on public.patients;
create policy "patients - creation" on public.patients for insert to authenticated
  with check (public.a_role('admin','medecin','infirmier','secretaire'));
drop policy if exists "patients - modification" on public.patients;
create policy "patients - modification" on public.patients for update to authenticated
  using (public.a_role('admin','medecin','infirmier','secretaire'))
  with check (public.a_role('admin','medecin','infirmier','secretaire'));
drop policy if exists "patients - suppression" on public.patients;
create policy "patients - suppression" on public.patients for delete to authenticated
  using (public.a_role('admin'));

-- Infos médicales
drop policy if exists "medical - soignants" on public.patients_medical;
create policy "medical - soignants" on public.patients_medical for all to authenticated
  using (public.a_role('admin','medecin','infirmier'))
  with check (public.a_role('admin','medecin','infirmier'));

-- Constantes
drop policy if exists "constantes - soignants" on public.constantes;
create policy "constantes - soignants" on public.constantes for all to authenticated
  using (public.a_role('admin','medecin','infirmier'))
  with check (public.a_role('admin','medecin','infirmier'));

-- Consultations : lecture soignants, écriture médecin/admin
drop policy if exists "consultations - lecture" on public.consultations;
create policy "consultations - lecture" on public.consultations for select to authenticated
  using (public.a_role('admin','medecin','infirmier'));
drop policy if exists "consultations - creation" on public.consultations;
create policy "consultations - creation" on public.consultations for insert to authenticated
  with check (public.a_role('admin','medecin'));
drop policy if exists "consultations - modification" on public.consultations;
create policy "consultations - modification" on public.consultations for update to authenticated
  using (public.a_role('admin','medecin')) with check (public.a_role('admin','medecin'));
drop policy if exists "consultations - suppression" on public.consultations;
create policy "consultations - suppression" on public.consultations for delete to authenticated
  using (public.a_role('admin'));

-- Stock
drop policy if exists "stock - articles" on public.articles;
create policy "stock - articles" on public.articles for all to authenticated
  using (public.a_role('admin','medecin','infirmier'))
  with check (public.a_role('admin','medecin','infirmier'));
drop policy if exists "stock - mouvements" on public.mouvements;
create policy "stock - mouvements" on public.mouvements for all to authenticated
  using (public.a_role('admin','medecin','infirmier'))
  with check (public.a_role('admin','medecin','infirmier'));

-- Rendez-vous (la règle publique "demander un rdv" de schema.sql est conservée)
drop policy if exists "rdv - lecture" on public.rendez_vous;
create policy "rdv - lecture" on public.rendez_vous for select to authenticated
  using (public.a_role('admin','medecin','infirmier','secretaire'));
drop policy if exists "rdv - gestion" on public.rendez_vous;
create policy "rdv - gestion" on public.rendez_vous for update to authenticated
  using (public.a_role('admin','medecin','secretaire'))
  with check (public.a_role('admin','medecin','secretaire'));
drop policy if exists "rdv - creation personnel" on public.rendez_vous;
create policy "rdv - creation personnel" on public.rendez_vous for insert to authenticated
  with check (public.a_role('admin','medecin','secretaire'));
drop policy if exists "rdv - suppression" on public.rendez_vous;
create policy "rdv - suppression" on public.rendez_vous for delete to authenticated
  using (public.a_role('admin'));

-- Journal : lecture admin uniquement (écriture par les déclencheurs)
drop policy if exists "journal - admin" on public.journal;
create policy "journal - admin" on public.journal for select to authenticated
  using (public.a_role('admin'));

-- Droits SQL de base pour l'API (la sécurité réelle vient des règles ci-dessus)
grant select, insert, update, delete on public.patients, public.patients_medical,
  public.consultations, public.constantes to authenticated;
grant select on public.profils, public.journal to authenticated;
revoke insert, update, delete on public.profils, public.journal from authenticated, anon;
revoke all on public.patients, public.patients_medical, public.consultations,
  public.constantes, public.profils, public.journal from anon;
