// Edge Function Supabase : gestion des comptes du personnel (réservée à l'administrateur).
// Déploiement : Supabase → Edge Functions → Deploy a new function → Via Editor
//   nom : gerer-utilisateurs   → coller ce fichier → Deploy
//
// Actions (POST JSON) :
//   { action: "creer", email, password, nom, role }
//   { action: "modifier", id, nom?, role?, actif? }
//   { action: "motdepasse", id, password }

import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["admin", "medecin", "infirmier", "secretaire"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Configuration serveur manquante" }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) Qui appelle ?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user) return json({ error: "Session invalide, reconnectez-vous." }, 401);
  const moiId = auth.user.id;

  const { data: moi } = await admin.from("profils").select("role, actif").eq("id", moiId).maybeSingle();
  if (!moi || !moi.actif || moi.role !== "admin") {
    return json({ error: "Action réservée à l'administrateur." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requête invalide" }, 400);
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  try {
    // ---------- Créer un compte ----------
    if (body.action === "creer") {
      const email = str(body.email).toLowerCase();
      const password = str(body.password);
      const nom = str(body.nom);
      const role = str(body.role);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail invalide." }, 400);
      if (password.length < 8) return json({ error: "Le mot de passe doit faire au moins 8 caractères." }, 400);
      if (nom.length < 2) return json({ error: "Nom obligatoire." }, 400);
      if (!ROLES.includes(role)) return json({ error: "Rôle invalide." }, 400);

      const { data: cree, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nom },
      });
      if (error || !cree?.user) {
        const msg = /already|registered|exists/i.test(error?.message ?? "")
          ? "Un compte existe déjà avec cet e-mail." : (error?.message ?? "Création impossible.");
        return json({ error: msg }, 400);
      }
      const { error: pErr } = await admin.from("profils").insert({ id: cree.user.id, email, nom, role });
      if (pErr) {
        await admin.auth.admin.deleteUser(cree.user.id);
        return json({ error: "Création du profil impossible : " + pErr.message }, 500);
      }
      return json({ ok: true, id: cree.user.id });
    }

    // ---------- Modifier nom / rôle / activation ----------
    if (body.action === "modifier") {
      const id = str(body.id);
      if (!id) return json({ error: "Utilisateur manquant." }, 400);
      const maj: Record<string, unknown> = {};
      if (typeof body.nom === "string" && str(body.nom).length >= 2) maj.nom = str(body.nom);
      if (typeof body.role === "string") {
        if (!ROLES.includes(body.role)) return json({ error: "Rôle invalide." }, 400);
        maj.role = body.role;
      }
      if (typeof body.actif === "boolean") maj.actif = body.actif;

      if (id === moiId && (maj.role && maj.role !== "admin" || maj.actif === false)) {
        return json({ error: "Vous ne pouvez pas retirer vos propres droits d'administrateur." }, 400);
      }
      if (Object.keys(maj).length === 0) return json({ error: "Rien à modifier." }, 400);

      const { error } = await admin.from("profils").update(maj).eq("id", id);
      if (error) return json({ error: error.message }, 400);

      if (typeof maj.actif === "boolean") {
        // Un compte désactivé ne peut plus se connecter
        await admin.auth.admin.updateUserById(id, { ban_duration: maj.actif ? "none" : "876000h" });
      }
      return json({ ok: true });
    }

    // ---------- Nouveau mot de passe ----------
    if (body.action === "motdepasse") {
      const id = str(body.id);
      const password = str(body.password);
      if (!id) return json({ error: "Utilisateur manquant." }, 400);
      if (password.length < 8) return json({ error: "Le mot de passe doit faire au moins 8 caractères." }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erreur serveur" }, 500);
  }
});
