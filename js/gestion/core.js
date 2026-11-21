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

  G.fcfa = function (n) { return Number(n || 0).toLocaleString("fr-FR").replace(/ | /g, " ") + " FCFA"; };

  // Impression d'un document (ordonnance, reçu) dans une fenêtre dédiée, à l'en-tête du cabinet
  G.imprimer = function (titre, corps, format) {
    var w = window.open("", "_blank", "width=820,height=900");
    if (!w) { G.toast("Autorisez les fenêtres pop-up pour imprimer.", true); return; }
    var c = G.cfg;
    w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>' + G.esc(titre) + '</title><style>' +
      '@page{size:' + (format || "A5") + ';margin:12mm}' +
      'body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;font-size:13px;margin:0}' +
      '.ent{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f766e;padding-bottom:8px;margin-bottom:14px}' +
      '.ent h1{margin:0;font-size:18px;color:#0f766e}.ent p{margin:2px 0;font-size:11px;color:#444}' +
      '.croix{width:38px;height:38px;border-radius:8px;background:#0f766e;color:#fff;font-size:30px;line-height:38px;text-align:center;font-weight:700}' +
      'h2{text-align:center;letter-spacing:.15em;font-size:16px;margin:10px 0 14px}' +
      '.meta{display:flex;justify-content:space-between;gap:10px;margin-bottom:12px}.meta div{line-height:1.5}' +
      'table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top}' +
      'th{font-size:11px;text-transform:uppercase;color:#555}.r{text-align:right}' +
      'ol{padding-left:18px}ol li{margin-bottom:10px}ol li strong{font-size:14px}.pos{color:#333}' +
      '.tot td{font-weight:700;font-size:15px;border-top:2px solid #111;border-bottom:none}' +
      '.sign{margin-top:36px;text-align:right}.sign span{display:inline-block;border-top:1px solid #111;padding-top:4px;min-width:180px;text-align:center}' +
      '.pied{margin-top:24px;font-size:10px;color:#666;text-align:center}.annule{color:#b91c1c;font-weight:700;text-align:center;font-size:18px;border:2px solid #b91c1c;padding:6px;margin-bottom:10px}' +
      '@media screen{body{padding:20px;max-width:560px;margin:auto}.noprint{text-align:center;margin-bottom:16px}.noprint button{font-size:15px;padding:8px 18px;cursor:pointer}}' +
      '@media print{.noprint{display:none}}' +
      '</style></head><body>' +
      '<div class="noprint"><button onclick="window.print()">🖨️ Imprimer</button></div>' +
      '<div class="ent"><div><h1>' + G.esc(c.nom) + '</h1><p>' + G.esc(c.adresse || "") + '</p><p>Tél : ' + G.esc(c.telephones || "") + '</p></div><div class="croix">+</div></div>' +
      corps + '</body></html>');
    w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (e) { /* l'utilisateur imprimera avec le bouton */ } }, 400);
  };

  G.module = function (m) { G.modules.push(m); };

  var actif = null;
  G.ouvrir = function (id, arg) {
    var m = G.modules.find(function (x) { return x.id === id; });
    if (!m) return;
    actif = id;
    G.$$(".tab", G.$("#tabs")).forEach(function (t) { t.classList.toggle("is-active", t.dataset.tab === id); });
    // "view-off" (et non display:none) : les dialogues d'un onglet masqué restent utilisables depuis les autres
    G.modules.forEach(function (x) { if (x.el) x.el.classList.toggle("view-off", x.id !== id); });
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
      sec.id = "view-" + m.id; sec.className = "view-off";
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
