import { useRef } from "react";
import { BrandMark, I } from "../components/icons";
import { GITHUB_REPO_URL } from "../constants/links";

const links = [
  { href: "#workbench", label: "Start editing" },
  { href: "#toolkit", label: "Tools" },
  { href: "#privacy-model", label: "Privacy" },
];

export function Header({ reading = false }: { reading?: boolean }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const navigation = (
    <>
      {(reading ? [{ href: import.meta.env.BASE_URL, label: "Home" }] : links).map(
        ({ href, label }) => (
          <a key={href} href={href}>
            {label}
          </a>
        ),
      )}
      <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
        Source <I.ArrowUpRight size={16} aria-hidden="true" />
      </a>
    </>
  );
  return (
    <header className="air-page-header img-header img-page-width">
      <a
        href={import.meta.env.BASE_URL}
        className="air-page-brand img-brand"
        aria-label="CloakIMG home"
      >
        <BrandMark size={36} />
        <span translate="no">CloakIMG</span>
      </a>
      <nav className="air-page-nav img-navigation" aria-label="Primary navigation">
        {navigation}
      </nav>
      <details
        className="img-mobile-navigation"
        ref={disclosure}
        onKeyDown={(event) => {
          if (event.key === "Escape" && disclosure.current?.open) {
            disclosure.current.open = false;
            disclosure.current.querySelector("summary")?.focus();
            event.preventDefault();
          }
        }}
      >
        <summary className="air-button air-button--quiet">
          Menu <I.ChevronDown size={16} aria-hidden="true" />
        </summary>
        <nav
          className="air-page-nav"
          aria-label="Primary navigation"
          onClick={(event) => {
            if ((event.target as Element).closest("a") && disclosure.current) {
              disclosure.current.open = false;
              disclosure.current.querySelector("summary")?.focus({ preventScroll: true });
            }
          }}
        >
          {navigation}
        </nav>
      </details>
    </header>
  );
}
