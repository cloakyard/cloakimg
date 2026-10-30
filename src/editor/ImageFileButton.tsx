import { useId, useRef, useState } from "react";
import { I } from "../components/icons";

/** A native chooser with a keyboard/touch action and same-file retry. */
export function ImageFileButton({
  accept,
  preview,
  onPick,
}: {
  accept: string;
  preview?: string;
  onPick: (file: File) => void | Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          setError(false);
          setBusy(true);
          try {
            await onPick(file);
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        className="btn btn-secondary w-full"
        disabled={busy}
        aria-busy={busy || undefined}
        aria-describedby={error ? errorId : undefined}
        onClick={() => input.current?.click()}
      >
        {preview ? (
          <img src={preview} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
        ) : (
          <I.Upload size={16} />
        )}
        {preview ? "Replace image…" : "Choose image…"}
      </button>
      {error && (
        <p id={errorId} className="img-field-error mt-2" role="alert">
          This image could not be opened. Try another image.
        </p>
      )}
    </>
  );
}
