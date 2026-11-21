// Paramètres du cabinet — modifiez ici sans toucher au reste du code.
window.CABINET = {
  nom: "Cabinet Médical Amidou Dounake",

  // En-tête des ordonnances et des reçus
  adresse: "Banconi Zekenekorobougou, face à la pharmacie Djiguiya au Razel — Bamako, Mali",
  telephones: "66 88 60 33 / 76 44 40 52",

  // Numéro WhatsApp qui reçoit les demandes de rendez-vous (format international, sans + ni espaces)
  whatsapp: "22366886033",

  // Horaires utilisés pour l'indicateur "Ouvert / Fermé" (0 = dimanche … 6 = samedi), heures en 24h
  horaires: {
    0: null,
    1: [8, 20], 2: [8, 20], 3: [8, 20], 4: [8, 20], 5: [8, 20], 6: [8, 20]
  },

  // Base de données Supabase — Supabase → Project Settings → API
  // La clé "anon / publishable" est faite pour être publique : la sécurité vient des règles RLS (supabase/schema.sql).
  // Ne mettez JAMAIS la clé "service_role" / "secret" ici.
  supabaseUrl: "https://svycrgezemtkxbgueqte.supabase.co",
  supabaseAnonKey: "sb_publishable_tbZppLuX3BaEie4i-CaZ0g_mL0-nJaj"
};
