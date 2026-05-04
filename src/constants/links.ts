// links.ts — Single source of truth for every external URL the app
// links to (GitHub repo, issues, license, the Cloakyard org page,
// the author's profile). Keeping these in one module means a rename
// or move only touches this file instead of hunting through Header,
// Footer, PrivacyModal, ErrorBoundary, etc.

/** GitHub `owner/repo` slug — useful where the API or a template
 *  string only wants the path-relative form. */
export const GITHUB_REPO_SLUG = "cloakyard/cloakimg";

/** Canonical repo URL. All other GitHub links derive from this. */
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO_SLUG}`;

/** Issue list — surfaced from PrivacyModal as the support contact. */
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;

/** New-issue URL. ErrorBoundary appends a query string to pre-fill
 *  the title/body/labels. */
export const GITHUB_NEW_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new`;

/** Direct link to the LICENSE file on `main`. */
export const GITHUB_LICENSE_URL = `${GITHUB_REPO_URL}/blob/main/LICENSE`;

/** Cloakyard organisation page — the family of tools this app belongs to. */
export const GITHUB_ORG_URL = "https://github.com/cloakyard";

/** Author profile — surfaced in the footer attribution row. */
export const GITHUB_AUTHOR_URL = "https://github.com/sumitsahoo";

/** Schemeless display label for the repo (e.g. shown as link text in
 *  the privacy modal). Derived so repo renames only touch this file. */
export const GITHUB_REPO_DISPLAY = `github.com/${GITHUB_REPO_SLUG}`;
