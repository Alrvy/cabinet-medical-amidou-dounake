/*
 * Noyau de l'application de gestion : connexion Supabase, utilisateur, rôle,
 * utilitaires communs et navigation entre modules.
 * Chaque module s'enregistre avec G.module({ id, label, roles, init(el), show() }).
 */
(function () {
  "use strict";

  var cfg = window.CABINET || {};
  var G = (window.G = {
    cfg: cfg,
    db: null,
    moi: null,          // { id, email, nom, role }
    modules: [],
    ROLES: { admin: "Administrateur", medecin: "Médecin", infirmier: "Infirmier(e)", secretaire: "Secrétaire" }
  });

  G.$ = function (sel, root) { return (root || document).querySelector(sel); };
  G.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  G.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  G.nl2br = function (s) { return G.esc(s).replace(/\n/g, "<br>"); };
  G.today = function () { return new Date().toISOString().slice(0, 10); };
  G.fmtDate = function (iso) { return iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—"; };
  G.fmtDateTime = function (iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };
  G.age = function (iso) {
    if (!iso) return null;
    var b = new Date(iso + "T00:00:00"), n = new Date();
    var a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a;
  };
  G.ageTexte = function (iso) {
    var a = G.age(iso);
    if (a === null) return "";
    if (a >= 2) return a + " ans";
    var b = new Date(iso + "T00:00:00"), n = new Date();
    var mois = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth() - (n.getDate() < b.getDate() ? 1 : 0);
    return Math.max(mois, 0) + " mois";
  };
  G.numDossier = function (n) { return "P-" + String(n).padStart(5, "0"); };

  G.errMsg = function (e) {
    var m = (e && (e.message || e.error)) || "Erreur inconnue";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Pas de connexion Internet. Réessayez.";
    if (/row-level security|permission denied/i.test(m)) return "Votre rôle ne permet pas cette action.";
    return m;
  };

  var toastTimer;
  G.toast = function (msg, isErr) {
    var t = G.$("#toast");
    t.textContent = msg;
    t.className = "toast is-visible" + (isErr ? " toast--err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, isErr ? 6000 : 3000);
  };
  G.status = function (msg, isErr) {
    var el = G.$("#sync-status");
    el.textContent = msg || "";
    el.style.color = isErr ? "var(--danger)" : "";
  };

  G.peut = function () {
    if (!G.moi) return false;
    for (var i = 0; i < arguments.length; i++) if (arguments[i] === G.moi.role) return true;
    return false;
  };
  G.soignant = function () { return G.peut("admin", "medecin", "infirmier"); };

  // Lit les champs d'un formulaire → objet (chaînes vides → null)
  G.lireForm = function (form) {
    var o = {};
    G.$$("[name]", form).forEach(function (el) {
      if (el.type === "checkbox") o[el.name] = el.checked;
      else o[el.name] = el.value.trim() === "" ? null : el.value.trim();
    });
    return o;
  };
  G.remplirForm = function (form, data) {
    G.$$("[name]", form).forEach(function (el) {
      var v = data ? data[el.name] : null;
      if (el.type === "checkbox") el.checked = !!v;
      else el.value = v == null ? "" : (el.type === "date" ? String(v).slice(0, 10) : v);
    });
  };

  // Boutons [data-close] des dialogues
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-close]");
    if (b) b.closest("dialog").close();
  });

  G.module = function (m) { G.modules.push(m); };

  var actif = null;
  G.ouvrir = function (id, arg) {
    var m = G.modules.find(function (x) { return x.id === id; });
    if (!m) return;
    actif = id;
    G.$$(".tab", G.$("#tabs")).forEach(function (t) { t.classList.toggle("is-active", t.dataset.tab === id); });
    G.modules.forEach(function (x) { if (x.el) x.el.classList.toggle("hidden", x.id !== id); });
    G.status("");
    try { localStorage.setItem("gestion_onglet", id); } catch (e) { /* stockage indisponible */ }
    if (m.show) m.show(arg);
  };

  G.construireInterface = function () {
    var tabs = G.$("#tabs"), views = G.$("#views");
    tabs.innerHTML = ""; views.innerHTML = "";
    var visibles = G.modules.filter(function (m) { return m.roles.indexOf(G.moi.role) > -1; });
    visibles.forEach(function (m) {
      var b = document.createElement("button");
      b.className = "tab"; b.dataset.tab = m.id; b.setAttribute("role", "tab");
      b.innerHTML = G.esc(m.label) + ' <span class="tab__count" id="count-' + m.id + '"></span>';
      b.addEventListener("click", function () { G.ouvrir(m.id); });
      tabs.appendChild(b);
      var sec = document.createElement("section");
      sec.id = "view-" + m.id; sec.className = "hidden";
      views.appendChild(sec);
      m.el = sec;
      m.init(sec);
    });
    var dernier = null;
    try { dernier = localStorage.getItem("gestion_onglet"); } catch (e) { /* ignore */ }
    var depart = visibles.some(function (m) { return m.id === dernier; }) ? dernier : (visibles[0] && visibles[0].id);
    if (depart) G.ouvrir(depart);
  };
})();
