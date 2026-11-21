-- =====================================================================
-- EFFACE LES DONNÉES DE DÉMONSTRATION (demo_donnees.sql)
-- À exécuter dans Supabase → SQL Editor avant la vraie mise en service.
-- Ne touche pas aux comptes utilisateurs ni aux tarifs.
-- =====================================================================

-- Paiements, ordonnances, consultations, constantes, infos médicales des patients fictifs
delete from public.paiements   where patient_id in (select id from public.patients where telephone like '70 00 00 %')
                                  or encaisse_par_nom = 'Secrétaire (démo)';
delete from public.rendez_vous where telephone like '70 00 00 %';
delete from public.patients    where telephone like '70 00 00 %';   -- supprime aussi leurs consultations, constantes, ordonnances (cascade)

-- Articles de démonstration et leurs mouvements
delete from public.mouvements where article_nom in (
  'Paracétamol 500 mg', 'Paracétamol sirop enfant', 'Artéméther-luméfantrine 20/120 mg', 'Amoxicilline 500 mg',
  'Ibuprofène 400 mg', 'SRO (sels de réhydratation)', 'Zinc 20 mg', 'Métronidazole 250 mg', 'Sérum physiologique',
  'Ringer lactate 500 ml', 'Seringues 5 ml', 'Gants d''examen (taille M)', 'Compresses stériles', 'Bande de crêpe 10 cm',
  'Alcool 70°', 'Test rapide paludisme (TDR)', 'Bandelettes glycémie', 'Thermomètre digital', 'Tensiomètre');
delete from public.articles where nom in (
  'Paracétamol 500 mg', 'Paracétamol sirop enfant', 'Artéméther-luméfantrine 20/120 mg', 'Amoxicilline 500 mg',
  'Ibuprofène 400 mg', 'SRO (sels de réhydratation)', 'Zinc 20 mg', 'Métronidazole 250 mg', 'Sérum physiologique',
  'Ringer lactate 500 ml', 'Seringues 5 ml', 'Gants d''examen (taille M)', 'Compresses stériles', 'Bande de crêpe 10 cm',
  'Alcool 70°', 'Test rapide paludisme (TDR)', 'Bandelettes glycémie', 'Thermomètre digital', 'Tensiomètre');

select 'Données de démonstration effacées' as resultat;
