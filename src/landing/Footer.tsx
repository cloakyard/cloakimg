import { I } from "../components/icons";
import {
  GITHUB_AUTHOR_URL,
  GITHUB_LICENSE_URL,
  CLOAKYARD_URL,
  GITHUB_REPO_URL,
} from "../constants/links";
declare const __APP_VERSION__: string;
export function Footer({ privacy = false }: { privacy?: boolean }) {
  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";
  return (
    <footer className="air-page-footer img-page-width img-footer">
      <p className="air-page-identity">
        <span translate="no">CloakIMG v{version}</span>
        <span>
          Built by{" "}
          <a href={GITHUB_AUTHOR_URL} target="_blank" rel="noopener noreferrer">
            Sumit Sahoo
          </a>
        </span>
      </p>
      <nav aria-label="Footer navigation">
        <a href={`${import.meta.env.BASE_URL}privacy/`} aria-current={privacy ? "page" : undefined}>
          Privacy
        </a>
        <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
          Source <I.ArrowUpRight size={16} aria-hidden="true" />
        </a>
        <a href={GITHUB_LICENSE_URL} target="_blank" rel="noopener noreferrer">
          MIT license <I.ArrowUpRight size={16} aria-hidden="true" />
        </a>
        <a href={CLOAKYARD_URL} target="_blank" rel="noopener noreferrer">
          Cloakyard <I.ArrowUpRight size={16} aria-hidden="true" />
        </a>
        <a href="https://ko-fi.com/sumitsahoo21" target="_blank" rel="noopener noreferrer">
          Buy me a coffee <I.ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </nav>
    </footer>
  );
}
