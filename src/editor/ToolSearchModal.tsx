// Shared grouped catalogue for the phone dock, tablet rail and keyboard search.

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
    if (!instant && window.matchMedia?.("(pointer: coarse)").matches) return;
    const frame = window.requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [instant]);

  useEffect(() => {
    setActiveIndex((current) => (current >= results.length ? 0 : current));
  }, [results.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tool-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [activeIndex]);

  return (
    <ModalFrame onClose={onClose} instant={instant} labelledBy="tool-search-title">
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
        <div className="min-w-0">
          <h2 id="tool-search-title" className="cloak-dialog__title">
            Find a tool
          </h2>
          <p
            id="tool-search-count"
            aria-live="polite"
            aria-atomic="true"
            className="tabular-nums text-[0.8125rem] tracking-normal text-text-muted"
          >
            {countLabel}
          </p>
        </div>
        <div className="shrink-0">
          <ModalCloseButton onClose={onClose} label="Close tool search" iconSize={14} />
        </div>
      </div>

      <div className="editor-tool-search-wrap">
        <label className="air-label" htmlFor="editor-tool-search">
          Search editor tools
        </label>
        <div className="air-field-group editor-tool-search">
          <I.Search size={17} className="shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            id="editor-tool-search"
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
            className="air-field"
          />
          <span className="air-field-actions">
            <button
              type="button"
              onClick={() => {
                onQuery("");
                inputRef.current?.focus({ preventScroll: true });
              }}
              aria-label="Clear tool search"
              hidden={!query}
              className="btn btn-ghost btn-icon air-field-clear"
            >
              <I.X size={14} aria-hidden="true" />
            </button>
          </span>
        </div>
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
            <div className="text-sm font-medium text-text">No tool found</div>
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
          [...new Set(results.map((tool) => tool.group))].map((group) => (
            <div key={group} role="group" aria-label={TOOL_GROUP_LABELS[group]}>
              <h3 className="editor-tool-group-title" aria-hidden="true">
                {TOOL_GROUP_LABELS[group]}
              </h3>
              {results
                .filter((tool) => tool.group === group)
                .map((tool) => {
                  const index = results.indexOf(tool);
                  const Icon = tool.icon;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={tool.id}
                      id={`tool-search-option-${index}`}
                      type="button"
                      role="option"
                      aria-label={tool.name}
                      aria-selected={active}
                      tabIndex={-1}
                      data-tool-index={index}
                      onPointerEnter={() => onActive(index)}
                      onClick={() => choose(tool.id)}
                      className="editor-tool-option"
                    >
                      <span aria-hidden="true" className={active ? "text-text" : "text-text-muted"}>
                        <Icon size={16} />
                      </span>
                      <span className="editor-tool-option__name">{tool.name}</span>
                      <span className="editor-tool-option__group">
                        {TOOL_GROUP_LABELS[tool.group]}
                      </span>
                      {active && <span aria-hidden="true" className="editor-tool-option__marker" />}
                    </button>
                  );
                })}
            </div>
          ))
        )}
      </div>

      <div className="cloak-dialog__footer hidden items-center justify-between px-4 py-2.5 sm:flex">
        <span className="tabular-nums text-[0.8125rem] tracking-normal text-text-muted">
          ↑↓ Navigate
        </span>
        <span className="tabular-nums text-[0.8125rem] tracking-normal text-text-muted">
          Enter Open
        </span>
        <span className="tabular-nums text-[0.8125rem] tracking-normal text-text-muted">
          Esc Close
        </span>
      </div>
    </>
  );
}
