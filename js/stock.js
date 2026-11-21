/*
 * Espace cabinet : gestion de stock + rendez-vous, données dans Supabase.
 * Schéma et règles de sécurité : supabase/schema.sql
 */
(function () {
  "use strict";

  var cfg = window.CABINET;
  var JOURS_ALERTE = 30;
  var $ = function (id) { return document.getElementById(id); };

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    $("no-config").classList.remove("hidden");
    return;
  }
  var db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  var items = [];
  var rdvs = [];

  // ---------- Utilitaires ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) { return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—"; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysUntil(iso) {
    if (!iso) return Infinity;
    return Math.floor((new Date(iso + "T00:00:00Z") - new Date(today() + "T00:00:00Z")) / 86400000);
  }
  function status(msg, isErr) {
    var el = $("sync-status");
    el.textContent = msg || "";
    el.style.color = isErr ? "var(--danger)" : "";
  }
  function errMsg(e) {
    var m = (e && e.message) || "Erreur inconnue";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Pas de connexion Internet. Réessayez.";
    return m;
  }

  // ---------- Authentification ----------
  function showLogin() {
    $("app").classList.add("hidden");
    $("btn-logout").classList.add("hidden");
    $("lock-screen").classList.remove("hidden");
  }
  function showApp() {
    $("lock-screen").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("btn-logout").classList.remove("hidden");
    loadItems();
    loadRdv();
  }

  db.auth.getSession().then(function (r) {
    if (r.data && r.data.session) showApp(); else showLogin();
  });

  $("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var btn = $("login-btn");
    btn.disabled = true;
    $("login-error").textContent = "";
    var r = await db.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    btn.disabled = false;
    if (r.error) {
      $("login-error").textContent = /Invalid login/i.test(r.error.message)
        ? "E-mail ou mot de passe incorrect." : errMsg(r.error);
      return;
    }
    $("password").value = "";
    showApp();
  });

  $("btn-logout").addEventListener("click", async function () {
    await db.auth.signOut();
    location.reload();
  });

  // ---------- Onglets ----------
  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("is-active", x === t); });
      $("tab-stock").classList.toggle("hidden", t.dataset.tab !== "stock");
      $("tab-rdv").classList.toggle("hidden", t.dataset.tab !== "rdv");
    });
  });

  // =====================================================================
  //                                STOCK
  // =====================================================================
  async function loadItems() {
    status("Chargement…");
    var r = await db.from("articles").select("*").order("nom");
    if (r.error) { status(errMsg(r.error), true); return; }
    items = r.data;
    status("Dernière mise à jour : " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    render();
  }

  function etat(it) {
    var s = [];
    var d = daysUntil(it.peremption);
    if (it.quantite <= 0) s.push("out");
    else if (it.quantite <= it.seuil) s.push("low");
    if (d < 0) s.push("exp");
    else if (d <= JOURS_ALERTE) s.push("soon");
    return s;
  }
  function badges(it) {
    var s = etat(it), d = daysUntil(it.peremption), html = "";
    if (s.indexOf("out") > -1) html += '<span class="badge badge--out">Rupture</span> ';
    if (s.indexOf("low") > -1) html += '<span class="badge badge--low">Stock faible</span> ';
    if (s.indexOf("exp") > -1) html += '<span class="badge badge--exp">Périmé</span> ';
    if (s.indexOf("soon") > -1) html += '<span class="badge badge--soon">Expire dans ' + d + ' j</span> ';
    return html || '<span class="badge badge--ok">OK</span>';
  }

  function render() {
    var q = $("search").value.trim().toLowerCase();
    var cat = $("filter-cat").value;
    var st = $("filter-state").value;

    var cats = Array.from(new Set(items.map(function (i) { return i.categorie; }).filter(Boolean))).sort();
    $("filter-cat").innerHTML = '<option value="">Toutes catégories</option>' +
      cats.map(function (c) { return '<option' + (c === cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("");

    var k = { low: 0, out: 0, exp: 0 };
    items.forEach(function (it) {
      var s = etat(it);
      if (s.indexOf("low") > -1) k.low++;
      if (s.indexOf("out") > -1) k.out++;
      if (s.indexOf("exp") > -1 || s.indexOf("soon") > -1) k.exp++;
    });
    $("k-total").textContent = items.length;
    $("k-low").textContent = k.low;
    $("k-out").textContent = k.out;
    $("k-exp").textContent = k.exp;

    var rows = items.filter(function (it) {
      if (q && (it.nom + " " + (it.fournisseur || "") + " " + (it.categorie || "")).toLowerCase().indexOf(q) === -1) return false;
      if (cat && it.categorie !== cat) return false;
      if (st) {
        var s = etat(it);
        if (st === "exp" ? (s.indexOf("exp") === -1 && s.indexOf("soon") === -1) : s.indexOf(st) === -1) return false;
      }
      return true;
    });

    $("stock-body").innerHTML = rows.map(function (it) {
      return "<tr>" +
        "<td><strong>" + esc(it.nom) + "</strong></td>" +
        "<td>" + esc(it.categorie || "—") + "</td>" +
        '<td class="qty">' + it.quantite + " " + esc(it.unite || "") + "</td>" +
        "<td>" + it.seuil + "</td>" +
        "<td>" + fmtDate(it.peremption) + "</td>" +
        "<td>" + esc(it.fournisseur || "—") + "</td>" +
        "<td>" + badges(it) + "</td>" +
        '<td><div class="actions">' +
          '<button class="icon-btn" title="Entrée / sortie" data-act="move" data-id="' + it.id + '">±</button>' +
          '<button class="icon-btn" title="Modifier" data-act="edit" data-id="' + it.id + '">✏️</button>' +
          '<button class="icon-btn" title="Supprimer" data-act="del" data-id="' + it.id + '">🗑️</button>' +
        "</div></td></tr>";
    }).join("");

    $("empty").classList.toggle("hidden", rows.length > 0);
    $("empty").textContent = items.length
      ? "Aucun article ne correspond à la recherche."
      : "Aucun article. Cliquez sur « + Ajouter un article » pour commencer.";
  }

  ["search", "filter-cat", "filter-state"].forEach(function (id) { $(id).addEventListener("input", render); });
  $("btn-refresh").addEventListener("click", loadItems);

  document.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", function () { b.closest("dialog").close(); });
  });

  // ----- Ajout / modification -----
  var editingId = null;
  var itemForm = $("item-form");

  function openItem(it) {
    editingId = it ? it.id : null;
    $("item-title").textContent = it ? "Modifier l'article" : "Nouvel article";
    itemForm.reset();
    $("item-error").textContent = "";
    // La quantité d'un article existant ne change que par un mouvement (traçabilité)
    $("qte-wrap").classList.toggle("hidden", !!it);
    $("qte-hint").classList.toggle("hidden", !it);
    itemForm.elements.quantite.required = !it;
    if (it) {
      ["nom", "categorie", "unite", "seuil", "peremption", "prix", "fournisseur"].forEach(function (f) {
        itemForm.elements[f].value = it[f] == null ? "" : it[f];
      });
    }
    $("dlg-item").showModal();
  }
  $("btn-add").addEventListener("click", function () { openItem(null); });

  itemForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = itemForm.elements;
    var nom = f.nom.value.trim();
    if (!nom) { $("item-error").textContent = "Le nom est obligatoire."; return; }
    var champs = {
      nom: nom,
      categorie: f.categorie.value.trim() || null,
      unite: f.unite.value.trim() || null,
      seuil: parseInt(f.seuil.value, 10) || 0,
      peremption: f.peremption.value || null,
      prix: f.prix.value ? parseInt(f.prix.value, 10) : null,
      fournisseur: f.fournisseur.value.trim() || null
    };
    var r;
    if (editingId) {
      r = await db.from("articles").update(champs).eq("id", editingId);
    } else {
      var qte = parseInt(f.quantite.value, 10);
      if (isNaN(qte) || qte < 0) { $("item-error").textContent = "Quantité invalide."; return; }
      r = await db.from("articles").insert(Object.assign({}, champs, { quantite: 0 })).select().single();
      if (!r.error && qte > 0) {
        r = await db.rpc("enregistrer_mouvement", { p_article_id: r.data.id, p_type: "in", p_quantite: qte, p_note: "Stock initial" });
      }
    }
    if (r.error) { $("item-error").textContent = errMsg(r.error); return; }
    $("dlg-item").close();
    loadItems();
  });

  // ----- Mouvements -----
  var moveId = null;
  var moveForm = $("move-form");

  moveForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var qte = parseInt(moveForm.elements.qte.value, 10);
    if (!qte || qte < 1) { $("move-error").textContent = "Quantité invalide."; return; }
    var r = await db.rpc("enregistrer_mouvement", {
      p_article_id: moveId,
      p_type: moveForm.elements.type.value,
      p_quantite: qte,
      p_note: moveForm.elements.note.value.trim() || null
    });
    if (r.error) { $("move-error").textContent = errMsg(r.error); return; }
    $("dlg-move").close();
    loadItems();
  });

  $("stock-body").addEventListener("click", async function (e) {
    var b = e.target.closest("button[data-act]");
    if (!b) return;
    var it = items.find(function (i) { return i.id === b.dataset.id; });
    if (!it) return;
    if (b.dataset.act === "edit") openItem(it);
    if (b.dataset.act === "move") {
      moveId = it.id;
      moveForm.reset();
      $("move-error").textContent = "";
      $("move-title").textContent = it.nom;
      $("move-info").textContent = "Stock actuel : " + it.quantite + " " + (it.unite || "");
      $("dlg-move").showModal();
    }
    if (b.dataset.act === "del" && confirm("Supprimer « " + it.nom + " » du stock ? (l'historique est conservé)")) {
      var r = await db.from("articles").delete().eq("id", it.id);
      if (r.error) { status(errMsg(r.error), true); return; }
      loadItems();
    }
  });

  // ----- Historique -----
  $("btn-history").addEventListener("click", async function () {
    $("history-list").innerHTML = "<li class='small-muted'>Chargement…</li>";
    $("dlg-history").showModal();
    var r = await db.from("mouvements").select("*").order("cree_le", { ascending: false }).limit(300);
    if (r.error) { $("history-list").innerHTML = "<li class='small-muted'>" + esc(errMsg(r.error)) + "</li>"; return; }
    $("history-list").innerHTML = r.data.length
      ? r.data.map(function (m) {
          var d = new Date(m.cree_le);
          return "<li><span class='" + m.type + "'>" + (m.type === "in" ? "+" : "−") + m.quantite + "</span> " +
            esc(m.article_nom) + (m.note ? " — <em>" + esc(m.note) + "</em>" : "") +
            "<br><span class='small-muted'>" + d.toLocaleDateString("fr-FR") + " " +
            d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + "</span></li>";
        }).join("")
      : "<li class='small-muted'>Aucun mouvement enregistré.</li>";
  });

  // ----- Export CSV -----
  $("btn-csv").addEventListener("click", function () {
    var head = ["Article", "Catégorie", "Quantité", "Unité", "Seuil", "Péremption", "Prix unitaire (FCFA)", "Fournisseur"];
    var cell = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
    var lines = [head.map(cell).join(";")].concat(items.map(function (i) {
      return [i.nom, i.categorie, i.quantite, i.unite, i.seuil, fmtDate(i.peremption), i.prix, i.fournisseur].map(cell).join(";");
    }));
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "stock-cabinet-" + today() + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });

  // =====================================================================
  //                             RENDEZ-VOUS
  // =====================================================================
  var STATUTS = { en_attente: "En attente", confirme: "Confirmé", annule: "Annulé", termine: "Terminé" };

  async function loadRdv() {
    var filtre = $("rdv-filter").value;
    var q = db.from("rendez_vous").select("*")
      .order("date_souhaitee", { ascending: filtre !== "tous" }).order("cree_le");
    if (filtre === "a_venir") q = q.gte("date_souhaitee", today()).in("statut", ["en_attente", "confirme"]);
    if (filtre === "en_attente") q = q.eq("statut", "en_attente");
    if (filtre === "tous") q = q.limit(500);
    var r = await q;
    if (r.error) { status(errMsg(r.error), true); return; }
    rdvs = r.data;

    var nb = await db.from("rendez_vous").select("id", { count: "exact", head: true }).eq("statut", "en_attente");
    $("rdv-count").textContent = nb.count ? nb.count : "";

    $("rdv-body").innerHTML = rdvs.map(function (v) {
      return "<tr>" +
        "<td><strong>" + fmtDate(v.date_souhaitee) + "</strong></td>" +
        "<td>" + esc(v.moment || "—") + "</td>" +
        "<td>" + esc(v.nom) + "</td>" +
        '<td><a href="tel:' + esc(v.telephone.replace(/\s/g, "")) + '">' + esc(v.telephone) + "</a></td>" +
        '<td class="motif">' + esc(v.motif || "—") + "</td>" +
        '<td><select class="statut-select" data-id="' + v.id + '">' +
          Object.keys(STATUTS).map(function (s) {
            return '<option value="' + s + '"' + (s === v.statut ? " selected" : "") + ">" + STATUTS[s] + "</option>";
          }).join("") +
        "</select></td></tr>";
    }).join("");
    $("rdv-empty").classList.toggle("hidden", rdvs.length > 0);
  }

  $("rdv-filter").addEventListener("change", loadRdv);
  $("btn-rdv-refresh").addEventListener("click", loadRdv);
  $("rdv-body").addEventListener("change", async function (e) {
    if (!e.target.matches(".statut-select")) return;
    var r = await db.from("rendez_vous").update({ statut: e.target.value }).eq("id", e.target.dataset.id);
    if (r.error) { status(errMsg(r.error), true); return; }
    loadRdv();
  });
})();
