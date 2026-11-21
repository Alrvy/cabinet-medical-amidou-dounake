/* Démarrage : connexion, chargement du profil et du rôle, puis construction de l'interface. */
(function () {
  "use strict";
  var G = window.G, $ = G.$;

  function afficher(id) {
    ["no-config", "lock-screen", "no-profile", "app"].forEach(function (x) {
      $("#" + x).classList.toggle("hidden", x !== id);
    });
    $("#user-box").classList.toggle("hidden", id !== "app");
  }

  if (!G.cfg.supabaseUrl || !G.cfg.supabaseAnonKey || !window.supabase) {
    afficher("no-config");
    return;
  }
  G.db = window.supabase.createClient(G.cfg.supabaseUrl, G.cfg.supabaseAnonKey);

  async function chargerProfil(user) {
    var r = await G.db.from("profils").select("id, email, nom, role, actif").eq("id", user.id).maybeSingle();
    if (r.error || !r.data || !r.data.actif) { afficher("no-profile"); return; }
    G.moi = r.data;
    $("#user-name").textContent = G.moi.nom;
    $("#user-role").textContent = G.ROLES[G.moi.role] || G.moi.role;
    afficher("app");
    G.construireInterface();
  }

  G.db.auth.getSession().then(function (r) {
    if (r.data && r.data.session) chargerProfil(r.data.session.user);
    else afficher("lock-screen");
  });

  $("#login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = $("#login-btn");
    btn.disabled = true;
    $("#login-error").textContent = "";
    var r = await G.db.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
    btn.disabled = false;
    if (r.error) {
      $("#login-error").textContent = /Invalid login/i.test(r.error.message) ? "E-mail ou mot de passe incorrect."
        : /banned/i.test(r.error.message) ? "Ce compte a été désactivé." : G.errMsg(r.error);
      return;
    }
    $("#password").value = "";
    chargerProfil(r.data.user);
  });

  async function deconnexion() {
    await G.db.auth.signOut();
    location.reload();
  }
  $("#btn-logout").addEventListener("click", deconnexion);
  $("#btn-logout-2").addEventListener("click", deconnexion);
})();
