/* Module Rendez-vous : demandes du site + rendez-vous saisis par le personnel. */
(function () {
  "use strict";
  var G = window.G, $ = G.$, esc = G.esc;
  var el, rdvs = [];
  var STATUTS = { en_attente: "En attente", confirme: "Confirmé", annule: "Annulé", termine: "Terminé" };

  function peutGerer() { return G.peut("admin", "medecin", "secretaire"); }

  function init(root) {
    el = root;
    el.innerHTML = '' +
      '<div class="toolbar">' +
        '<select id="rdv-filter">' +
          '<option value="jour">Aujourd\'hui</option>' +
          '<option value="a_venir" selected>À venir</option>' +
          '<option value="en_attente">En attente</option>' +
          '<option value="tous">Tous</option>' +
        '</select>' +
        '<button class="btn btn--small btn--ghost" id="rdv-refresh">Actualiser</button>' +
        (peutGerer() ? '<button class="btn btn--small" id="rdv-add">+ Nouveau rendez-vous</button>' : "") +
      '</div>' +
      '<div class="table-wrap"><table class="stock-table">' +
        '<thead><tr><th>Date</th><th>Moment</th><th>Patient</th><th>Téléphone</th><th>Motif</th><th>Statut</th><th>Fiche</th></tr></thead>' +
        '<tbody id="rdv-body"></tbody></table>' +
        '<p id="rdv-empty" class="empty hidden">Aucun rendez-vous.</p></div>' +
      '<dialog id="dlg-rdv"><form class="form" id="form-rdv" method="dialog">' +
        '<h2>Nouveau rendez-vous</h2>' +
        '<div class="form__row"><label>Nom complet *<input name="nom" required></label>' +
          '<label>Téléphone *<input name="telephone" type="tel" required></label></div>' +
        '<div class="form__row"><label>Date *<input name="date_souhaitee" type="date" required></label>' +
          '<label>Moment<select name="moment"><option>Matin</option><option>Après-midi</option><option>Soir</option></select></label></div>' +
        '<label>Motif<textarea name="motif" rows="2"></textarea></label>' +
        '<p class="form__error" id="rdv-form-err"></p>' +
        '<div class="dialog-actions"><button type="button" class="btn btn--ghost" data-close>Annuler</button><button class="btn">Enregistrer</button></div>' +
      '</form></dialog>';

    $("#rdv-filter", el).addEventListener("change", charger);
    $("#rdv-refresh", el).addEventListener("click", charger);
    var add = $("#rdv-add", el);
    if (add) add.addEventListener("click", function () {
      var f = $("#form-rdv", el);
      G.remplirForm(f, { date_souhaitee: G.today(), moment: "Matin" });
      $("#rdv-form-err", el).textContent = "";
      $("#dlg-rdv", el).showModal();
    });
    $("#form-rdv", el).addEventListener("submit", async function (e) {
      e.preventDefault();
      var d = G.lireForm(e.target);
      d.statut = "confirme";
      var r = await G.db.from("rendez_vous").insert(d);
      if (r.error) { $("#rdv-form-err", el).textContent = G.errMsg(r.error); return; }
      $("#dlg-rdv", el).close();
      G.toast("Rendez-vous enregistré.");
      charger();
    });

    $("#rdv-body", el).addEventListener("change", async function (e) {
      if (!e.target.matches(".statut-select")) return;
      var r = await G.db.from("rendez_vous").update({ statut: e.target.value }).eq("id", e.target.dataset.id);
      if (r.error) { G.toast(G.errMsg(r.error), true); return; }
      charger();
    });
    $("#rdv-body", el).addEventListener("click", function (e) {
      var b = e.target.closest("button[data-fiche]");
      if (!b) return;
      var v = rdvs.find(function (x) { return x.id === b.dataset.fiche; });
      if (v.patient_id) { G.ouvrir("patients", v.patient_id); return; }
      var mots = v.nom.trim().split(/\s+/);
      G.ouvrir("patients", {
        rdvId: v.id,
        nouveau: { prenom: mots[0], nom: mots.slice(1).join(" ") || "", telephone: v.telephone }
      });
    });
  }

  async function charger() {
    var filtre = $("#rdv-filter", el).value;
    var q = G.db.from("rendez_vous").select("*")
      .order("date_souhaitee", { ascending: filtre !== "tous" }).order("cree_le");
    if (filtre === "jour") q = q.eq("date_souhaitee", G.today()).neq("statut", "annule");
    if (filtre === "a_venir") q = q.gte("date_souhaitee", G.today()).in("statut", ["en_attente", "confirme"]);
    if (filtre === "en_attente") q = q.eq("statut", "en_attente");
    if (filtre === "tous") q = q.limit(500);
    var r = await q;
    if (r.error) { G.status(G.errMsg(r.error), true); return; }
    rdvs = r.data;

    var nb = await G.db.from("rendez_vous").select("id", { count: "exact", head: true }).eq("statut", "en_attente");
    var badge = $("#count-rdv");
    if (badge) badge.textContent = nb.count ? nb.count : "";

    var gerer = peutGerer();
    $("#rdv-body", el).innerHTML = rdvs.map(function (v) {
      var statut = gerer
        ? '<select class="statut-select" data-id="' + v.id + '">' + Object.keys(STATUTS).map(function (s) {
            return '<option value="' + s + '"' + (s === v.statut ? " selected" : "") + ">" + STATUTS[s] + "</option>";
          }).join("") + "</select>"
        : STATUTS[v.statut];
      return "<tr" + (v.date_souhaitee === G.today() ? ' class="row-today"' : "") + ">" +
        "<td><strong>" + G.fmtDate(v.date_souhaitee) + "</strong></td>" +
        "<td>" + esc(v.moment || "—") + "</td>" +
        "<td>" + esc(v.nom) + "</td>" +
        '<td><a href="tel:' + esc(String(v.telephone).replace(/\s/g, "")) + '">' + esc(v.telephone) + "</a></td>" +
        '<td class="motif">' + esc(v.motif || "—") + "</td>" +
        "<td>" + statut + "</td>" +
        '<td><button class="btn btn--small btn--ghost" data-fiche="' + v.id + '">' + (v.patient_id ? "Ouvrir" : "Créer") + "</button></td></tr>";
    }).join("");
    $("#rdv-empty", el).classList.toggle("hidden", rdvs.length > 0);
  }

  G.module({
    id: "rdv",
    label: "Rendez-vous",
    roles: ["admin", "medecin", "infirmier", "secretaire"],
    init: init,
    show: charger
  });
})();
