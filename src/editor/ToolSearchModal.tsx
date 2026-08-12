// ToolSearchModal.tsx — Keyboard-first tool index adapted from CloakPDF's
// unified editor. The rail stays icon-only at rest; this searchable index
// carries the full names and family labels when scanning 25 tools is slower
// than typing a few letters.

import { useEffect, useMemo, useRef, useState } from "react";
import { I } from "../components/icons";
import { ModalCloseButton, ModalFrame, useModalClose } from "../components/ModalFrame";
import { searchEditorTools, TOOL_GROUP_LABELS } from "./toolSearch";
import { ALL_TOOLS, type ToolId } from "./tools";

interface Props {
  instant?: boolean;
  onClose: () => void;
  onSelect: (id: ToolId) => void;
}

export function ToolSearchModal({ instant = false, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchEditorTools(query), [query]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    setActiveIndex((current) => (current >= results.length ? 0 : current));
  }, [results.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tool-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [activeIndex]);

  return (
    <ModalFrame
      onClose={onClose}
      instant={instant}
      position="absolute"
      maxWidth="max-w-168"
      labelledBy="tool-search-title"
    >
      <ToolSearchBody
        query={query}
        results={results}
        activeIndex={activeIndex}
        inputRef={inputRef}
        listRef={listRef}
        onQuery={(next) => {
          setQuery(next);
          setActiveIndex(0);
        }}
        onActive={setActiveIndex}
        onClose={onClose}
        onSelect={onSelect}
      />
    </ModalFrame>
  );
}

interface BodyProps {
  query: string;
  results: typeof ALL_TOOLS;
  activeIndex: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
  onQuery: (next: string) => void;
  onActive: (index: number) => void;
  onClose: () => void;
  onSelect: (id: ToolId) => void;
}

function ToolSearchBody({
  query,
  results,
  activeIndex,
  inputRef,
  listRef,
  onQuery,
  onActive,
  onClose,
  onSelect,
}: BodyProps) {
  const animatedClose = useModalClose();

  const choose = (id: ToolId | undefined, immediate = false) => {
    if (!id) return;
    if (immediate) {
      onClose();
      onSelect(id);
      return;
    }
    if (animatedClose) {
      animatedClose(() => onSelect(id));
      return;
    }
    onClose();
    onSelect(id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onActive(results.length === 0 ? 0 : (activeIndex + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onActive(results.length === 0 ? 0 : (activeIndex - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[activeIndex]?.id, true);
    }
  };

  const countLabel = `${results.length} ${results.length === 1 ? "tool" : "tools"}`;

  return (
    <>
      <div className="cloak-dialog__header">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="cloak-dialog__icon">
            <I.Search size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="t-eyebrow text-[10px]">Workbench / navigation</div>
            <div id="tool-search-title" className="t-headline truncate text-base">
              Find a tool
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            id="tool-search-count"
            aria-live="polite"
            aria-atomic="true"
            className="t-mono text-[9px] tracking-[0.05em] text-text-muted uppercase"
          >
            {countLabel}
          </span>
          <ModalCloseButton onClose={onClose} label="Close tool search" iconSize={14} />
        </div>
      </div>

      <div className="flex h-13 shrink-0 items-center gap-2.5 border-b border-border bg-page-bg px-4 focus-within:z-10 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-coral-500">
        <I.Search size={17} className="shrink-0 text-text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          name="tool-search"
          type="search"
          role="combobox"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search editor tools"
          aria-describedby="tool-search-count"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="tool-search-listbox"
          aria-activedescendant={
            results.length > 0 ? `tool-search-option-${activeIndex}` : undefined
          }
          placeholder="Search tools…"
          autoComplete="off"
          spellCheck={false}
          className="editor-tool-search-input h-full min-w-0 flex-1 appearance-none border-none bg-transparent font-[inherit] text-sm text-text outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              onQuery("");
              inputRef.current?.focus({ preventScroll: true });
            }}
            aria-label="Clear tool search"
            className="btn btn-ghost btn-icon-sm shrink-0"
          >
            <I.X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        ref={listRef}
        id="tool-search-listbox"
        role="listbox"
        aria-label="Editor tools"
        className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {results.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <div className="text-sm font-semibold text-text">No tool found</div>
            <div className="mt-1 max-w-72 text-xs leading-relaxed text-text-muted">
              Try “crop”, “background”, “colour”, or a tool family such as “retouch”.
            </div>
            <button
              type="button"
              onClick={() => {
                onQuery("");
                inputRef.current?.focus({ preventScroll: true });
              }}
              className="btn btn-ghost btn-sm mt-4"
            >
              Clear search
            </button>
          </div>
        ) : (
          results.map((tool, index) => {
            const Icon = tool.icon;
            const active = index === activeIndex;
            return (
              <button
                key={tool.id}
                id={`tool-search-option-${index}`}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={-1}
                data-tool-index={index}
                onPointerEnter={() => onActive(index)}
                onClick={() => choose(tool.id)}
                className={`relative grid min-h-14 w-full grid-cols-[2rem_1.25rem_minmax(0,1fr)_auto] items-center gap-2.5 border-x-0 border-t-0 border-b border-border px-4 py-2 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-coral-500 ${
                  active
                    ? "bg-coral-50 dark:bg-[var(--color-accent-soft)]"
                    : "bg-surface hover:bg-page-bg"
                }`}
              >
                <span className="t-mono text-[9px] tabular-nums text-text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  aria-hidden="true"
                  className={active ? "text-coral-600 dark:text-coral-400" : "text-text-muted"}
                >
                  <Icon size={16} />
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-text">
                  {tool.name}
                </span>
                <span className="t-mono shrink-0 text-[9px] tracking-[0.05em] text-text-muted uppercase">
                  {TOOL_GROUP_LABELS[tool.group]}
                </span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[18%] bottom-[18%] left-0 w-[2px] bg-coral-500"
                  />
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="cloak-dialog__footer hidden items-center justify-between px-4 py-2.5 sm:flex">
        <span className="t-mono text-[9px] tracking-[0.05em] text-text-muted uppercase">
          ↑↓ Navigate
        </span>
        <span className="t-mono text-[9px] tracking-[0.05em] text-text-muted uppercase">
          Enter Open
        </span>
        <span className="t-mono text-[9px] tracking-[0.05em] text-text-muted uppercase">
          Esc Close
        </span>
      </div>
    </>
  );
}
