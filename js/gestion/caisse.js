/* Module Caisse : encaissements, reçus, totaux, annulation (admin), tarifs des actes. */
(function () {
  "use strict";
  var G = window.G, $ = G.$, esc = G.esc;
  var el, actes = [], paiements = [], ctx = null, patientChoisi = null;
  var MODES = { especes: "Espèces", orange_money: "Orange Money", moov_money: "Moov Money", autre: "Autre" };

  function init(root) {
    el = root;
    el.innerHTML = '' +
      '<div class="toolbar">' +
        '<select id="cs-periode"><option value="jour">Aujourd\'hui</option><option value="hier">Hier</option>' +
          '<option value="mois">Ce mois-ci</option><option value="mois_prec">Mois précédent</option><option value="date">Choisir une date…</option></select>' +
        '<input type="date" id="cs-date" class="hidden">' +
        '<button class="btn btn--small btn--ghost" id="cs-refresh">Actualiser</button>' +
        '<button class="btn btn--small" id="cs-add">+ Nouvel encaissement</button>' +
      '</div>' +
      '<div class="kpis" id="cs-kpis"></div>' +
      '<div class="table-wrap"><table class="stock-table"><thead><tr><th>Reçu</th><th>Date</th><th>Patient</th><th>Détail</th><th>Mode</th><th class="r">Montant</th><th>Par</th><th></th></tr></thead>' +
        '<tbody id="cs-body"></tbody></table><p class="empty hidden" id="cs-empty">Aucun encaissement sur cette période.</p></div>' +
      (G.peut("admin") ? '' +
        '<div class="card-box"><div class="card-box__head"><h3>Tarifs des actes</h3><button class="btn btn--small btn--ghost" id="tf-add">+ Ajouter un acte</button></div>' +
        '<p class="small-muted">Les prix servent de proposition à l\'encaissement ; ils restent modifiables au cas par cas.</p>' +
        '<div class="table-wrap table-wrap--flat"><table class="stock-table"><thead><tr><th>Acte</th><th>Prix (FCFA)</th><th>Actif</th><th></th></tr></thead><tbody id="tf-body"></tbody></table></div></div>' : "") +

      // Encaissement
      '<dialog id="dlg-pay" class="dialog--large"><form class="form" id="form-pay" method="dialog">' +
        '<h2>Encaissement</h2>' +
        '<div class="patient-pick">' +
          '<label>Patient *<input id="pay-patient" autocomplete="off" placeholder="Rechercher un patient ou saisir un nom"></label>' +
          '<div class="pick-list hidden" id="pay-pick"></div>' +
          '<p class="small-muted" id="pay-patient-info"></p>' +
        '</div>' +
        '<label>Ajouter un acte<select id="pay-acte"><option value="">— Choisir un acte —</option></select></label>' +
        '<table class="stock-table pay-lignes"><thead><tr><th>Libellé</th><th>Prix</th><th>Qté</th><th class="r">Sous-total</th><th></th></tr></thead><tbody id="pay-lignes"></tbody></table>' +
        '<button type="button" class="btn btn--small btn--ghost" id="pay-libre">+ Ligne libre</button>' +
        '<p class="pay-total">Total : <strong id="pay-total">0 FCFA</strong></p>' +
        '<div class="form__row">' +
          '<label>Mode de paiement<select name="mode">' + Object.keys(MODES).map(function (m) { return '<option value="' + m + '">' + MODES[m] + '</option>'; }).join("") + '</select></label>' +
          '<label>Référence (transaction mobile)<input name="reference" placeholder="Facultatif"></label>' +
        '</div>' +
        '<p class="form__error" id="pay-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button>' +
          '<button class="btn btn--ghost" value="save">Encaisser</button><button class="btn" value="print">Encaisser et imprimer le reçu</button></div>' +
      '</form></dialog>' +

      // Annulation
      '<dialog id="dlg-annul"><form class="form" id="form-annul" method="dialog">' +
        '<h2>Annuler le reçu</h2><p class="small-muted" id="annul-info"></p>' +
        '<label>Motif de l\'annulation *<input name="motif" required placeholder="Ex : erreur de montant, remboursement"></label>' +
        '<p class="small-muted">Le reçu reste visible, marqué « annulé », et n\'est plus compté dans les totaux.</p>' +
        '<p class="form__error" id="annul-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Retour</button><button class="btn btn--danger">Annuler le reçu</button></div>' +
      '</form></dialog>' +

      // Tarif
      '<dialog id="dlg-tarif"><form class="form" id="form-tarif" method="dialog">' +
        '<h2 id="tarif-title">Acte</h2>' +
        '<label>Nom de l\'acte *<input name="nom" required></label>' +
        '<label>Prix (FCFA) *<input name="prix" type="number" min="0" step="25" required></label>' +
        '<label class="check"><input type="checkbox" name="actif"> Proposé à l\'encaissement</label>' +
        '<p class="form__error" id="tarif-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>' +
      '</form></dialog>';

    $("#cs-periode", el).addEventListener("change", function () {
      $("#cs-date", el).classList.toggle("hidden", this.value !== "date");
      if (this.value === "date" && !$("#cs-date", el).value) $("#cs-date", el).value = G.today();
      charger();
    });
    $("#cs-date", el).addEventListener("change", charger);
    $("#cs-refresh", el).addEventListener("click", charger);
    $("#cs-add", el).addEventListener("click", function () { G.encaisser({}); });
    $("#cs-body", el).addEventListener("click", function (e) {
      var b = e.target.closest("button[data-act]");
      if (!b) return;
      var p = paiements.find(function (x) { return x.id === b.dataset.id; });
      if (b.dataset.act === "recu") G.imprimerRecu(p);
      if (b.dataset.act === "annul") {
        var f = $("#form-annul", el);
        f.reset(); f.dataset.id = p.id;
        $("#annul-info", el).textContent = "Reçu N° " + p.numero + " — " + p.patient_nom + " — " + G.fcfa(p.total);
        $("#annul-err", el).textContent = "";
        $("#dlg-annul", el).showModal();
      }
    });
    $("#form-annul", el).addEventListener("submit", annuler);

    // Encaissement
    $("#pay-acte", el).addEventListener("change", function () {
      var a = actes.find(function (x) { return x.id === this.value; }, this);
      if (a) ajouterLigne({ libelle: a.nom, prix: a.prix, quantite: 1 });
      this.value = "";
    });
    $("#pay-libre", el).addEventListener("click", function () { ajouterLigne({ libelle: "", prix: 0, quantite: 1 }); });
    $("#pay-lignes", el).addEventListener("input", majTotal);
    $("#pay-lignes", el).addEventListener("click", function (e) {
      if (e.target.closest("[data-del]")) { e.target.closest("tr").remove(); majTotal(); }
    });
    var timer;
    $("#pay-patient", el).addEventListener("input", function () {
      patientChoisi = null;
      $("#pay-patient-info", el).textContent = "Patient non enregistré (nom libre) — ou choisissez dans la liste.";
      clearTimeout(timer);
      timer = setTimeout(chercherPatient, 300);
    });
    $("#pay-pick", el).addEventListener("click", function (e) {
      var b = e.target.closest("button[data-id]");
      if (!b) return;
      patientChoisi = { id: b.dataset.id, nom: b.dataset.nom };
      $("#pay-patient", el).value = b.dataset.nom;
      $("#pay-patient-info", el).textContent = "Dossier " + b.dataset.num;
      $("#pay-pick", el).classList.add("hidden");
    });
    $("#form-pay", el).addEventListener("submit", encaisser);

    // Tarifs (admin)
    if (G.peut("admin")) {
      $("#tf-add", el).addEventListener("click", function () { ouvrirTarif(null); });
      $("#tf-body", el).addEventListener("click", function (e) {
        var b = e.target.closest("button[data-tarif]");
        if (b) ouvrirTarif(actes.find(function (a) { return a.id === b.dataset.tarif; }));
      });
      $("#form-tarif", el).addEventListener("submit", enregistrerTarif);
    }

    // Accessible depuis la fiche patient
    G.encaisser = ouvrirEncaissement;
    chargerActes();
  }

  // ---------------- Période ----------------
  function bornes() {
    var v = $("#cs-periode", el).value, d = new Date(), deb, fin;
    var jour = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };
    if (v === "jour") { deb = jour(d); fin = new Date(deb.getTime() + 86400000); }
    if (v === "hier") { fin = jour(d); deb = new Date(fin.getTime() - 86400000); }
    if (v === "mois") { deb = new Date(d.getFullYear(), d.getMonth(), 1); fin = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
    if (v === "mois_prec") { deb = new Date(d.getFullYear(), d.getMonth() - 1, 1); fin = new Date(d.getFullYear(), d.getMonth(), 1); }
    if (v === "date") { deb = new Date(($("#cs-date", el).value || G.today()) + "T00:00:00"); fin = new Date(deb.getTime() + 86400000); }
    return { deb: deb.toISOString(), fin: fin.toISOString() };
  }

  async function charger() {
    var b = bornes();
    var r = await G.db.from("paiements").select("*").gte("date", b.deb).lt("date", b.fin).order("date", { ascending: false }).limit(1000);
    if (r.error) { G.status(G.errMsg(r.error), true); return; }
    paiements = r.data;
    var valides = paiements.filter(function (p) { return !p.annule; });
    var total = valides.reduce(function (s, p) { return s + p.total; }, 0);
    var parMode = {};
    valides.forEach(function (p) { parMode[p.mode] = (parMode[p.mode] || 0) + p.total; });
    $("#cs-kpis", el).innerHTML =
      '<div class="kpi"><strong>' + G.fcfa(total) + '</strong><span>encaissé (' + valides.length + ' reçu' + (valides.length > 1 ? "s" : "") + ')</span></div>' +
      Object.keys(MODES).filter(function (m) { return parMode[m]; }).map(function (m) {
        return '<div class="kpi"><strong>' + G.fcfa(parMode[m]) + '</strong><span>' + MODES[m] + '</span></div>';
      }).join("");

    var admin = G.peut("admin");
    $("#cs-body", el).innerHTML = paiements.map(function (p) {
      return '<tr' + (p.annule ? ' class="row-off"' : "") + '><td class="mono">' + p.numero + '</td><td>' + G.fmtDateTime(p.date) + '</td>' +
        '<td>' + esc(p.patient_nom) + '</td>' +
        '<td class="motif">' + esc(p.lignes.map(function (l) { return (l.quantite > 1 ? l.quantite + " × " : "") + l.libelle; }).join(", ")) +
          (p.annule ? '<br><span class="badge badge--out">Annulé</span> <span class="small-muted">' + esc(p.motif_annulation) + '</span>' : "") + '</td>' +
        '<td>' + MODES[p.mode] + (p.reference ? '<br><span class="small-muted">' + esc(p.reference) + '</span>' : "") + '</td>' +
        '<td class="r"><strong>' + G.fcfa(p.total) + '</strong></td><td>' + esc(p.encaisse_par_nom || "") + '</td>' +
        '<td><div class="actions"><button class="btn btn--small btn--ghost" data-act="recu" data-id="' + p.id + '">Reçu</button>' +
          (admin && !p.annule ? '<button class="btn btn--small btn--ghost" data-act="annul" data-id="' + p.id + '">Annuler</button>' : "") +
        '</div></td></tr>';
    }).join("");
    $("#cs-empty", el).classList.toggle("hidden", paiements.length > 0);
  }

  // ---------------- Tarifs ----------------
  async function chargerActes() {
    var r = await G.db.from("actes").select("*").order("ordre").order("nom");
    if (r.error) return;
    actes = r.data;
    $("#pay-acte", el).innerHTML = '<option value="">— Choisir un acte —</option>' + actes.filter(function (a) { return a.actif; }).map(function (a) {
      return '<option value="' + a.id + '">' + esc(a.nom) + ' — ' + G.fcfa(a.prix) + '</option>';
    }).join("");
    var tb = $("#tf-body", el);
    if (tb) tb.innerHTML = actes.map(function (a) {
      return '<tr' + (a.actif ? "" : ' class="row-off"') + '><td>' + esc(a.nom) + '</td><td>' + G.fcfa(a.prix) + '</td><td>' + (a.actif ? "Oui" : "Non") + '</td>' +
        '<td><button class="icon-btn" data-tarif="' + a.id + '" title="Modifier">✏️</button></td></tr>';
    }).join("");
  }

  function ouvrirTarif(a) {
    var f = $("#form-tarif", el);
    G.remplirForm(f, a || { actif: true, prix: 0 });
    f.dataset.id = a ? a.id : "";
    $("#tarif-title", el).textContent = a ? "Modifier l'acte" : "Nouvel acte";
    $("#tarif-err", el).textContent = "";
    $("#dlg-tarif", el).showModal();
  }

  async function enregistrerTarif(e) {
    e.preventDefault();
    var f = e.target, d = G.lireForm(f);
    var champs = { nom: d.nom, prix: parseInt(d.prix, 10), actif: d.actif };
    if (!champs.nom || isNaN(champs.prix) || champs.prix < 0) { $("#tarif-err", el).textContent = "Nom et prix valides obligatoires."; return; }
    var r = f.dataset.id ? await G.db.from("actes").update(champs).eq("id", f.dataset.id) : await G.db.from("actes").insert(champs);
    if (r.error) { $("#tarif-err", el).textContent = /duplicate|unique/i.test(r.error.message) ? "Un acte porte déjà ce nom." : G.errMsg(r.error); return; }
    $("#dlg-tarif", el).close();
    chargerActes();
  }

  // ---------------- Encaissement ----------------
  function ajouterLigne(l) {
    var tr = document.createElement("tr");
    tr.innerHTML = '<td><input data-f="libelle" value="' + esc(l.libelle) + '" placeholder="Libellé"></td>' +
      '<td><input data-f="prix" type="number" min="0" step="25" value="' + l.prix + '"></td>' +
      '<td><input data-f="quantite" type="number" min="1" step="1" value="' + l.quantite + '"></td>' +
      '<td class="r st"></td><td><button type="button" class="icon-btn" data-del title="Retirer">✕</button></td>';
    $("#pay-lignes", el).appendChild(tr);
    majTotal();
    if (!l.libelle) $("[data-f=libelle]", tr).focus();
  }

  function lignes() {
    return G.$$("#pay-lignes tr", el).map(function (tr) {
      return {
        libelle: $("[data-f=libelle]", tr).value.trim(),
        prix: parseInt($("[data-f=prix]", tr).value, 10) || 0,
        quantite: parseInt($("[data-f=quantite]", tr).value, 10) || 0
      };
    });
  }

  function majTotal() {
    var total = 0;
    G.$$("#pay-lignes tr", el).forEach(function (tr, i) {
      var l = lignes()[i];
      var st = l.prix * l.quantite;
      total += st;
      $(".st", tr).textContent = G.fcfa(st);
    });
    $("#pay-total", el).textContent = G.fcfa(total);
  }

  async function chercherPatient() {
    var q = $("#pay-patient", el).value.trim().replace(/[,()%*\\]/g, " ").trim();
    var box = $("#pay-pick", el);
    if (q.length < 2) { box.classList.add("hidden"); return; }
    var mots = q.split(/\s+/);
    var filtres = ["nom.ilike.*" + q + "*", "prenom.ilike.*" + q + "*", "telephone.ilike.*" + q + "*"];
    mots.forEach(function (w) { if (w.length > 1) filtres.push("nom.ilike.*" + w + "*", "prenom.ilike.*" + w + "*"); });
    var r = await G.db.from("patients").select("id, numero, nom, prenom, telephone").or(filtres.join(",")).limit(8);
    if (r.error || !r.data.length) { box.classList.add("hidden"); return; }
    box.innerHTML = r.data.map(function (p) {
      var nom = p.prenom + " " + p.nom;
      return '<button type="button" data-id="' + p.id + '" data-nom="' + esc(nom) + '" data-num="' + G.numDossier(p.numero) + '">' +
        '<strong>' + esc(nom) + '</strong> <span class="small-muted">' + G.numDossier(p.numero) + (p.telephone ? " · " + esc(p.telephone) : "") + '</span></button>';
    }).join("");
    box.classList.remove("hidden");
  }

  // ctx : { patient_id?, patient_nom?, consultation_id?, apres? }
  function ouvrirEncaissement(c) {
    ctx = c || {};
    var f = $("#form-pay", el);
    f.reset();
    $("#pay-lignes", el).innerHTML = "";
    $("#pay-err", el).textContent = "";
    $("#pay-pick", el).classList.add("hidden");
    patientChoisi = ctx.patient_id ? { id: ctx.patient_id, nom: ctx.patient_nom } : null;
    $("#pay-patient", el).value = ctx.patient_nom || "";
    $("#pay-patient", el).readOnly = !!ctx.patient_id;
    $("#pay-patient-info", el).textContent = ctx.consultation_id ? "Paiement lié à la consultation." : "";
    // Proposer l'acte « Consultation » quand on encaisse une consultation
    if (ctx.consultation_id) {
      var cons = actes.find(function (a) { return a.actif && /^consultation$/i.test(a.nom); });
      if (cons) ajouterLigne({ libelle: cons.nom, prix: cons.prix, quantite: 1 });
    }
    majTotal();
    $("#dlg-pay", el).showModal();
  }

  async function encaisser(e) {
    e.preventDefault();
    var f = e.target, err = $("#pay-err", el);
    var imprimerApres = e.submitter && e.submitter.value === "print";
    var nom = $("#pay-patient", el).value.trim();
    var ls = lignes();
    if (!nom) { err.textContent = "Indiquez le patient."; return; }
    if (!ls.length) { err.textContent = "Ajoutez au moins un acte."; return; }
    if (ls.some(function (l) { return !l.libelle || l.quantite < 1 || l.prix < 0; })) { err.textContent = "Chaque ligne doit avoir un libellé, un prix et une quantité."; return; }
    var total = ls.reduce(function (s, l) { return s + l.prix * l.quantite; }, 0);
    if (total === 0 && !confirm("Le total est de 0 FCFA. Enregistrer quand même (acte gratuit) ?")) return;

    var btns = G.$$("button", f);
    btns.forEach(function (b) { b.disabled = true; });
    var r = await G.db.from("paiements").insert({
      patient_id: patientChoisi ? patientChoisi.id : null,
      patient_nom: nom,
      consultation_id: ctx.consultation_id || null,
      lignes: ls,
      mode: f.elements.mode.value,
      reference: f.elements.reference.value.trim() || null
    }).select().single();
    btns.forEach(function (b) { b.disabled = false; });
    if (r.error) { err.textContent = G.errMsg(r.error); return; }
    $("#dlg-pay", el).close();
    G.toast("Reçu N° " + r.data.numero + " : " + G.fcfa(r.data.total) + " encaissé.");
    if (imprimerApres) G.imprimerRecu(r.data);
    if (ctx.apres) ctx.apres();
    if (!el.classList.contains("view-off")) charger();
  }

  async function annuler(e) {
    e.preventDefault();
    var f = e.target, motif = f.elements.motif.value.trim();
    if (!motif) { $("#annul-err", el).textContent = "Le motif est obligatoire."; return; }
    var r = await G.db.from("paiements").update({ annule: true, motif_annulation: motif }).eq("id", f.dataset.id);
    if (r.error) { $("#annul-err", el).textContent = G.errMsg(r.error); return; }
    $("#dlg-annul", el).close();
    G.toast("Reçu annulé.");
    charger();
  }

  // ---------------- Reçu imprimable ----------------
  G.imprimerRecu = function (p) {
    if (!p) return;
    var corps = (p.annule ? '<div class="annule">REÇU ANNULÉ — ' + esc(p.motif_annulation || "") + '</div>' : "") +
      '<h2>REÇU DE PAIEMENT</h2>' +
      '<div class="meta"><div>Reçu N° <strong>' + p.numero + '</strong><br>Patient : <strong>' + esc(p.patient_nom) + '</strong></div>' +
        '<div style="text-align:right">' + G.fmtDateTime(p.date) + '</div></div>' +
      '<table><thead><tr><th>Désignation</th><th class="r">Prix</th><th class="r">Qté</th><th class="r">Montant</th></tr></thead><tbody>' +
      p.lignes.map(function (l) {
        return '<tr><td>' + esc(l.libelle) + '</td><td class="r">' + G.fcfa(l.prix) + '</td><td class="r">' + l.quantite + '</td><td class="r">' + G.fcfa(l.prix * l.quantite) + '</td></tr>';
      }).join("") +
      '<tr class="tot"><td colspan="3">TOTAL</td><td class="r">' + G.fcfa(p.total) + '</td></tr></tbody></table>' +
      '<p>Mode de paiement : <strong>' + MODES[p.mode] + '</strong>' + (p.reference ? ' (réf. ' + esc(p.reference) + ')' : "") + '</p>' +
      '<div class="sign"><span>' + esc(p.encaisse_par_nom || "La caisse") + '</span></div>' +
      '<p class="pied">Merci de votre confiance.</p>';
    G.imprimer("Reçu " + p.numero, corps, "A5");
  };

  G.module({
    id: "caisse",
    label: "Caisse",
    roles: ["admin", "medecin", "secretaire"],
    init: init,
    show: function () { chargerActes(); charger(); }
  });
})();
