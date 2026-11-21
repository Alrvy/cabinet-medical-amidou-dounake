-- =====================================================================
-- DONNÉES DE DÉMONSTRATION (fictives) — pour présenter le logiciel
-- À exécuter dans Supabase → SQL Editor, APRÈS les migrations 001 à 003.
-- Toutes ces données s'effacent avec demo_nettoyage.sql.
-- Repère : les téléphones des patients fictifs commencent par « 70 00 00 ».
-- =====================================================================

-- ---------- Patients ----------
insert into public.patients (nom, prenom, sexe, date_naissance, telephone, adresse, profession, contact_urgence) values
  ('Traoré',   'Awa',      'F', '1991-04-12', '70 00 00 01', 'Banconi Zekenekorobougou', 'Commerçante',  'Moussa Traoré (mari) — 70 00 00 11'),
  ('Coulibaly','Bakary',   'M', '1978-09-03', '70 00 00 02', 'Banconi Plateau',          'Chauffeur',    'Fanta Coulibaly — 70 00 00 12'),
  ('Diarra',   'Fatoumata','F', '2021-06-20', '70 00 00 03', 'Banconi Razel',            null,           'Aminata Diarra (mère) — 70 00 00 03'),
  ('Keïta',    'Mamadou',  'M', '1955-01-15', '70 00 00 04', 'Djélibougou',              'Retraité',     'Oumar Keïta (fils) — 70 00 00 14'),
  ('Sangaré',  'Mariam',   'F', '1998-11-30', '70 00 00 05', 'Banconi Zekenekorobougou', 'Étudiante',    null),
  ('Konaté',   'Seydou',   'M', '1987-07-08', '70 00 00 06', 'Boulkassoumbougou',        'Maçon',        'Kadiatou Konaté — 70 00 00 16'),
  ('Dembélé',  'Aminata',  'F', '1969-03-22', '70 00 00 07', 'Banconi Flabougou',        'Ménagère',     'Ibrahim Dembélé — 70 00 00 17'),
  ('Touré',    'Ibrahim',  'M', '2016-02-14', '70 00 00 08', 'Banconi Plateau',          'Élève',        'Hawa Touré (mère) — 70 00 00 18');

-- ---------- Informations médicales ----------
insert into public.patients_medical (patient_id, groupe_sanguin, allergies, antecedents, traitements_en_cours)
select p.id, m.gs, m.allergies, m.ant, m.trt
from (values
  ('70 00 00 01', 'O+',  null,                'Paludisme à répétition', null),
  ('70 00 00 02', 'A+',  'Pénicilline',       'Hypertension artérielle', 'Amlodipine 5 mg/j'),
  ('70 00 00 03', 'B+',  null,                'Né à terme, vaccins à jour', null),
  ('70 00 00 04', 'AB+', 'Aspirine',          'Diabète type 2, HTA', 'Metformine 850 mg x2/j'),
  ('70 00 00 07', 'O-',  null,                'Asthme', 'Salbutamol si besoin')
) as m(tel, gs, allergies, ant, trt)
join public.patients p on p.telephone = m.tel;

