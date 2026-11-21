/*
 * Gestion de stock du cabinet.
 * Stockage : localStorage (sur l'appareil). Toute la persistance passe par l'objet `Store`,
 * pour pouvoir le remplacer plus tard par un backend (Firebase, Supabase, API…) sans toucher à l'interface.
 */
(function () {
  "use strict";

  var KEY_DATA = "cabinet_stock_v1";
  var KEY_PIN = "cabinet_stock_pin";
  var KEY_SESSION = "cabinet_stock_unlocked";
  var JOURS_ALERTE = 30;

  // ---------- Persistance ----------
  var Store = {
    load: function () {
      try {
        var d = JSON.parse(localStorage.getItem(KEY_DATA));
        if (d && Array.isArray(d.items)) return d;
      } catch (e) { /* données corrompues → on repart à vide */ }
      return { items: [], mouvements: [] };
    },
    save: function (data) {
      localStorage.setItem(KEY_DATA, JSON.stringify(data));
    }
  };

  var data = Store.load();
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Utilitaires ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) { return iso ? iso.split("-").reverse().join("/") : "—"; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysUntil(iso) {
    if (!iso) return Infinity;
    return Math.floor((new Date(iso + "T00:00:00Z") - new Date(today() + "T00:00:00Z")) / 86400000);
  }

  async function hash(text) {
    var salted = "cabinet-dounake::" + text;
    if (window.crypto && crypto.subtle) {
      var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salted));
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    }
    // Repli simple si SubtleCrypto indisponible
    var h = 0;
    for (var i = 0; i < salted.length; i++) { h = (h * 31 + salted.charCodeAt(i)) | 0; }
    return "f" + h;
  }

  // État d'un article
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
    var s = etat(it);
    var d = daysUntil(it.peremption);
    var html = "";
    if (s.indexOf("out") > -1) html += '<span class="badge badge--out">Rupture</span> ';
    if (s.indexOf("low") > -1) html += '<span class="badge badge--low">Stock faible</span> ';
    if (s.indexOf("exp") > -1) html += '<span class="badge badge--exp">Périmé</span> ';
    if (s.indexOf("soon") > -1) html += '<span class="badge badge--soon">Expire dans ' + d + ' j</span> ';
    return html || '<span class="badge badge--ok">OK</span>';
  }

  // ---------- Verrouillage ----------
  var firstTime = !localStorage.getItem(KEY_PIN);

  function showApp() {
    $("lock-screen").classList.add("hidden");
    $("app").classList.remove("hidden");
    $("btn-logout").classList.remove("hidden");
    render();
  }

  if (firstTime) {
    $("lock-title").textContent = "Créer votre code d'accès";
    $("lock-text").textContent = "Première utilisation : choisissez un code (4 chiffres minimum). Il protégera l'accès au stock sur cet appareil.";
    $("pin2-wrap").classList.remove("hidden");
    $("pin").setAttribute("autocomplete", "new-password");
  }
  if (sessionStorage.getItem(KEY_SESSION) === "1" && !firstTime) showApp();

  $("lock-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var pin = $("pin").value.trim();
    var err = $("lock-error");
    if (pin.length < 4) { err.textContent = "Le code doit contenir au moins 4 caractères."; return; }
    if (firstTime) {
      if (pin !== $("pin2").value.trim()) { err.textContent = "Les deux codes ne correspondent pas."; return; }
      localStorage.setItem(KEY_PIN, await hash(pin));
      firstTime = false;
    } else if ((await hash(pin)) !== localStorage.getItem(KEY_PIN)) {
      err.textContent = "Code incorrect.";
      $("pin").value = "";
      return;
    }
    err.textContent = "";
    $("pin").value = ""; $("pin2").value = "";
    sessionStorage.setItem(KEY_SESSION, "1");
    showApp();
  });

  $("btn-logout").addEventListener("click", function () {
    sessionStorage.removeItem(KEY_SESSION);
    location.reload();
  });

  // ---------- Affichage ----------
  function render() {
    var q = $("search").value.trim().toLowerCase();
    var cat = $("filter-cat").value;
    var st = $("filter-state").value;

    // Catégories du filtre
    var cats = Array.from(new Set(data.items.map(function (i) { return i.categorie; }).filter(Boolean))).sort();
    var sel = $("filter-cat");
    sel.innerHTML = '<option value="">Toutes catégories</option>' +
      cats.map(function (c) { return '<option' + (c === cat ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("");

    // KPI
    var k = { low: 0, out: 0, exp: 0 };
    data.items.forEach(function (it) {
      var s = etat(it);
      if (s.indexOf("low") > -1) k.low++;
      if (s.indexOf("out") > -1) k.out++;
      if (s.indexOf("exp") > -1 || s.indexOf("soon") > -1) k.exp++;
    });
    $("k-total").textContent = data.items.length;
    $("k-low").textContent = k.low;
    $("k-out").textContent = k.out;
    $("k-exp").textContent = k.exp;

    var rows = data.items.filter(function (it) {
      if (q && (it.nom + " " + (it.fournisseur || "") + " " + (it.categorie || "")).toLowerCase().indexOf(q) === -1) return false;
      if (cat && it.categorie !== cat) return false;
      if (st) {
        var s = etat(it);
        if (st === "exp" ? (s.indexOf("exp") === -1 && s.indexOf("soon") === -1) : s.indexOf(st) === -1) return false;
      }
      return true;
    }).sort(function (a, b) { return a.nom.localeCompare(b.nom, "fr"); });

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
    $("empty").textContent = data.items.length
      ? "Aucun article ne correspond à la recherche."
      : "Aucun article. Cliquez sur « + Ajouter un article » pour commencer.";
  }

  ["search", "filter-cat", "filter-state"].forEach(function (id) {
    $(id).addEventListener("input", render);
  });

  // ---------- Dialogues ----------
  document.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", function () { b.closest("dialog").close(); });
  });

  var editingId = null;
  var itemForm = $("item-form");

  function openItem(it) {
    editingId = it ? it.id : null;
    $("item-title").textContent = it ? "Modifier l'article" : "Nouvel article";
    itemForm.reset();
    $("item-error").textContent = "";
    if (it) {
      ["nom", "categorie", "unite", "quantite", "seuil", "peremption", "prix", "fournisseur"].forEach(function (f) {
        itemForm.elements[f].value = it[f] == null ? "" : it[f];
      });
    }
    $("dlg-item").showModal();
  }

  $("btn-add").addEventListener("click", function () { openItem(null); });

  itemForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = itemForm.elements;
    var nom = f.nom.value.trim();
    var qte = parseInt(f.quantite.value, 10);
    if (!nom) { $("item-error").textContent = "Le nom est obligatoire."; return; }
    if (isNaN(qte) || qte < 0) { $("item-error").textContent = "Quantité invalide."; return; }

    var champs = {
      nom: nom,
      categorie: f.categorie.value.trim(),
      unite: f.unite.value.trim(),
      quantite: qte,
      seuil: parseInt(f.seuil.value, 10) || 0,
      peremption: f.peremption.value || "",
      prix: f.prix.value ? parseInt(f.prix.value, 10) : null,
      fournisseur: f.fournisseur.value.trim()
    };

    if (editingId) {
      var it = data.items.find(function (i) { return i.id === editingId; });
      var diff = champs.quantite - it.quantite;
      Object.assign(it, champs);
      if (diff !== 0) logMove(it, diff > 0 ? "in" : "out", Math.abs(diff), "Correction manuelle");
    } else {
      var nouvel = Object.assign({ id: uid(), creeLe: today() }, champs);
      data.items.push(nouvel);
      if (qte > 0) logMove(nouvel, "in", qte, "Stock initial");
    }
    Store.save(data);
    $("dlg-item").close();
    render();
  });

  // Mouvements
  var moveId = null;
  var moveForm = $("move-form");

  function logMove(it, type, qte, note) {
    data.mouvements.unshift({ id: uid(), itemId: it.id, nom: it.nom, type: type, qte: qte, note: note || "", date: new Date().toISOString() });
    if (data.mouvements.length > 2000) data.mouvements.length = 2000;
  }

  moveForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var it = data.items.find(function (i) { return i.id === moveId; });
    var type = moveForm.elements.type.value;
    var qte = parseInt(moveForm.elements.qte.value, 10);
    if (!qte || qte < 1) { $("move-error").textContent = "Quantité invalide."; return; }
    if (type === "out" && qte > it.quantite) {
      $("move-error").textContent = "Stock insuffisant (" + it.quantite + " disponible).";
      return;
    }
    it.quantite += type === "in" ? qte : -qte;
    logMove(it, type, qte, moveForm.elements.note.value.trim());
    Store.save(data);
    $("dlg-move").close();
    render();
  });

  // Actions du tableau
  $("stock-body").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]");
    if (!b) return;
    var it = data.items.find(function (i) { return i.id === b.dataset.id; });
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
    if (b.dataset.act === "del" && confirm("Supprimer « " + it.nom + " » du stock ?")) {
      data.items = data.items.filter(function (i) { return i.id !== it.id; });
      Store.save(data);
      render();
    }
  });

  // Historique
  $("btn-history").addEventListener("click", function () {
    $("history-list").innerHTML = data.mouvements.length
      ? data.mouvements.slice(0, 300).map(function (m) {
          var d = new Date(m.date);
          return "<li><span class='" + m.type + "'>" + (m.type === "in" ? "+" : "−") + m.qte + "</span> " +
            esc(m.nom) + (m.note ? " — <em>" + esc(m.note) + "</em>" : "") +
            "<br><span class='small-muted'>" + d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + "</span></li>";
        }).join("")
      : "<li class='small-muted'>Aucun mouvement enregistré.</li>";
    $("dlg-history").showModal();
  });

  // ---------- Export / sauvegarde ----------
  function download(name, content, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  $("btn-csv").addEventListener("click", function () {
    var head = ["Article", "Catégorie", "Quantité", "Unité", "Seuil", "Péremption", "Prix unitaire (FCFA)", "Fournisseur"];
    var cell = function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; };
    var lines = [head.map(cell).join(";")].concat(data.items.map(function (i) {
      return [i.nom, i.categorie, i.quantite, i.unite, i.seuil, fmtDate(i.peremption), i.prix, i.fournisseur].map(cell).join(";");
    }));
    // BOM pour qu'Excel lise correctement les accents
    download("stock-cabinet-" + today() + ".csv", "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  });

  $("btn-backup").addEventListener("click", function () {
    download("sauvegarde-stock-" + today() + ".json", JSON.stringify(data, null, 2), "application/json");
  });

  $("file-restore").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var d = JSON.parse(reader.result);
        if (!Array.isArray(d.items)) throw new Error();
        if (!confirm("Remplacer le stock actuel par cette sauvegarde (" + d.items.length + " articles) ?")) return;
        data = { items: d.items, mouvements: d.mouvements || [] };
        Store.save(data);
        render();
      } catch (err) {
        alert("Fichier de sauvegarde invalide.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });
})();
