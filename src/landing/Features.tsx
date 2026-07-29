import { I } from "../components/icons";
import { GITHUB_REPO_URL } from "../constants/links";
import { ALL_TOOLS } from "../editor/tools";

const CAPABILITIES = [
  {
    index: "01",
    icon: I.Sliders,
    title: "Tone and colour",
    description: "Adjust, levels, selective colour, filters, time-of-day grades, and relighting.",
    meta: "Whole / subject / background",
  },
  {
    index: "02",
    icon: I.Eraser,
    title: "Retouch and isolate",
    description: "Spot heal, portrait blur, background removal, and contextual tap-to-fix flows.",
    meta: "Local canvas + optional AI",
  },
  {
    index: "03",
    icon: I.EyeOff,
    title: "Privacy editing",
    description: "Redact faces or regions, inspect metadata, and strip sensitive fields on export.",
    meta: "No image-content upload",
  },
  {
    index: "04",
    icon: I.Layers,
    title: "Compose and annotate",
    description: "Text, shapes, drawing, pen paths, emojis, watermarks, and placed images.",
    meta: "Layered Fabric canvas",
  },
  {
    index: "05",
    icon: I.Crop,
    title: "Frame and geometry",
    description: "Crop, rotate, perspective correction, resize, borders, and presentation frames.",
    meta: "Non-destructive workflow",
  },
  {
    index: "06",
    icon: I.Download,
    title: "Local export",
    description:
      "Write JPEG, PNG, WebP, AVIF, or supported HEIC with quality, size, metadata, and privacy controls.",
    meta: "Direct browser download",
  },
] as const;

const RECEIPT = [
  {
    number: "01",
    title: "Image bytes enter browser memory",
    meta: "Input / local file handle",
  },
  {
    number: "02",
    title: "Canvas, Fabric, WASM, and optional models do the work",
    meta: "Process / this tab",
  },
  {
    number: "03",
    title: "A new image is written to your device",
    meta: "Output / browser download",
  },
] as const;

export function Features() {
  return (
    <>
      <section className="cloak-stat-strip" aria-label="CloakIMG facts">
        <div className="site-frame cloak-stat-strip__inner">
          <div className="cloak-stat">
            <span className="cloak-stat__value">{ALL_TOOLS.length}</span>
            <span className="cloak-stat__label">Editor tools</span>
          </div>
          <div className="cloak-stat">
            <span className="cloak-stat__value">4+</span>
            <span className="cloak-stat__label">Export formats</span>
          </div>
          <div className="cloak-stat">
            <span className="cloak-stat__value">0</span>
            <span className="cloak-stat__label">Image uploads</span>
          </div>
          <div className="cloak-stat">
            <span className="cloak-stat__value">MIT</span>
            <span className="cloak-stat__label">Open-source license</span>
          </div>
        </div>
      </section>

      <section id="toolkit" className="site-frame cloak-toolkit">
        <div className="cloak-toolkit__head">
          <h2 className="cloak-section-title">Photo jobs, one workbench.</h2>
          <p>
            The editor stays mounted while tools change, so the canvas, history, layers, and export
            contract remain stable from the first adjustment to the final file.
          </p>
        </div>

        <ol className="cloak-capability-ledger" aria-label="Photo editor capabilities">
          {CAPABILITIES.map(({ index, icon: Icon, title, description, meta }) => (
            <li key={index}>
              <span className="cloak-ledger__index">{index}</span>
              <Icon size={18} className="cloak-ledger__icon" aria-hidden="true" />
              <span className="cloak-ledger__copy">
                <strong>{title}</strong>
                <span>{description}</span>
              </span>
              <span className="cloak-ledger__meta">{meta}</span>
            </li>
          ))}
        </ol>
      </section>

      <section id="privacy-model" className="cloak-proof-band">
        <div className="site-frame cloak-proof-band__frame">
          <div className="cloak-proof-band__inner">
            <div>
              <h2 className="cloak-section-title">The privacy promise has an architecture.</h2>
              <p className="cloak-proof-copy">
                CloakIMG is a client-side photo editor. It can download app code or on-device model
                weights when a capability needs them; your image content is not sent with those
                requests.
              </p>
              <a
                className="cloak-text-link cloak-text-link--night"
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
              >
                Audit the source
                <I.ArrowRight size={15} className="cloak-link-arrow" />
              </a>
            </div>

            <div>
              <div className="cloak-receipt__header">
                <span>Image path</span>
                <span>Verified by design</span>
              </div>
              <div className="cloak-receipt">
                {RECEIPT.map((item) => (
                  <div key={item.number} className="cloak-receipt__row">
                    <span>{item.number}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.meta}</small>
                    </div>
                    <I.ShieldCheck size={16} aria-hidden="true" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
