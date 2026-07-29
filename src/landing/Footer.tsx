import { I } from "../components/icons";
import {
  GITHUB_AUTHOR_URL,
  GITHUB_LICENSE_URL,
  GITHUB_ORG_URL,
  GITHUB_REPO_URL,
} from "../constants/links";

declare const __APP_VERSION__: string;

interface Props {
  onPrivacy?: () => void;
}

export function Footer({ onPrivacy }: Props) {
  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

  return (
    <footer className="cloak-site-footer">
      <div className="site-frame cloak-site-footer__inner">
        <div className="cloak-site-footer__statement-row">
          <p className="cloak-site-footer__statement">Photo work stays with the photographer.</p>
          <div className="cloak-site-footer__aside">
            <img src="/icons/cloakyard.svg" alt="" aria-hidden="true" width={40} height={40} />
            <p>
              Part of Cloakyard, a family of privacy-focused tools that keep your data on your
              device.
            </p>
            <a href={GITHUB_ORG_URL} target="_blank" rel="noreferrer">
              Explore Cloakyard
              <I.ArrowUpRight size={14} />
            </a>
          </div>
        </div>

        <div className="cloak-site-footer__meta">
          <span className="cloak-mono-label">CloakIMG / v{version}</span>
          <span>
            Built by{" "}
            <a href={GITHUB_AUTHOR_URL} target="_blank" rel="noreferrer">
              Sumit Sahoo
            </a>
          </span>
          <span className="cloak-site-footer__links">
            {onPrivacy && (
              <button type="button" onClick={onPrivacy}>
                Privacy
              </button>
            )}
            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
              Source
            </a>
            <a href={GITHUB_LICENSE_URL} target="_blank" rel="noreferrer">
              MIT license
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
