import { I } from "../components/icons";
import { GITHUB_ISSUES_URL } from "../constants/links";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function RecoveryPage() {
  return (
    <div className="air-page img-site img-recovery">
      <a href="#main" className="air-page-skip air-button">
        Skip to error details
      </a>
      <Header reading />
      <main id="main" tabIndex={-1} className="air-page-width air-page-intro">
        <p className="air-page-meta">404</p>
        <h1>Page not found.</h1>
        <p className="air-page-lede">
          This address doesn’t lead to a CloakIMG page. Return home to start editing or open a
          recent image.
        </p>
        <div className="air-page-actions">
          <a className="air-button air-button--primary" href={import.meta.env.BASE_URL}>
            Return to CloakIMG <I.ArrowUpRight size={18} aria-hidden="true" />
          </a>
          <a className="air-button air-button--quiet" href={GITHUB_ISSUES_URL}>
            Report a broken link <I.ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}
