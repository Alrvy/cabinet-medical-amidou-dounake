-- =====================================================================
-- Cabinet Médical Amidou Dounake — schéma Supabase (PostgreSQL)
-- À exécuter une fois dans : Supabase → SQL Editor → New query → Run
-- =====================================================================

-- ---------- Articles du stock ----------
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null,
  categorie    text,
  unite        text,
  quantite     integer not null default 0 check (quantite >= 0),
  seuil        integer not null default 0 check (seuil >= 0),
  peremption   date,
  prix         integer check (prix >= 0),
  fournisseur  text,
  cree_le      timestamptz not null default now(),
  modifie_le   timestamptz not null default now()
);

-- ---------- Mouvements (entrées / sorties) ----------
create table if not exists public.mouvements (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid references public.articles(id) on delete set null,
  article_nom text not null,
  type        text not null check (type in ('in', 'out')),
  quantite    integer not null check (quantite > 0),
  note        text,
  cree_le     timestamptz not null default now(),
  cree_par    uuid default auth.uid()
);
create index if not exists mouvements_cree_le_idx on public.mouvements (cree_le desc);

-- ---------- Demandes de rendez-vous (envoyées depuis le site public) ----------
create table if not exists public.rendez_vous (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null check (char_length(nom) between 2 and 120),
  telephone     text not null check (char_length(telephone) between 6 and 30),
  date_souhaitee date not null,
  moment        text check (moment in ('Matin', 'Après-midi', 'Soir')),
  motif         text check (char_length(motif) <= 1000),
  statut        text not null default 'en_attente' check (statut in ('en_attente', 'confirme', 'annule', 'termine')),
  cree_le       timestamptz not null default now()
);
create index if not exists rendez_vous_date_idx on public.rendez_vous (date_souhaitee);

-- ---------- Mise à jour automatique de modifie_le ----------
create or replace function public.maj_modifie_le() returns trigger
language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end $$;

drop trigger if exists articles_modifie_le on public.articles;
create trigger articles_modifie_le before update on public.articles
for each row execute function public.maj_modifie_le();

-- ---------- Mouvement de stock atomique ----------
-- Met à jour la quantité ET enregistre le mouvement dans une seule transaction.
create or replace function public.enregistrer_mouvement(
  p_article_id uuid, p_type text, p_quantite integer, p_note text default null
) returns public.articles
language plpgsql security invoker as $$
declare
  a public.articles;
begin
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'Quantité invalide';
  end if;

  select * into a from public.articles where id = p_article_id for update;
  if not found then
    raise exception 'Article introuvable';
  end if;

  if p_type = 'out' and a.quantite < p_quantite then
    raise exception 'Stock insuffisant (% disponible)', a.quantite;
  end if;

  update public.articles
     set quantite = quantite + case when p_type = 'in' then p_quantite else -p_quantite end
   where id = p_article_id
   returning * into a;

  insert into public.mouvements (article_id, article_nom, type, quantite, note)
  values (a.id, a.nom, p_type, p_quantite, p_note);

  return a;
end $$;

-- ---------- Sécurité (Row Level Security) ----------
alter table public.articles    enable row level security;
alter table public.mouvements  enable row level security;
alter table public.rendez_vous enable row level security;

-- Stock : réservé au personnel connecté
drop policy if exists "personnel - articles" on public.articles;
create policy "personnel - articles" on public.articles
  for all to authenticated using (true) with check (true);

drop policy if exists "personnel - mouvements" on public.mouvements;
create policy "personnel - mouvements" on public.mouvements
  for all to authenticated using (true) with check (true);

-- Rendez-vous : le public peut seulement CRÉER une demande (en attente)
drop policy if exists "public - demander un rdv" on public.rendez_vous;
create policy "public - demander un rdv" on public.rendez_vous
  for insert to anon, authenticated
  with check (statut = 'en_attente' and date_souhaitee >= current_date);

-- Rendez-vous : le personnel connecté peut tout voir et modifier
drop policy if exists "personnel - rdv" on public.rendez_vous;
create policy "personnel - rdv" on public.rendez_vous
  for all to authenticated using (true) with check (true);

grant execute on function public.enregistrer_mouvement(uuid, text, integer, text) to authenticated;
revoke execute on function public.enregistrer_mouvement(uuid, text, integer, text) from anon, public;
