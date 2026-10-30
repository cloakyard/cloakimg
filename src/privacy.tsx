/** Progressive navigation on the prerendered policy; no React runtime is needed. */
for (const details of document.querySelectorAll<HTMLDetailsElement>("details")) {
  details.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && details.open) {
      details.open = false;
      details.querySelector("summary")?.focus();
      event.preventDefault();
    }
  });
}
const menu = document.querySelector<HTMLDetailsElement>(".img-mobile-navigation");
menu?.addEventListener("click", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest("a")) return;
  menu.open = false;
  menu.querySelector("summary")?.focus({ preventScroll: true });
});
function restoreSection() {
  let id: string;
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return;
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".air-contents a")) {
    if (link.hash === location.hash) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
  const target = document.getElementById(id);
  if (target?.closest(".air-policy")) {
    target.focus({ preventScroll: true });
    target.scrollIntoView();
  }
}
window.addEventListener("hashchange", restoreSection);
restoreSection();