-- ---------- Consultations (avec constantes) ----------
with c as (
  insert into public.consultations (patient_id, date, motif, examen, diagnostic, traitement, notes, medecin_nom)
  select p.id, now() - (x.jours || ' days')::interval, x.motif, x.examen, x.diag, x.trt, x.notes, 'Dr Dounake'
  from (values
    ('70 00 00 01', 0,  'Fièvre et maux de tête depuis 2 jours', 'Fébrile, pas de raideur de nuque', 'Paludisme simple (TDR positif)', 'Artéméther-luméfantrine 3 jours + paracétamol', null),
    ('70 00 00 02', 3,  'Contrôle de tension', 'TA élevée, pas de signe de gravité', 'HTA mal équilibrée', 'Poursuivre amlodipine, réduire le sel', 'Revoir dans 1 mois'),
    ('70 00 00 03', 1,  'Toux et nez qui coule', 'Auscultation normale', 'Rhinopharyngite', 'Lavage nasal, paracétamol sirop', null),
    ('70 00 00 04', 10, 'Suivi diabète', 'Pieds sans lésion', 'Diabète type 2 équilibré', 'Poursuivre metformine', 'Glycémie à jeun à refaire'),
    ('70 00 00 06', 0,  'Plaie à la main (chantier)', 'Plaie superficielle 3 cm, propre', 'Plaie superficielle', 'Nettoyage, pansement, vaccin antitétanique', 'Pansement à refaire dans 2 jours'),
    ('70 00 00 08', 5,  'Douleurs abdominales', 'Abdomen souple', 'Gastro-entérite', 'SRO, régime, zinc', null)
  ) as x(tel, jours, motif, examen, diag, trt, notes)
  join public.patients p on p.telephone = x.tel
  returning id, patient_id, date
)
insert into public.constantes (patient_id, consultation_id, pris_le, tension_sys, tension_dia, temperature, pouls, poids, pris_par_nom)
select c.patient_id, c.id, c.date, k.sys, k.dia, k.temp, k.pouls, k.poids, 'Infirmier (démo)'
from c
join public.patients p on p.id = c.patient_id
join (values
  ('70 00 00 01', 115, 70, 39.1, 104, 62.0),
  ('70 00 00 02', 158, 96, 36.8, 78, 81.5),
  ('70 00 00 03', null, null, 37.9, 120, 13.2),
  ('70 00 00 04', 138, 84, 36.6, 72, 74.0),
  ('70 00 00 06', 125, 80, 37.0, 80, 70.0),
  ('70 00 00 08', 105, 65, 37.4, 96, 29.5)
) as k(tel, sys, dia, temp, pouls, poids) on k.tel = p.telephone;

-- ---------- Ordonnances ----------
insert into public.ordonnances (patient_id, consultation_id, date, lignes, notes, medecin_nom)
select c.patient_id, c.id, c.date, o.lignes::jsonb, o.notes, 'Dr Dounake'
from public.consultations c
join public.patients p on p.id = c.patient_id
join (values
  ('70 00 00 01', '[{"medicament":"Artéméther-luméfantrine 20/120 mg","posologie":"4 cp matin et soir","duree":"3 jours","quantite":"1 boîte"},{"medicament":"Paracétamol 500 mg","posologie":"2 cp 3 fois par jour si fièvre","duree":"3 jours","quantite":"1 boîte"}]', 'Boire beaucoup d''eau. Revenir si vomissements.'),
  ('70 00 00 03', '[{"medicament":"Paracétamol sirop enfant","posologie":"5 ml 3 fois par jour","duree":"3 jours","quantite":"1 flacon"},{"medicament":"Sérum physiologique","posologie":"Lavage nasal 4 fois par jour","duree":"5 jours","quantite":"1 boîte"}]', null),
  ('70 00 00 08', '[{"medicament":"SRO (sels de réhydratation)","posologie":"1 sachet dans 1 L d''eau, à boire dans la journée","duree":"3 jours","quantite":"3 sachets"},{"medicament":"Zinc 20 mg","posologie":"1 cp par jour","duree":"10 jours","quantite":"1 boîte"}]', null)
) as o(tel, lignes, notes) on o.tel = p.telephone;

-- ---------- Paiements ----------
insert into public.paiements (date, patient_id, patient_nom, consultation_id, lignes, mode, reference, encaisse_par_nom)
select c.date + interval '20 minutes', p.id, p.prenom || ' ' || p.nom, c.id, x.lignes::jsonb, x.mode, x.ref, 'Secrétaire (démo)'
from public.consultations c
join public.patients p on p.id = c.patient_id
join (values
  ('70 00 00 01', '[{"libelle":"Consultation","prix":2000,"quantite":1},{"libelle":"Test rapide paludisme (TDR)","prix":1000,"quantite":1}]', 'especes', null),
  ('70 00 00 02', '[{"libelle":"Consultation de contrôle","prix":1000,"quantite":1}]', 'orange_money', 'OM-DEMO-0001'),
  ('70 00 00 03', '[{"libelle":"Consultation","prix":2000,"quantite":1}]', 'especes', null),
  ('70 00 00 06', '[{"libelle":"Consultation","prix":2000,"quantite":1},{"libelle":"Pansement","prix":1000,"quantite":1},{"libelle":"Injection","prix":500,"quantite":1}]', 'moov_money', 'MM-DEMO-0002'),
  ('70 00 00 08', '[{"libelle":"Consultation","prix":2000,"quantite":1}]', 'especes', null)
) as x(tel, lignes, mode, ref) on x.tel = p.telephone;

