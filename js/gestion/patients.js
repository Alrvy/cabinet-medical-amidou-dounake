/* Module Patients : liste, fiche, infos médicales, constantes, consultations. */
(function () {
  "use strict";
  var G = window.G, $ = G.$, esc = G.esc;
  var el, patient = null, rdvALier = null;

  var CONST_CHAMPS = ["tension_sys", "tension_dia", "temperature", "pouls", "poids", "taille", "saturation", "glycemie"];

  function constantesHtml(prefix) {
    return '' +
      '<div class="form__row form__row--4">' +
        '<label>Tension (max)<input name="' + prefix + 'tension_sys" type="number" min="40" max="300" placeholder="120"></label>' +
        '<label>Tension (min)<input name="' + prefix + 'tension_dia" type="number" min="20" max="200" placeholder="80"></label>' +
        '<label>Température °C<input name="' + prefix + 'temperature" type="number" step="0.1" min="30" max="45" placeholder="37.0"></label>' +
        '<label>Pouls /min<input name="' + prefix + 'pouls" type="number" min="20" max="250"></label>' +
      '</div>' +
      '<div class="form__row form__row--4">' +
        '<label>Poids kg<input name="' + prefix + 'poids" type="number" step="0.1" min="0.3" max="400"></label>' +
        '<label>Taille cm<input name="' + prefix + 'taille" type="number" min="20" max="250"></label>' +
        '<label>SpO₂ %<input name="' + prefix + 'saturation" type="number" min="40" max="100"></label>' +
        '<label>Glycémie g/L<input name="' + prefix + 'glycemie" type="number" step="0.01" min="0.1" max="10"></label>' +
      '</div>';
  }

  function init(root) {
    el = root;
    el.innerHTML = '' +
      // ----- Liste -----
      '<div id="pat-liste">' +
        '<div class="toolbar">' +
          '<input type="search" id="pat-search" placeholder="Rechercher : nom, prénom, téléphone ou n° de dossier…">' +
          '<button class="btn btn--small" id="pat-add">+ Nouveau patient</button>' +
        '</div>' +
        '<div class="table-wrap"><table class="stock-table">' +
          '<thead><tr><th>N°</th><th>Nom</th><th>Sexe / âge</th><th>Téléphone</th><th>Enregistré le</th></tr></thead>' +
          '<tbody id="pat-body"></tbody></table>' +
          '<p class="empty hidden" id="pat-empty"></p></div>' +
      '</div>' +
      // ----- Fiche -----
      '<div id="pat-fiche" class="hidden"></div>' +
      // ----- Dialogue identité -----
      '<dialog id="dlg-patient"><form class="form" id="form-patient" method="dialog">' +
        '<h2 id="pat-form-title">Nouveau patient</h2>' +
        '<div class="form__row">' +
          '<label>Prénom *<input name="prenom" required maxlength="80"></label>' +
          '<label>Nom *<input name="nom" required maxlength="80"></label>' +
        '</div>' +
        '<div class="form__row">' +
          '<label>Sexe<select name="sexe"><option value="">—</option><option value="F">Féminin</option><option value="M">Masculin</option></select></label>' +
          '<label>Date de naissance<input name="date_naissance" type="date"></label>' +
        '</div>' +
        '<div class="form__row">' +
          '<label>Téléphone<input name="telephone" type="tel" placeholder="70 00 00 00"></label>' +
          '<label>Profession<input name="profession"></label>' +
        '</div>' +
        '<label>Adresse / quartier<input name="adresse" placeholder="Ex : Banconi Zekenekorobougou"></label>' +
        '<label>Personne à prévenir<input name="contact_urgence" placeholder="Nom et téléphone"></label>' +
        '<p class="form__error" id="pat-form-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>' +
      '</form></dialog>' +
      // ----- Dialogue infos médicales -----
      '<dialog id="dlg-medical"><form class="form" id="form-medical" method="dialog">' +
        '<h2>Informations médicales</h2>' +
        '<label>Groupe sanguin<select name="groupe_sanguin"><option value="">Inconnu</option>' +
          ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(function (g) { return "<option>" + g + "</option>"; }).join("") +
        '</select></label>' +
        '<label>Allergies<textarea name="allergies" rows="2" placeholder="Ex : pénicilline"></textarea></label>' +
        '<label>Antécédents<textarea name="antecedents" rows="3" placeholder="Ex : HTA, diabète, chirurgie…"></textarea></label>' +
        '<label>Traitements en cours<textarea name="traitements_en_cours" rows="2"></textarea></label>' +
        '<p class="form__error" id="med-form-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>' +
      '</form></dialog>' +
      // ----- Dialogue constantes -----
      '<dialog id="dlg-const"><form class="form" id="form-const" method="dialog">' +
        '<h2>Prise de constantes</h2>' + constantesHtml("") +
        '<label>Note<input name="note"></label>' +
        '<p class="form__error" id="const-form-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>' +
      '</form></dialog>' +
      // ----- Dialogue consultation -----
      '<dialog id="dlg-consult" class="dialog--large"><form class="form" id="form-consult" method="dialog">' +
        '<h2 id="consult-title">Nouvelle consultation</h2>' +
        '<label>Motif *<input name="motif" required placeholder="Ex : fièvre depuis 3 jours"></label>' +
        '<details class="consult-const"><summary>Constantes (facultatif)</summary>' + constantesHtml("c_") + '</details>' +
        '<label>Examen clinique<textarea name="examen" rows="3"></textarea></label>' +
        '<label>Diagnostic<textarea name="diagnostic" rows="2"></textarea></label>' +
        '<label>Traitement / prescription<textarea name="traitement" rows="3"></textarea></label>' +
        '<label>Notes<textarea name="notes" rows="2"></textarea></label>' +
        '<p class="form__error" id="consult-form-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>' +
      '</form></dialog>';

    var timer;
    $("#pat-search", el).addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(chargerListe, 300);
    });
    $("#pat-add", el).addEventListener("click", function () { ouvrirFormPatient(null); });
    $("#pat-body", el).addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-id]");
      if (tr) ouvrirFiche(tr.dataset.id);
    });
    $("#pat-fiche", el).addEventListener("click", modifierConsultation);
    $("#form-patient", el).addEventListener("submit", enregistrerPatient);
    $("#form-medical", el).addEventListener("submit", enregistrerMedical);
    $("#form-const", el).addEventListener("submit", enregistrerConstantes);
    $("#form-consult", el).addEventListener("submit", enregistrerConsultation);
  }

  // ---------------- Liste ----------------
  async function chargerListe() {
    var q = $("#pat-search", el).value.trim().replace(/[,()%*\\]/g, " ").trim();
    var req = G.db.from("patients").select("id, numero, nom, prenom, sexe, date_naissance, telephone, cree_le");
    if (q) {
      var num = q.replace(/^P-?0*/i, "");
      var filtres = ["nom.ilike.*" + q + "*", "prenom.ilike.*" + q + "*", "telephone.ilike.*" + q.replace(/\s/g, "") + "*"];
      if (/^\d+$/.test(num)) filtres.push("numero.eq." + num);
      // "Awa Traoré" : chercher aussi sur chaque mot
      q.split(/\s+/).filter(function (w) { return w.length > 1; }).forEach(function (w) {
        filtres.push("nom.ilike.*" + w + "*", "prenom.ilike.*" + w + "*");
      });
      req = req.or(filtres.join(",")).order("nom").limit(100);
    } else {
      req = req.order("cree_le", { ascending: false }).limit(50);
    }
    var r = await req;
    if (r.error) { G.status(G.errMsg(r.error), true); return; }
    $("#pat-body", el).innerHTML = r.data.map(function (p) {
      return '<tr data-id="' + p.id + '" class="clickable">' +
        '<td class="mono">' + G.numDossier(p.numero) + '</td>' +
        '<td><strong>' + esc(p.prenom) + ' ' + esc(p.nom) + '</strong></td>' +
        '<td>' + (p.sexe || "—") + (p.date_naissance ? " · " + G.ageTexte(p.date_naissance) : "") + '</td>' +
        '<td>' + esc(p.telephone || "—") + '</td>' +
        '<td>' + G.fmtDate(p.cree_le) + '</td></tr>';
    }).join("");
    var vide = $("#pat-empty", el);
    vide.classList.toggle("hidden", r.data.length > 0);
    vide.textContent = q ? "Aucun patient trouvé." : "Aucun patient enregistré. Cliquez sur « + Nouveau patient ».";
  }

  // ---------------- Formulaire identité ----------------
  function ouvrirFormPatient(p, prerempli) {
    var f = $("#form-patient", el);
    $("#pat-form-title", el).textContent = p ? "Modifier le patient" : "Nouveau patient";
    G.remplirForm(f, p || prerempli || null);
    f.dataset.id = p ? p.id : "";
    $("#pat-form-err", el).textContent = "";
    $("#dlg-patient", el).showModal();
  }

  async function enregistrerPatient(e) {
    e.preventDefault();
    var f = e.target, d = G.lireForm(f), r;
    if (!d.nom || !d.prenom) { $("#pat-form-err", el).textContent = "Nom et prénom obligatoires."; return; }
    if (d.date_naissance && d.date_naissance > G.today()) { $("#pat-form-err", el).textContent = "Date de naissance dans le futur."; return; }
    if (f.dataset.id) r = await G.db.from("patients").update(d).eq("id", f.dataset.id).select().single();
    else r = await G.db.from("patients").insert(d).select().single();
    if (r.error) { $("#pat-form-err", el).textContent = G.errMsg(r.error); return; }
    $("#dlg-patient", el).close();
    if (rdvALier) {
      await G.db.from("rendez_vous").update({ patient_id: r.data.id }).eq("id", rdvALier);
      rdvALier = null;
    }
    G.toast(f.dataset.id ? "Patient modifié." : "Patient enregistré : " + G.numDossier(r.data.numero));
    ouvrirFiche(r.data.id);
  }

  // ---------------- Fiche ----------------
  async function ouvrirFiche(id) {
    $("#pat-liste", el).classList.add("hidden");
    var fiche = $("#pat-fiche", el);
    fiche.classList.remove("hidden");
    fiche.innerHTML = '<p class="small-muted">Chargement…</p>';

    var reqs = [G.db.from("patients").select("*").eq("id", id).single()];
    if (G.soignant()) {
      reqs.push(G.db.from("patients_medical").select("*").eq("patient_id", id).maybeSingle());
      reqs.push(G.db.from("constantes").select("*").eq("patient_id", id).order("pris_le", { ascending: false }).limit(20));
      reqs.push(G.db.from("consultations").select("*").eq("patient_id", id).order("date", { ascending: false }).limit(100));
    }
    var res = await Promise.all(reqs);
    var err = res.find(function (r) { return r.error; });
    if (err) { fiche.innerHTML = '<p class="form__error">' + esc(G.errMsg(err.error)) + '</p>'; return; }

    patient = res[0].data;
    patient._medical = res[1] ? res[1].data : null;
    patient._constantes = res[2] ? res[2].data : [];
    patient._consultations = res[3] ? res[3].data : [];
    renderFiche();
  }

  function info(label, val) {
    return val ? '<div class="kv"><span>' + label + '</span><strong>' + esc(val) + '</strong></div>' : "";
  }

  function renderFiche() {
    var p = patient, m = p._medical || {};
    var html = '' +
      '<div class="toolbar"><button class="btn btn--small btn--ghost" id="pat-back">← Liste des patients</button></div>' +
      '<div class="fiche-head card-box">' +
        '<div><span class="mono muted">' + G.numDossier(p.numero) + '</span>' +
          '<h2>' + esc(p.prenom) + ' ' + esc(p.nom) + '</h2>' +
          '<p class="muted">' + [p.sexe === "F" ? "Femme" : p.sexe === "M" ? "Homme" : "",
            p.date_naissance ? G.ageTexte(p.date_naissance) + " (né(e) le " + G.fmtDate(p.date_naissance) + ")" : ""]
            .filter(Boolean).join(" · ") + '</p></div>' +
        '<button class="btn btn--small btn--ghost" id="pat-edit">Modifier</button>' +
        '<div class="kv-grid">' +
          info("Téléphone", p.telephone) + info("Adresse", p.adresse) +
          info("Profession", p.profession) + info("Personne à prévenir", p.contact_urgence) +
        '</div>' +
      '</div>';

    if (G.soignant()) {
      html += '' +
        '<div class="card-box">' +
          '<div class="card-box__head"><h3>Informations médicales</h3><button class="btn btn--small btn--ghost" id="med-edit">Modifier</button></div>' +
          (m.allergies ? '<p class="alert-allergie">⚠️ Allergies : ' + esc(m.allergies) + '</p>' : "") +
          '<div class="kv-grid">' +
            info("Groupe sanguin", m.groupe_sanguin) + info("Antécédents", m.antecedents) +
            info("Traitements en cours", m.traitements_en_cours) +
          '</div>' +
          (!m.groupe_sanguin && !m.allergies && !m.antecedents && !m.traitements_en_cours ? '<p class="small-muted">Aucune information renseignée.</p>' : "") +
        '</div>' +

        '<div class="card-box">' +
          '<div class="card-box__head"><h3>Constantes</h3><button class="btn btn--small" id="const-add">+ Prendre les constantes</button></div>' +
          renderConstantes(p._constantes) +
        '</div>' +

        '<div class="card-box">' +
          '<div class="card-box__head"><h3>Consultations (' + p._consultations.length + ')</h3>' +
            (G.peut("admin", "medecin") ? '<button class="btn btn--small" id="consult-add">+ Nouvelle consultation</button>' : "") +
          '</div>' +
          renderConsultations(p._consultations) +
        '</div>';
    }

    var fiche = $("#pat-fiche", el);
    fiche.innerHTML = html;
    $("#pat-back", fiche).addEventListener("click", retourListe);
    $("#pat-edit", fiche).addEventListener("click", function () { ouvrirFormPatient(patient); });
    if (G.soignant()) {
      $("#med-edit", fiche).addEventListener("click", function () {
        G.remplirForm($("#form-medical", el), patient._medical);
        $("#med-form-err", el).textContent = "";
        $("#dlg-medical", el).showModal();
      });
      $("#const-add", fiche).addEventListener("click", function () {
        G.remplirForm($("#form-const", el), null);
        $("#const-form-err", el).textContent = "";
        $("#dlg-const", el).showModal();
      });
      var ca = $("#consult-add", fiche);
      if (ca) ca.addEventListener("click", function () {
        var f = $("#form-consult", el);
        G.remplirForm(f, null);
        f.dataset.id = "";
        $("#consult-title", el).textContent = "Nouvelle consultation";
        $("details", f).open = true;
        $("#consult-form-err", el).textContent = "";
        $("#dlg-consult", el).showModal();
      });
    }
  }

  function modifierConsultation(e) {
    var b = e.target.closest("[data-edit-consult]");
    if (!b || !patient) return;
    var c = patient._consultations.find(function (x) { return x.id === b.dataset.editConsult; });
    if (!c) return;
    var f = $("#form-consult", el);
    G.remplirForm(f, c);
    f.dataset.id = c.id;
    $("details", f).open = false;
    $("#consult-title", el).textContent = "Modifier la consultation du " + G.fmtDate(c.date);
    $("#consult-form-err", el).textContent = "";
    $("#dlg-consult", el).showModal();
  }

  function fmtConst(c) {
    var parts = [];
    if (c.tension_sys && c.tension_dia) parts.push("TA " + c.tension_sys + "/" + c.tension_dia);
    if (c.temperature) parts.push(c.temperature + " °C");
    if (c.pouls) parts.push(c.pouls + " bpm");
    if (c.poids) parts.push(c.poids + " kg");
    if (c.taille) parts.push(c.taille + " cm");
    if (c.saturation) parts.push("SpO₂ " + c.saturation + " %");
    if (c.glycemie) parts.push("Gly " + c.glycemie + " g/L");
    return parts.join(" · ");
  }

  function renderConstantes(list) {
    if (!list.length) return '<p class="small-muted">Aucune constante enregistrée.</p>';
    return '<div class="table-wrap table-wrap--flat"><table class="stock-table"><thead><tr><th>Date</th><th>Mesures</th><th>Par</th><th>Note</th></tr></thead><tbody>' +
      list.map(function (c) {
        var alerte = (c.temperature >= 38) || (c.tension_sys >= 140) || (c.tension_dia >= 90) || (c.saturation && c.saturation < 94);
        return '<tr><td>' + G.fmtDateTime(c.pris_le) + '</td><td' + (alerte ? ' class="val-alerte"' : "") + '>' + esc(fmtConst(c)) + '</td>' +
          '<td>' + esc(c.pris_par_nom || "—") + '</td><td class="motif">' + esc(c.note || "") + '</td></tr>';
      }).join("") + '</tbody></table></div>';
  }

  function renderConsultations(list) {
    if (!list.length) return '<p class="small-muted">Aucune consultation.</p>';
    return list.map(function (c) {
      var cst = patient._constantes.find(function (k) { return k.consultation_id === c.id; });
      return '<article class="consult">' +
        '<header><strong>' + G.fmtDateTime(c.date) + '</strong> · ' + esc(c.medecin_nom || "") +
          (G.peut("admin", "medecin") ? ' <button class="icon-btn" data-edit-consult="' + c.id + '" title="Modifier">✏️</button>' : "") +
        '</header>' +
        '<p><span class="lbl">Motif</span>' + G.nl2br(c.motif) + '</p>' +
        (cst ? '<p><span class="lbl">Constantes</span>' + esc(fmtConst(cst)) + '</p>' : "") +
        (c.examen ? '<p><span class="lbl">Examen</span>' + G.nl2br(c.examen) + '</p>' : "") +
        (c.diagnostic ? '<p><span class="lbl">Diagnostic</span><strong>' + G.nl2br(c.diagnostic) + '</strong></p>' : "") +
        (c.traitement ? '<p><span class="lbl">Traitement</span>' + G.nl2br(c.traitement) + '</p>' : "") +
        (c.notes ? '<p><span class="lbl">Notes</span>' + G.nl2br(c.notes) + '</p>' : "") +
        '</article>';
    }).join("");
  }

  function retourListe() {
    patient = null;
    $("#pat-fiche", el).classList.add("hidden");
    $("#pat-liste", el).classList.remove("hidden");
    chargerListe();
  }

  // ---------------- Enregistrements médicaux ----------------
  async function enregistrerMedical(e) {
    e.preventDefault();
    var d = G.lireForm(e.target);
    d.patient_id = patient.id;
    d.modifie_le = new Date().toISOString();
    var r = await G.db.from("patients_medical").upsert(d, { onConflict: "patient_id" });
    if (r.error) { $("#med-form-err", el).textContent = G.errMsg(r.error); return; }
    $("#dlg-medical", el).close();
    G.toast("Informations médicales enregistrées.");
    ouvrirFiche(patient.id);
  }

  function extraireConstantes(d, prefix) {
    var c = {}, rempli = false;
    CONST_CHAMPS.forEach(function (k) {
      var v = d[prefix + k];
      if (v != null) { c[k] = Number(v); rempli = true; }
    });
    if ((c.tension_sys == null) !== (c.tension_dia == null)) return { erreur: "Indiquez les deux valeurs de la tension." };
    return rempli ? c : null;
  }

  async function enregistrerConstantes(e) {
    e.preventDefault();
    var d = G.lireForm(e.target);
    var c = extraireConstantes(d, "");
    if (!c) { $("#const-form-err", el).textContent = "Saisissez au moins une mesure."; return; }
    if (c.erreur) { $("#const-form-err", el).textContent = c.erreur; return; }
    c.patient_id = patient.id;
    c.note = d.note;
    var r = await G.db.from("constantes").insert(c);
    if (r.error) { $("#const-form-err", el).textContent = G.errMsg(r.error); return; }
    $("#dlg-const", el).close();
    G.toast("Constantes enregistrées.");
    ouvrirFiche(patient.id);
  }

  async function enregistrerConsultation(e) {
    e.preventDefault();
    var f = e.target, d = G.lireForm(f), err = $("#consult-form-err", el);
    if (!d.motif) { err.textContent = "Le motif est obligatoire."; return; }
    var cst = extraireConstantes(d, "c_");
    if (cst && cst.erreur) { err.textContent = cst.erreur; return; }
    var champs = { motif: d.motif, examen: d.examen, diagnostic: d.diagnostic, traitement: d.traitement, notes: d.notes };
    var r;
    if (f.dataset.id) {
      r = await G.db.from("consultations").update(champs).eq("id", f.dataset.id).select().single();
    } else {
      champs.patient_id = patient.id;
      r = await G.db.from("consultations").insert(champs).select().single();
      if (!r.error && cst) {
        cst.patient_id = patient.id;
        cst.consultation_id = r.data.id;
        var r2 = await G.db.from("constantes").insert(cst);
        if (r2.error) G.toast("Consultation enregistrée, mais pas les constantes : " + G.errMsg(r2.error), true);
      }
    }
    if (r.error) { err.textContent = G.errMsg(r.error); return; }
    $("#dlg-consult", el).close();
    G.toast("Consultation enregistrée.");
    ouvrirFiche(patient.id);
  }

  // ---------------- Point d'entrée ----------------
  // arg : id de patient (ouvrir sa fiche) ou { nouveau: {...}, rdvId } (création depuis un rendez-vous)
  function show(arg) {
    if (typeof arg === "string") { ouvrirFiche(arg); return; }
    if (!patient) chargerListe();
    if (arg && arg.nouveau) {
      rdvALier = arg.rdvId || null;
      if (patient) retourListe();
      ouvrirFormPatient(null, arg.nouveau);
    }
  }

  G.module({
    id: "patients",
    label: "Patients",
    roles: ["admin", "medecin", "infirmier", "secretaire"],
    init: init,
    show: show
  });
})();
