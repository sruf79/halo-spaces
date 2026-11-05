// „Say Thanks“ wie im Comment Ranker (coffee-button.css): Tasse mit Dampf in
// einen Knopf einsetzen; beim Darüberfahren steigt der Dampf von unten neu auf
// und klingt nach dem Verlassen 7,5 s lang aus
"use strict";

function coffeeButton(button, label, cupSrc) {
  const span = (cls, text) => {
    const e = document.createElement("span");
    if (cls) {
      e.className = cls;
    }
    if (text != null) {
      e.textContent = text;
    }
    return e;
  };
  const cup = span("cb-cup");
  const img = document.createElement("img");
  img.src = cupSrc;
  img.alt = "";
  const steam = span("cb-steam");
  for (let i = 0; i < 5; i++) {
    steam.append(span("cb-wisp"));
  }
  cup.append(img, steam);
  const text = button.querySelector(".label") || span("label", label);
  button.replaceChildren(text, cup);
  button.classList.add("coffee-btn");
  let timer = 0;
  button.addEventListener("mouseenter", () => {
    clearTimeout(timer);
    // Schwaden von vorn: Animation neu starten
    for (const w of steam.children) {
      w.style.animation = "none";
      void w.offsetWidth;
      w.style.animation = "";
    }
    button.classList.add("cb-hover");
  });
  button.addEventListener("mouseleave", () => {
    clearTimeout(timer);
    timer = setTimeout(() => button.classList.remove("cb-hover"), 7500);
  });
  return button;
}