-- ---------- Rendez-vous ----------
insert into public.rendez_vous (nom, telephone, date_souhaitee, moment, motif, statut, patient_id)
select x.nom, x.tel, current_date + x.j, x.moment, x.motif, x.statut, p.id
from (values
  ('Bakary Coulibaly', '70 00 00 02', 0, 'Matin',      'Contrôle de tension',            'confirme'),
  ('Mamadou Keïta',    '70 00 00 04', 1, 'Matin',      'Glycémie à jeun',                'confirme'),
  ('Seydou Konaté',    '70 00 00 06', 2, 'Après-midi', 'Changer le pansement',           'confirme'),
  ('Kadidia Samaké',   '70 00 00 09', 1, 'Soir',       'Douleurs au dos depuis 1 semaine', 'en_attente'),
  ('Oumar Sidibé',     '70 00 00 10', 3, 'Matin',      'Certificat médical',             'en_attente')
) as x(nom, tel, j, moment, motif, statut)
left join public.patients p on p.telephone = x.tel;

-- ---------- Stock (articles + mouvement d'entrée initial) ----------
with a as (
  insert into public.articles (nom, categorie, unite, quantite, seuil, peremption, prix, fournisseur)
  values
    ('Paracétamol 500 mg',                 'Médicament',     'boîte',   40, 10, current_date + 400, 500,  'Pharmacie Djiguiya'),
    ('Paracétamol sirop enfant',           'Médicament',     'flacon',   6,  8, current_date + 200, 1000, 'Pharmacie Djiguiya'),
    ('Artéméther-luméfantrine 20/120 mg',  'Médicament',     'boîte',   25, 10, current_date + 300, 1500, 'PPM'),
    ('Amoxicilline 500 mg',                'Médicament',     'boîte',   15,  5, current_date + 20,  1200, 'PPM'),
    ('Ibuprofène 400 mg',                  'Médicament',     'boîte',    0,  5, current_date + 250, 700,  'Pharmacie Djiguiya'),
    ('SRO (sels de réhydratation)',        'Médicament',     'sachet',  60, 20, current_date + 500, 150,  'PPM'),
    ('Zinc 20 mg',                         'Médicament',     'boîte',   12,  5, current_date + 365, 800,  'PPM'),
    ('Métronidazole 250 mg',               'Médicament',     'boîte',    8,  5, current_date - 10,  600,  'Pharmacie Djiguiya'),
    ('Sérum physiologique',                'Médicament',     'boîte',   20,  5, current_date + 600, 1000, 'Pharmacie Djiguiya'),
    ('Ringer lactate 500 ml',              'Consommable',    'flacon',  18, 10, current_date + 420, 1200, 'PPM'),
    ('Seringues 5 ml',                     'Consommable',    'pièce',  150, 50, current_date + 900, 50,   'PPM'),
    ('Gants d''examen (taille M)',         'Consommable',    'boîte',    3,  4, null,               3500, 'PPM'),
    ('Compresses stériles',                'Consommable',    'paquet',  30, 10, current_date + 700, 300,  'Pharmacie Djiguiya'),
    ('Bande de crêpe 10 cm',               'Consommable',    'pièce',   12,  5, null,               500,  'Pharmacie Djiguiya'),
    ('Alcool 70°',                         'Consommable',    'flacon',   5,  3, current_date + 300, 1500, 'Pharmacie Djiguiya'),
    ('Test rapide paludisme (TDR)',        'Réactif / labo', 'test',    35, 20, current_date + 25,  700,  'PPM'),
    ('Bandelettes glycémie',               'Réactif / labo', 'boîte',    2,  2, current_date + 180, 8000, 'Pharmacie Djiguiya'),
    ('Thermomètre digital',                'Matériel',       'pièce',    3,  1, null,               2500, 'Pharmacie Djiguiya'),
    ('Tensiomètre',                        'Matériel',       'pièce',    2,  1, null,               25000,'Fournisseur matériel')
  returning id, nom, quantite
)
insert into public.mouvements (article_id, article_nom, type, quantite, note)
select id, nom, 'in', quantite, 'Stock initial (démo)' from a where quantite > 0;

select 'Données de démonstration ajoutées' as resultat,
  (select count(*) from public.patients where telephone like '70 00 00 %') as patients,
  (select count(*) from public.articles) as articles;
