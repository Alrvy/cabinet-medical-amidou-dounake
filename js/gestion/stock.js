/* Module Stock : articles, entrées/sorties, alertes, historique, export. */
(function () {
  "use strict";
  var G = window.G, $ = G.$, esc = G.esc;
  var JOURS_ALERTE = 30;
  var el, items = [], editingId = null, moveId = null;

  function daysUntil(iso) {
    if (!iso) return Infinity;
    return Math.floor((new Date(iso + "T00:00:00Z") - new Date(G.today() + "T00:00:00Z")) / 86400000);
  }
  function etat(it) {
    var s = [], d = daysUntil(it.peremption);
    if (it.quantite <= 0) s.push("out"); else if (it.quantite <= it.seuil) s.push("low");
    if (d < 0) s.push("exp"); else if (d <= JOURS_ALERTE) s.push("soon");
    return s;
  }
  function badges(it) {
    var s = etat(it), d = daysUntil(it.peremption), h = "";
    if (s.indexOf("out") > -1) h += '<span class="badge badge--out">Rupture</span> ';
    if (s.indexOf("low") > -1) h += '<span class="badge badge--low">Stock faible</span> ';
    if (s.indexOf("exp") > -1) h += '<span class="badge badge--exp">Périmé</span> ';
    if (s.indexOf("soon") > -1) h += '<span class="badge badge--soon">Expire dans ' + d + ' j</span> ';
    return h || '<span class="badge badge--ok">OK</span>';
  }

  function init(root) {
    el = root;
    el.innerHTML = '' +
      '<div class="kpis">' +
        '<div class="kpi"><strong id="k-total">0</strong><span>articles</span></div>' +
        '<div class="kpi kpi--warn"><strong id="k-low">0</strong><span>stock faible</span></div>' +
        '<div class="kpi kpi--danger"><strong id="k-out">0</strong><span>ruptures</span></div>' +
        '<div class="kpi kpi--danger"><strong id="k-exp">0</strong><span>périmés / &lt; 30 jours</span></div>' +
      '</div>' +
      '<div class="toolbar">' +
        '<input type="search" id="st-search" placeholder="Rechercher un article, un fournisseur…">' +
        '<select id="st-cat"><option value="">Toutes catégories</option></select>' +
        '<select id="st-state"><option value="">Tous états</option><option value="low">Stock faible</option><option value="out">Rupture</option><option value="exp">Périmé / bientôt</option></select>' +
        '<button class="btn btn--small" id="st-add">+ Ajouter un article</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="stock-table"><thead><tr>' +
        '<th>Article</th><th>Catégorie</th><th>Quantité</th><th>Seuil</th><th>Péremption</th><th>Fournisseur</th><th>État</th><th>Actions</th>' +
      '</tr></thead><tbody id="st-body"></tbody></table><p id="st-empty" class="empty hidden"></p></div>' +
      '<div class="toolbar">' +
        '<button class="btn btn--small btn--ghost" id="st-history">Historique des mouvements</button>' +
        '<button class="btn btn--small btn--ghost" id="st-csv">Exporter (Excel/CSV)</button>' +
        '<button class="btn btn--small btn--ghost" id="st-refresh">Actualiser</button>' +
      '</div>' +
      // Article
      '<dialog id="dlg-item"><form id="item-form" class="form" method="dialog">' +
        '<h2 id="item-title">Nouvel article</h2>' +
        '<label>Nom de l\'article *<input name="nom" required placeholder="Ex : Paracétamol 500 mg"></label>' +
        '<div class="form__row"><label>Catégorie<input name="categorie" list="cats" placeholder="Ex : Médicament">' +
          '<datalist id="cats"><option value="Médicament"><option value="Consommable"><option value="Matériel"><option value="Réactif / labo"></datalist></label>' +
          '<label>Unité<input name="unite" placeholder="Ex : boîte, flacon"></label></div>' +
        '<div class="form__row"><label id="qte-wrap">Quantité initiale *<input name="quantite" type="number" min="0" step="1" value="0"></label>' +
          '<label>Seuil d\'alerte<input name="seuil" type="number" min="0" step="1" value="5"></label></div>' +
        '<div class="form__row"><label>Date de péremption<input name="peremption" type="date"></label>' +
          '<label>Prix unitaire (FCFA)<input name="prix" type="number" min="0" step="1"></label></div>' +
        '<label>Fournisseur<input name="fournisseur"></label>' +
        '<p class="small-muted hidden" id="qte-hint">Pour changer la quantité, utilisez le bouton ± (entrée / sortie).</p>' +
        '<p class="form__error" id="item-error"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>' +
      '</form></dialog>' +
      // Mouvement
      '<dialog id="dlg-move"><form id="move-form" class="form" method="dialog">' +
        '<h2 id="move-title">Mouvement</h2><p class="small-muted" id="move-info"></p>' +
        '<div class="form__row"><label>Type<select name="type"><option value="in">Entrée (réception)</option><option value="out">Sortie (utilisation)</option></select></label>' +
          '<label>Quantité *<input name="qte" type="number" min="1" step="1" value="1" required></label></div>' +
        '<label>Note<input name="note" placeholder="Ex : livraison, patient, perte…"></label>' +
        '<p class="form__error" id="move-error"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn">Valider</button></div>' +
      '</form></dialog>' +
      // Historique
      '<dialog id="dlg-history"><div class="form"><h2>Historique des mouvements</h2><ul class="history" id="history-list"></ul>' +
        '<div class="dialog-actions"><button type="button" class="btn" data-close>Fermer</button></div></div></dialog>';

    ["st-search", "st-cat", "st-state"].forEach(function (id) { $("#" + id, el).addEventListener("input", render); });
    $("#st-refresh", el).addEventListener("click", charger);
    $("#st-add", el).addEventListener("click", function () { ouvrirArticle(null); });
    $("#item-form", el).addEventListener("submit", enregistrerArticle);
    $("#move-form", el).addEventListener("submit", enregistrerMouvement);
    $("#st-body", el).addEventListener("click", actions);
    $("#st-history", el).addEventListener("click", historique);
    $("#st-csv", el).addEventListener("click", exporter);
  }

  async function charger() {
    var r = await G.db.from("articles").select("*").order("nom");
    if (r.error) { G.status(G.errMsg(r.error), true); return; }
    items = r.data;
    var badge = $("#count-stock");
    var alertes = items.filter(function (i) { return etat(i).length; }).length;
    if (badge) badge.textContent = alertes || "";
    render();
  }

  function render() {
    var q = $("#st-search", el).value.trim().toLowerCase(), cat = $("#st-cat", el).value, st = $("#st-state", el).value;
    var cats = Array.from(new Set(items.map(function (i) { return i.categorie; }).filter(Boolean))).sort();
    $("#st-cat", el).innerHTML = '<option value="">Toutes catégories</option>' +
      cats.map(function (c) { return "<option" + (c === cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("");

    var k = { low: 0, out: 0, exp: 0 };
    items.forEach(function (it) {
      var s = etat(it);
      if (s.indexOf("low") > -1) k.low++;
      if (s.indexOf("out") > -1) k.out++;
      if (s.indexOf("exp") > -1 || s.indexOf("soon") > -1) k.exp++;
    });
    $("#k-total", el).textContent = items.length;
    $("#k-low", el).textContent = k.low;
    $("#k-out", el).textContent = k.out;
    $("#k-exp", el).textContent = k.exp;

    var rows = items.filter(function (it) {
      if (q && (it.nom + " " + (it.fournisseur || "") + " " + (it.categorie || "")).toLowerCase().indexOf(q) === -1) return false;
      if (cat && it.categorie !== cat) return false;
      if (st) {
        var s = etat(it);
        if (st === "exp" ? (s.indexOf("exp") === -1 && s.indexOf("soon") === -1) : s.indexOf(st) === -1) return false;
      }
      return true;
    });
    $("#st-body", el).innerHTML = rows.map(function (it) {
      return "<tr><td><strong>" + esc(it.nom) + "</strong></td><td>" + esc(it.categorie || "—") + "</td>" +
        '<td class="qty">' + it.quantite + " " + esc(it.unite || "") + "</td><td>" + it.seuil + "</td>" +
        "<td>" + G.fmtDate(it.peremption) + "</td><td>" + esc(it.fournisseur || "—") + "</td><td>" + badges(it) + "</td>" +
        '<td><div class="actions">' +
          '<button class="icon-btn" title="Entrée / sortie" data-act="move" data-id="' + it.id + '">±</button>' +
          '<button class="icon-btn" title="Modifier" data-act="edit" data-id="' + it.id + '">✏️</button>' +
          (G.peut("admin", "medecin") ? '<button class="icon-btn" title="Supprimer" data-act="del" data-id="' + it.id + '">🗑️</button>' : "") +
        "</div></td></tr>";
    }).join("");
    var vide = $("#st-empty", el);
    vide.classList.toggle("hidden", rows.length > 0);
    vide.textContent = items.length ? "Aucun article ne correspond à la recherche." : "Aucun article. Cliquez sur « + Ajouter un article ».";
  }

  function ouvrirArticle(it) {
    var f = $("#item-form", el);
    editingId = it ? it.id : null;
    $("#item-title", el).textContent = it ? "Modifier l'article" : "Nouvel article";
    f.reset();
    $("#item-error", el).textContent = "";
    $("#qte-wrap", el).classList.toggle("hidden", !!it);
    $("#qte-hint", el).classList.toggle("hidden", !it);
    if (it) ["nom", "categorie", "unite", "seuil", "peremption", "prix", "fournisseur"].forEach(function (k) {
      f.elements[k].value = it[k] == null ? "" : it[k];
    });
    $("#dlg-item", el).showModal();
  }

  async function enregistrerArticle(e) {
    e.preventDefault();
    var f = e.target.elements, err = $("#item-error", el);
    var nom = f.nom.value.trim();
    if (!nom) { err.textContent = "Le nom est obligatoire."; return; }
    var champs = {
      nom: nom, categorie: f.categorie.value.trim() || null, unite: f.unite.value.trim() || null,
      seuil: parseInt(f.seuil.value, 10) || 0, peremption: f.peremption.value || null,
      prix: f.prix.value ? parseInt(f.prix.value, 10) : null, fournisseur: f.fournisseur.value.trim() || null
    };
    var r;
    if (editingId) {
      r = await G.db.from("articles").update(champs).eq("id", editingId);
    } else {
      var qte = parseInt(f.quantite.value, 10);
      if (isNaN(qte) || qte < 0) { err.textContent = "Quantité invalide."; return; }
      r = await G.db.from("articles").insert(Object.assign({}, champs, { quantite: 0 })).select().single();
      if (!r.error && qte > 0) {
        r = await G.db.rpc("enregistrer_mouvement", { p_article_id: r.data.id, p_type: "in", p_quantite: qte, p_note: "Stock initial" });
      }
    }
    if (r.error) { err.textContent = G.errMsg(r.error); return; }
    $("#dlg-item", el).close();
    charger();
  }

  async function enregistrerMouvement(e) {
    e.preventDefault();
    var f = e.target.elements, qte = parseInt(f.qte.value, 10);
    if (!qte || qte < 1) { $("#move-error", el).textContent = "Quantité invalide."; return; }
    var r = await G.db.rpc("enregistrer_mouvement", {
      p_article_id: moveId, p_type: f.type.value, p_quantite: qte, p_note: f.note.value.trim() || null
    });
    if (r.error) { $("#move-error", el).textContent = G.errMsg(r.error); return; }
    $("#dlg-move", el).close();
    charger();
  }

  async function actions(e) {
    var b = e.target.closest("button[data-act]");
    if (!b) return;
    var it = items.find(function (i) { return i.id === b.dataset.id; });
    if (!it) return;
    if (b.dataset.act === "edit") ouvrirArticle(it);
    if (b.dataset.act === "move") {
      moveId = it.id;
      $("#move-form", el).reset();
      $("#move-error", el).textContent = "";
      $("#move-title", el).textContent = it.nom;
      $("#move-info", el).textContent = "Stock actuel : " + it.quantite + " " + (it.unite || "");
      $("#dlg-move", el).showModal();
    }
    if (b.dataset.act === "del" && confirm("Supprimer « " + it.nom + " » du stock ? (l'historique est conservé)")) {
      var r = await G.db.from("articles").delete().eq("id", it.id);
      if (r.error) { G.toast(G.errMsg(r.error), true); return; }
      charger();
    }
  }

  async function historique() {
    var list = $("#history-list", el);
    list.innerHTML = "<li class='small-muted'>Chargement…</li>";
    $("#dlg-history", el).showModal();
    var r = await G.db.from("mouvements").select("*").order("cree_le", { ascending: false }).limit(300);
    if (r.error) { list.innerHTML = "<li class='small-muted'>" + esc(G.errMsg(r.error)) + "</li>"; return; }
    list.innerHTML = r.data.length ? r.data.map(function (m) {
      return "<li><span class='" + m.type + "'>" + (m.type === "in" ? "+" : "−") + m.quantite + "</span> " + esc(m.article_nom) +
        (m.note ? " — <em>" + esc(m.note) + "</em>" : "") + "<br><span class='small-muted'>" + G.fmtDateTime(m.cree_le) + "</span></li>";
    }).join("") : "<li class='small-muted'>Aucun mouvement enregistré.</li>";
  }

  function exporter() {
    var head = ["Article", "Catégorie", "Quantité", "Unité", "Seuil", "Péremption", "Prix unitaire (FCFA)", "Fournisseur"];
    var cell = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
    var lines = [head.map(cell).join(";")].concat(items.map(function (i) {
      return [i.nom, i.categorie, i.quantite, i.unite, i.seuil, G.fmtDate(i.peremption), i.prix, i.fournisseur].map(cell).join(";");
    }));
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "stock-cabinet-" + G.today() + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  G.module({
    id: "stock",
    label: "Stock",
    roles: ["admin", "medecin", "infirmier"],
    init: init,
    show: charger
  });
})();
