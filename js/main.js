(function () {
  "use strict";
  var cfg = window.CABINET;

  // Année du pied de page
  document.getElementById("year").textContent = new Date().getFullYear();

  // Menu mobile
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("nav--open");
    toggle.setAttribute("aria-expanded", open);
  });
  nav.addEventListener("click", function (e) {
    if (e.target.tagName === "A") {
      nav.classList.remove("nav--open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  // Indicateur ouvert / fermé (heure de Bamako = UTC+0)
  var now = new Date();
  var day = now.getUTCDay();
  var hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  var row = document.querySelector('.hours tr[data-day="' + day + '"]');
  if (row) row.classList.add("today");
  var h = cfg.horaires[day];
  var status = document.getElementById("open-status");
  if (h && hour >= h[0] && hour < h[1]) {
    status.textContent = "● Ouvert maintenant";
    status.classList.add("is-open");
  } else {
    status.textContent = "● Fermé pour le moment";
    status.classList.add("is-closed");
  }

  // Formulaire de rendez-vous → WhatsApp
  var form = document.getElementById("rdv-form");
  var err = document.getElementById("rdv-error");
  var dateInput = form.elements.date;
  dateInput.min = now.toISOString().slice(0, 10);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = form.elements;
    var nom = d.nom.value.trim();
    var tel = d.tel.value.trim();
    var date = d.date.value;
    if (!nom || !tel || !date) {
      err.textContent = "Merci de renseigner votre nom, votre téléphone et la date souhaitée.";
      return;
    }
    err.textContent = "";
    var dateFr = date.split("-").reverse().join("/");
    var msg =
      "Bonjour, je souhaite prendre rendez-vous au " + cfg.nom + ".\n" +
      "Nom : " + nom + "\n" +
      "Téléphone : " + tel + "\n" +
      "Date souhaitée : " + dateFr + " (" + d.moment.value + ")\n" +
      (d.motif.value.trim() ? "Motif : " + d.motif.value.trim() : "");
    window.open("https://wa.me/" + cfg.whatsapp + "?text=" + encodeURIComponent(msg), "_blank");
  });
})();
