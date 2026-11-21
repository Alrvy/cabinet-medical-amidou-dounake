/* Module Utilisateurs (admin) : comptes du personnel + journal d'activité. */
(function () {
  "use strict";
  var G = window.G, $ = G.$, esc = G.esc;
  var el, users = [];
  var TABLES = {
    patients: "Patient", patients_medical: "Infos médicales", consultations: "Consultation",
    constantes: "Constantes", articles: "Article de stock", rendez_vous: "Rendez-vous", profils: "Compte"
  };
  var ACTIONS = { INSERT: "Création", UPDATE: "Modification", DELETE: "Suppression" };

  function roleOptions(sel) {
    return Object.keys(G.ROLES).map(function (r) {
      return '<option value="' + r + '"' + (r === sel ? " selected" : "") + ">" + G.ROLES[r] + "</option>";
    }).join("");
  }

  function init(root) {
    el = root;
    el.innerHTML = '' +
      '<div class="toolbar"><button class="btn btn--small" id="usr-add">+ Nouvel utilisateur</button>' +
        '<button class="btn btn--small btn--ghost" id="usr-refresh">Actualiser</button></div>' +
      '<div class="table-wrap"><table class="stock-table"><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr></thead>' +
        '<tbody id="usr-body"></tbody></table></div>' +
      '<div class="card-box"><div class="card-box__head"><h3>Droits par rôle</h3></div>' +
        '<ul class="droits">' +
          '<li><strong>Administrateur</strong> : tout, y compris la gestion des comptes et le journal.</li>' +
          '<li><strong>Médecin</strong> : patients, dossier médical, consultations, constantes, stock, rendez-vous.</li>' +
          '<li><strong>Infirmier(e)</strong> : patients, dossier médical, constantes, stock ; consultations et rendez-vous en lecture.</li>' +
          '<li><strong>Secrétaire</strong> : identité des patients et rendez-vous ; aucun accès au médical ni au stock.</li>' +
        '</ul></div>' +
      '<div class="card-box"><div class="card-box__head"><h3>Journal d\'activité</h3>' +
        '<button class="btn btn--small btn--ghost" id="jr-refresh">Actualiser</button></div>' +
        '<div class="table-wrap table-wrap--flat"><table class="stock-table"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Élément</th></tr></thead>' +
        '<tbody id="jr-body"></tbody></table></div></div>' +
      // Création
      '<dialog id="dlg-usr"><form class="form" id="form-usr" method="dialog">' +
        '<h2>Nouvel utilisateur</h2>' +
        '<label>Nom complet *<input name="nom" required placeholder="Ex : Mariam Coulibaly"></label>' +
        '<label>E-mail *<input name="email" type="email" required autocomplete="off"></label>' +
        '<label>Rôle *<select name="role">' + roleOptions("secretaire") + '</select></label>' +
        '<label>Mot de passe provisoire * (8 caractères min.)<input name="password" type="text" minlength="8" required autocomplete="off"></label>' +
        '<p class="small-muted">Communiquez ce mot de passe à la personne en main propre. Vous pourrez le réinitialiser à tout moment.</p>' +
        '<p class="form__error" id="usr-form-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn" id="usr-submit">Créer le compte</button></div>' +
      '</form></dialog>' +
      // Mot de passe
      '<dialog id="dlg-pwd"><form class="form" id="form-pwd" method="dialog">' +
        '<h2>Nouveau mot de passe</h2><p class="small-muted" id="pwd-for"></p>' +
        '<label>Mot de passe (8 caractères min.)<input name="password" type="text" minlength="8" required autocomplete="off"></label>' +
        '<p class="form__error" id="pwd-form-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>' +
      '</form></dialog>';

    $("#usr-add", el).addEventListener("click", function () {
      var f = $("#form-usr", el);
      f.reset();
      f.elements.password.value = motDePasse();
      $("#usr-form-err", el).textContent = "";
      $("#dlg-usr", el).showModal();
    });
    $("#usr-refresh", el).addEventListener("click", charger);
    $("#jr-refresh", el).addEventListener("click", journal);
    $("#form-usr", el).addEventListener("submit", creer);
    $("#form-pwd", el).addEventListener("submit", changerMotDePasse);
    $("#usr-body", el).addEventListener("change", function (e) {
      if (e.target.matches(".role-select")) modifier(e.target.dataset.id, { role: e.target.value });
    });
    $("#usr-body", el).addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]");
      if (!b) return;
      var u = users.find(function (x) { return x.id === b.dataset.id; });
      if (b.dataset.act === "toggle") {
        var msg = u.actif ? "Désactiver le compte de " + u.nom + " ? Il ne pourra plus se connecter." : "Réactiver le compte de " + u.nom + " ?";
        if (confirm(msg)) modifier(u.id, { actif: !u.actif });
      }
      if (b.dataset.act === "pwd") {
        var f = $("#form-pwd", el);
        f.dataset.id = u.id;
        f.elements.password.value = motDePasse();
        $("#pwd-for", el).textContent = u.nom + " — " + u.email;
        $("#pwd-form-err", el).textContent = "";
        $("#dlg-pwd", el).showModal();
      }
    });
  }

  // Mot de passe provisoire lisible (sans caractères ambigus)
  function motDePasse() {
    var c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
    var r = new Uint32Array(10);
    crypto.getRandomValues(r);
    for (var i = 0; i < r.length; i++) s += c[r[i] % c.length];
    return s;
  }

  async function appeler(body) {
    var r = await G.db.functions.invoke("gerer-utilisateurs", { body: body });
    if (r.error) {
      var msg = G.errMsg(r.error);
      try {
        if (r.error.context && r.error.context.json) msg = (await r.error.context.json()).error || msg;
      } catch (e) { /* réponse non JSON */ }
      if (/Failed to send|not found|404/i.test(msg)) msg = "La fonction serveur « gerer-utilisateurs » n'est pas déployée sur Supabase.";
      return { error: msg };
    }
    return r.data || {};
  }

  async function charger() {
    var r = await G.db.from("profils").select("*").order("nom");
    if (r.error) { G.status(G.errMsg(r.error), true); return; }
    users = r.data;
    $("#usr-body", el).innerHTML = users.map(function (u) {
      var moi = u.id === G.moi.id;
      return "<tr" + (u.actif ? "" : ' class="row-off"') + ">" +
        "<td><strong>" + esc(u.nom) + "</strong>" + (moi ? ' <span class="small-muted">(vous)</span>' : "") + "</td>" +
        "<td>" + esc(u.email) + "</td>" +
        "<td>" + (moi ? G.ROLES[u.role] : '<select class="role-select statut-select" data-id="' + u.id + '">' + roleOptions(u.role) + "</select>") + "</td>" +
        "<td>" + (u.actif ? '<span class="badge badge--ok">Actif</span>' : '<span class="badge badge--out">Désactivé</span>') + "</td>" +
        '<td><div class="actions">' +
          '<button class="btn btn--small btn--ghost" data-act="pwd" data-id="' + u.id + '">Mot de passe</button>' +
          (moi ? "" : '<button class="btn btn--small btn--ghost" data-act="toggle" data-id="' + u.id + '">' + (u.actif ? "Désactiver" : "Réactiver") + "</button>") +
        "</div></td></tr>";
    }).join("");
    journal();
  }

  async function journal() {
    var r = await G.db.from("journal").select("*").order("quand", { ascending: false }).limit(200);
    if (r.error) { $("#jr-body", el).innerHTML = '<tr><td colspan="4">' + esc(G.errMsg(r.error)) + "</td></tr>"; return; }
    var noms = {};
    users.forEach(function (u) { noms[u.id] = u.nom; });
    $("#jr-body", el).innerHTML = r.data.length ? r.data.map(function (j) {
      return "<tr><td>" + G.fmtDateTime(j.quand) + "</td><td>" + esc(noms[j.utilisateur] || (j.utilisateur ? "?" : "Site public / système")) + "</td>" +
        "<td>" + (ACTIONS[j.action] || j.action) + "</td><td>" + (TABLES[j.table_nom] || esc(j.table_nom)) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="small-muted">Aucune activité.</td></tr>';
  }

  async function creer(e) {
    e.preventDefault();
    var d = G.lireForm(e.target), btn = $("#usr-submit", el);
    btn.disabled = true;
    var r = await appeler({ action: "creer", nom: d.nom, email: d.email, role: d.role, password: d.password });
    btn.disabled = false;
    if (r.error) { $("#usr-form-err", el).textContent = r.error; return; }
    $("#dlg-usr", el).close();
    G.toast("Compte créé pour " + d.nom + ".");
    charger();
  }

  async function modifier(id, maj) {
    maj.action = "modifier";
    maj.id = id;
    var r = await appeler(maj);
    if (r.error) G.toast(r.error, true); else G.toast("Compte mis à jour.");
    charger();
  }

  async function changerMotDePasse(e) {
    e.preventDefault();
    var f = e.target;
    var r = await appeler({ action: "motdepasse", id: f.dataset.id, password: f.elements.password.value.trim() });
    if (r.error) { $("#pwd-form-err", el).textContent = r.error; return; }
    $("#dlg-pwd", el).close();
    G.toast("Mot de passe modifié.");
  }

  G.module({
    id: "utilisateurs",
    label: "Utilisateurs",
    roles: ["admin"],
    init: init,
    show: charger
  });
})();
