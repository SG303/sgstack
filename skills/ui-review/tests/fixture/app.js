// Deliberately flawed behaviour: a long blocking task, a late layout shift,
// fake urgency and an unhelpful error message.
function block(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    /* busy wait */
  }
}

window.addEventListener("load", () =>
  setTimeout(() => {
    block(350);
    const banner = document.createElement("div");
    banner.className = "promo";
    banner.style.cssText = "background:#ffd84d;padding:40px;text-align:center;color:#fff";
    banner.textContent = "Sommeraktion: 10% auf alle E-Bikes";
    document.body.insertBefore(banner, document.querySelector(".hero"));
  }, 1200),
);

let seconds = 299;
setInterval(() => {
  seconds = seconds > 0 ? seconds - 1 : 299;
  const el = document.getElementById("countdown");
  if (el) el.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}, 1000);

function submitForm() {
  const name = document.getElementById("name").value.trim();
  const mail = document.getElementById("mail").value.trim();
  const err = document.getElementById("err");
  block(250);
  if (!name || !mail.includes("@")) {
    err.textContent = "Error!";
    return;
  }
  err.textContent = "";
  document.getElementById("form").innerHTML = '<div class="ok">Danke! Wir melden uns.</div>';
}
