import { I } from "../components/icons";
import {
  GITHUB_AUTHOR_URL,
  GITHUB_LICENSE_URL,
  CLOAKYARD_URL,
  GITHUB_REPO_URL,
} from "../constants/links";
import { ALL_TOOLS } from "../editor/tools";

declare const __APP_VERSION__: string;

interface Props {
  onPrivacy: () => void;
}

export function Footer({ onPrivacy }: Props) {
  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

  return (
    <footer
      className="cloak-site-footer"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="site-frame cloak-site-footer__inner">
        <div className="cloak-site-footer__statement-row">
          <div>
            <p className="cloak-mono-label cloak-site-footer__eyebrow" translate="no">
              CloakIMG / Cloakyard
            </p>
            <p className="cloak-site-footer__statement">
              Open a photo. <span>Keep it local.</span>
            </p>
          </div>

          <nav className="cloak-site-footer__nav" aria-label="Footer">
            <a href="#toolkit">{ALL_TOOLS.length} tools</a>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <button type="button" onClick={onPrivacy}>
              Privacy policy
            </button>
            <a href={CLOAKYARD_URL} target="_blank" rel="noreferrer">
              Cloakyard
              <I.ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </nav>
        </div>

        <div className="cloak-site-footer__meta">
          <span translate="no">CloakIMG v{version}</span>
          <span className="cloak-site-footer__separator" aria-hidden="true">
            /
          </span>
          <span>
            Built by{" "}
            <a href={GITHUB_AUTHOR_URL} target="_blank" rel="noreferrer">
              Sumit Sahoo
            </a>
          </span>
          <div className="cloak-site-footer__actions">
            <button type="button" onClick={onPrivacy}>
              <I.ShieldCheck size={14} aria-hidden="true" />
              Privacy
            </button>
            <a href={GITHUB_LICENSE_URL} target="_blank" rel="noreferrer">
              <I.Scale size={14} aria-hidden="true" />
              MIT licensed
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
