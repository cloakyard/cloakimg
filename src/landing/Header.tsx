import type { ReactNode } from "react";
import { BrandMark, I } from "../components/icons";
import { GITHUB_REPO_URL } from "../constants/links";

interface Props {
  right?: ReactNode;
}

export function Header({ right }: Props) {
  return (
    <header className="cloak-site-header">
      <div className="site-frame cloak-site-header__inner">
        <a href="#main" className="cloak-brand-button" aria-label="CloakIMG home">
          <BrandMark size={40} />
          <span className="logo-wordmark">
            Cloak<span>IMG</span>
          </span>
        </a>

        <div className="cloak-site-header__context" aria-label="Product context">
          <span>Photo workbench</span>
          <span>
            <i aria-hidden="true" />
            Local-first
          </span>
        </div>

        <div className="cloak-site-header__actions">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="cloak-outline-link"
          >
            <I.Github size={14} />
            <span className="hidden sm:inline">Source</span>
          </a>
          {right}
        </div>
      </div>
    </header>
  );
}
