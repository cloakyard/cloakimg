import { I } from "../components/icons";

const capabilities = [
  {
    icon: I.Sliders,
    title: "Find the right light",
    copy: "Adjust tone and colour, shape a curve, try a filter or relight your photo.",
  },
  {
    icon: I.Eraser,
    title: "Keep what matters",
    copy: "Heal a distraction, soften a portrait background or remove it entirely.",
  },
  {
    icon: I.EyeOff,
    title: "Share with care",
    copy: "Redact faces or regions, inspect metadata and remove sensitive fields on export.",
  },
  {
    icon: I.Layers,
    title: "Make it yours",
    copy: "Add text, shapes, drawing, emojis, watermarks and images on editable layers.",
  },
  {
    icon: I.Crop,
    title: "Get the framing right",
    copy: "Crop, rotate, correct perspective, resize, or add a frame and border.",
  },
  {
    icon: I.Download,
    title: "Take it with you",
    copy: "Download JPEG, PNG, WebP, AVIF or HEIC with control over size and metadata.",
  },
];

export function Features() {
  return (
    <>
      <section
        id="toolkit"
        className="img-section air-page-width"
        tabIndex={-1}
        aria-labelledby="toolkit-title"
      >
        <h2 id="toolkit-title">A little adjustment. A new possibility.</h2>
        <ul className="img-capabilities">
          {capabilities.map(({ icon: Icon, title, copy }) => (
            <li key={title}>
              <Icon size={20} stroke={1.6} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </li>
          ))}
        </ul>
      </section>
      <section
        id="id-photo-workflow"
        className="img-section air-page-width img-reading"
        tabIndex={-1}
        aria-labelledby="id-photo-title"
      >
        <h2 id="id-photo-title">Ready for paper, too.</h2>
        <p>
          Prepare a passport or visa photo, choose an authority size and arrange exact 300-DPI
          copies on photo or office paper. Download a PDF or print with cut guides.
        </p>
        <a className="air-button air-button--quiet" href="#workbench">
          Prepare an ID photo <I.ArrowRight size={16} aria-hidden="true" />
        </a>
      </section>
      <section
        id="privacy-model"
        className="img-section air-page-width img-reading"
        tabIndex={-1}
        aria-labelledby="privacy-model-title"
      >
        <h2 id="privacy-model-title">Your photos stay on your device.</h2>
        <p>
          Editing and export happen in your browser. Optional AI models download with your
          permission and run locally. Your images are never sent to a cloud inference service.
        </p>
        <p>
          No account or analytics. Recent files and a working draft can be stored in this browser;
          you can remove them from the start dialog or clear the site’s data.
        </p>
      </section>
    </>
  );
}
