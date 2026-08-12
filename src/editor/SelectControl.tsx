/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5
 * component: select · genre: modern-minimal · theme: DESIGN.md
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 */

import {
  Children,
  Fragment,
  isValidElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { I } from "../components/icons";

type SelectControlState = "default" | "loading" | "error" | "success";
type OpenPreference = "selected" | "first" | "last";

interface SelectControlProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children" | "className" | "multiple" | "size"
> {
  children: ReactNode;
  /** The selected option rendered in CloakIMG's visual shell. */
  displayValue: string;
  /** Optional supporting line for dimensions, format, or selection provenance. */
  detail?: string;
  /** Dense one-line treatment for compact recipe rows. */
  compact?: boolean;
  className?: string;
  state?: SelectControlState;
}

interface ParsedOption {
  index: number;
  value: string;
  label: string;
  group?: string;
  disabled: boolean;
}

interface OptionNodeProps {
  children?: ReactNode;
  disabled?: boolean;
  label?: string;
  value?: string | readonly string[] | number;
}

interface OptionGroup {
  label?: string;
  options: ParsedOption[];
}

interface ListboxPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  originX: number;
  placement: "above" | "below";
  ready: boolean;
}

const LISTBOX_EDGE_GAP = 8;
const LISTBOX_ANCHOR_GAP = 8;
const LISTBOX_MAX_HEIGHT = 320;
const LISTBOX_MIN_WIDTH = 224;

function textFromNode(node: ReactNode): string {
  return Children.toArray(node)
    .map((part) => {
      if (typeof part === "string" || typeof part === "number") return String(part);
      if (isValidElement<OptionNodeProps>(part)) return textFromNode(part.props.children);
      return "";
    })
    .join("")
    .trim();
}

function parseOptions(children: ReactNode): ParsedOption[] {
  const parsed: ParsedOption[] = [];

  const visit = (nodes: ReactNode, group?: string, groupDisabled = false) => {
    Children.forEach(nodes, (node) => {
      if (!isValidElement<OptionNodeProps>(node)) return;

      if (node.type === "option") {
        const label = textFromNode(node.props.children);
        const rawValue = node.props.value;
        const value = Array.isArray(rawValue)
          ? String(rawValue[0] ?? label)
          : String(rawValue ?? label);
        parsed.push({
          index: parsed.length,
          value,
          label,
          group,
          disabled: groupDisabled || !!node.props.disabled,
        });
        return;
      }

      if (node.type === "optgroup") {
        visit(node.props.children, node.props.label, groupDisabled || !!node.props.disabled);
        return;
      }

      if (node.type === Fragment) visit(node.props.children, group, groupDisabled);
    });
  };

  visit(children);
  return parsed;
}

function groupOptions(options: ParsedOption[]): OptionGroup[] {
  return options.reduce<OptionGroup[]>((groups, option) => {
    const current = groups.at(-1);
    if (!current || current.label !== option.group) {
      groups.push({ label: option.group, options: [option] });
    } else {
      current.options.push(option);
    }
    return groups;
  }, []);
}

function stringValue(value: string | readonly string[] | number | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value === undefined ? "" : String(value);
}

function firstEnabledIndex(options: ParsedOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

function lastEnabledIndex(options: ParsedOption[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index;
  }
  return -1;
}

function nextEnabledIndex(
  options: ParsedOption[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) return -1;
  let next = currentIndex;
  for (let attempts = 0; attempts < options.length; attempts += 1) {
    next = (next + direction + options.length) % options.length;
    if (!options[next].disabled) return next;
  }
  return currentIndex;
}

function optionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`;
}

function setNativeSelectValue(select: HTMLSelectElement, nextValue: string) {
  select.value = nextValue;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

interface SelectListboxProps {
  anchor: HTMLButtonElement;
  activeIndex: number;
  animateOpen: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  listboxId: string;
  listboxRef: RefObject<HTMLDivElement | null>;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
  onSelect: (value: string) => void;
  options: ParsedOption[];
  selectedValue: string;
}

function SelectListbox({
  anchor,
  activeIndex,
  animateOpen,
  ariaLabel,
  ariaLabelledBy,
  listboxId,
  listboxRef,
  onActiveIndexChange,
  onClose,
  onSelect,
  options,
  selectedValue,
}: SelectListboxProps) {
  const groups = useMemo(() => groupOptions(options), [options]);
  const alignedInitialOptionRef = useRef(false);
  const [position, setPosition] = useState<ListboxPosition>({
    top: 0,
    left: 0,
    width: LISTBOX_MIN_WIDTH,
    maxHeight: LISTBOX_MAX_HEIGHT,
    originX: LISTBOX_MIN_WIDTH / 2,
    placement: "below",
    ready: false,
  });

  useLayoutEffect(() => {
    const listbox = listboxRef.current;
    if (!listbox) return;

    let openedInTopLayer = false;
    const handlePopoverToggle = (event: Event) => {
      if ((event as Event & { newState?: string }).newState === "closed") onClose();
    };
    listbox.addEventListener("toggle", handlePopoverToggle);
    if (typeof listbox.showPopover === "function") {
      try {
        listbox.showPopover();
        openedInTopLayer = true;
      } catch {
        // Portal + fixed positioning remains the cross-browser fallback.
      }
    }

    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(
        Math.max(rect.width, LISTBOX_MIN_WIDTH),
        Math.max(0, viewportWidth - LISTBOX_EDGE_GAP * 2),
      );
      const left = Math.min(
        Math.max(LISTBOX_EDGE_GAP, rect.left),
        Math.max(LISTBOX_EDGE_GAP, viewportWidth - width - LISTBOX_EDGE_GAP),
      );

      listbox.style.width = `${width}px`;

      const naturalHeight = Math.min(listbox.scrollHeight, LISTBOX_MAX_HEIGHT);
      const roomBelow = viewportHeight - rect.bottom - LISTBOX_ANCHOR_GAP - LISTBOX_EDGE_GAP;
      const roomAbove = rect.top - LISTBOX_ANCHOR_GAP - LISTBOX_EDGE_GAP;
      const placement =
        roomBelow >= Math.min(naturalHeight, 160) || roomBelow >= roomAbove ? "below" : "above";
      const availableHeight = placement === "below" ? roomBelow : roomAbove;
      const maxHeight = Math.max(48, Math.min(LISTBOX_MAX_HEIGHT, availableHeight));
      const renderedHeight = Math.min(listbox.scrollHeight, maxHeight);
      const top =
        placement === "below"
          ? Math.min(
              rect.bottom + LISTBOX_ANCHOR_GAP,
              viewportHeight - renderedHeight - LISTBOX_EDGE_GAP,
            )
          : Math.max(LISTBOX_EDGE_GAP, rect.top - renderedHeight - LISTBOX_ANCHOR_GAP);
      const originX = Math.min(width, Math.max(0, rect.left + rect.width / 2 - left));

      setPosition((current) => {
        const next = {
          top: Math.round(top),
          left: Math.round(left),
          width: Math.round(width),
          maxHeight: Math.round(maxHeight),
          originX: Math.round(originX),
          placement,
          ready: true,
        } satisfies ListboxPosition;
        return current.top === next.top &&
          current.left === next.left &&
          current.width === next.width &&
          current.maxHeight === next.maxHeight &&
          current.originX === next.originX &&
          current.placement === next.placement &&
          current.ready
          ? current
          : next;
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    resizeObserver?.observe(anchor);
    resizeObserver?.observe(listbox);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver?.disconnect();
      listbox.removeEventListener("toggle", handlePopoverToggle);
      if (openedInTopLayer && typeof listbox.hidePopover === "function") {
        try {
          listbox.hidePopover();
        } catch {
          // It may already be closed during unmount.
        }
      }
    };
  }, [anchor, listboxRef, onClose]);

  useLayoutEffect(() => {
    if (activeIndex < 0 || !position.ready) return;
    const listbox = listboxRef.current;
    const active = listbox?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    if (!listbox || !active) return;

    if (!alignedInitialOptionRef.current) {
      const group = active.closest<HTMLElement>(".select-control__group");
      const groupOptions = group
        ? Array.from(group.querySelectorAll<HTMLElement>(".select-control__option"))
        : [active];
      const activePosition = Math.max(0, groupOptions.indexOf(active));
      const contextOption = groupOptions[Math.max(0, activePosition - 2)] ?? active;
      const groupLabel = group?.querySelector<HTMLElement>(".select-control__group-label");
      const listboxRect = listbox.getBoundingClientRect();
      const contextRect = contextOption.getBoundingClientRect();
      const paddingTop = Number.parseFloat(getComputedStyle(listbox).paddingTop) || 0;
      const desiredTop = listboxRect.top + paddingTop + (groupLabel?.offsetHeight ?? 0);
      listbox.scrollTop += contextRect.top - desiredTop;
    }

    active.scrollIntoView?.({ block: "nearest" });
    alignedInitialOptionRef.current = true;
  }, [activeIndex, listboxRef, position.maxHeight, position.ready]);

  return createPortal(
    <div
      ref={listboxRef}
      id={listboxId}
      role="listbox"
      aria-label={ariaLabel ? `${ariaLabel} options` : ariaLabelledBy ? undefined : "Options"}
      aria-labelledby={ariaLabel ? undefined : ariaLabelledBy}
      className="ci-popover-surface select-control__listbox scroll-thin"
      data-animate={animateOpen}
      data-placement={position.placement}
      data-ready={position.ready}
      popover="manual"
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        transformOrigin: `${position.originX}px ${position.placement === "above" ? "100%" : "0"}`,
      }}
    >
      {groups.map((group, groupIndex) => {
        const groupLabelId = group.label ? `${listboxId}-group-${groupIndex}` : undefined;
        return (
          <div
            key={`${group.label ?? "options"}-${group.options[0]?.index ?? groupIndex}`}
            role={group.label ? "group" : "presentation"}
            aria-labelledby={groupLabelId}
            className="select-control__group"
          >
            {group.label ? (
              <div id={groupLabelId} className="select-control__group-label">
                {group.label}
              </div>
            ) : null}
            {group.options.map((option) => {
              const selected = option.value === selectedValue;
              const active = option.index === activeIndex;
              return (
                <div
                  key={`${option.value}-${option.index}`}
                  id={optionId(listboxId, option.index)}
                  role="option"
                  aria-disabled={option.disabled || undefined}
                  aria-selected={selected}
                  className="select-control__option"
                  data-active={active || undefined}
                  data-option-index={option.index}
                  data-selected={selected || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerMove={() => {
                    if (!option.disabled) onActiveIndexChange(option.index);
                  }}
                  onClick={() => {
                    if (!option.disabled) onSelect(option.value);
                  }}
                >
                  <span className="select-control__option-label">{option.label}</span>
                  <span className="select-control__option-marker" aria-hidden="true">
                    {selected ? <I.Check size={14} stroke={2.5} /> : null}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

/**
 * CloakIMG's select-only combobox. A hidden native select preserves form
 * submission and the existing onChange contract; the button + portalled
 * listbox provide a consistent, unclipped menu across every viewport.
 */
export function SelectControl({
  children,
  displayValue,
  detail,
  compact = false,
  className = "",
  state = "default",
  disabled,
  value,
  defaultValue,
  onChange,
  id,
  autoFocus,
  tabIndex,
  title,
  required,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-busy": ariaBusy,
  ...selectProps
}: SelectControlProps) {
  const options = useMemo(() => parseOptions(children), [children]);
  const generatedId = useId();
  const triggerId = id ?? `${generatedId}-trigger`;
  const nativeId = `${triggerId}-native`;
  const listboxId = `${generatedId}-listbox`;
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(() =>
    stringValue(defaultValue === undefined ? options[0]?.value : defaultValue),
  );
  const selectedValue = controlled ? stringValue(value) : uncontrolledValue;
  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const initialActiveIndex =
    selectedIndex >= 0 && !options[selectedIndex].disabled
      ? selectedIndex
      : firstEnabledIndex(options);
  const [open, setOpen] = useState(false);
  const [animateOpen, setAnimateOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(initialActiveIndex);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef<{ query: string; timeout: number | null }>({
    query: "",
    timeout: null,
  });
  const loading = state === "loading";
  const effectiveDisabled = !!disabled || loading;
  const isOpen = open && !effectiveDisabled && options.length > 0;
  const effectiveInvalid = state === "error" ? true : ariaInvalid;
  const effectiveBusy = loading ? true : ariaBusy;

  const clearTypeahead = useCallback(() => {
    if (typeaheadRef.current.timeout !== null) {
      window.clearTimeout(typeaheadRef.current.timeout);
    }
    typeaheadRef.current = { query: "", timeout: null };
  }, []);

  useEffect(() => clearTypeahead, [clearTypeahead]);

  const closeList = useCallback(
    (restoreFocus = false) => {
      setOpen(false);
      clearTypeahead();
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
    },
    [clearTypeahead],
  );

  const preferredIndex = useCallback(
    (preference: OpenPreference) => {
      if (preference === "first") return firstEnabledIndex(options);
      if (preference === "last") return lastEnabledIndex(options);
      return initialActiveIndex;
    },
    [initialActiveIndex, options],
  );

  const openList = useCallback(
    (preference: OpenPreference = "selected", animate = true) => {
      if (effectiveDisabled || options.length === 0) return;
      setActiveIndex(preferredIndex(preference));
      setAnimateOpen(animate);
      setOpen(true);
    },
    [effectiveDisabled, options.length, preferredIndex],
  );

  const handlePopoverClose = useCallback(() => closeList(true), [closeList]);

  const selectValue = useCallback(
    (nextValue: string) => {
      const native = nativeRef.current;
      if (!native) return;
      if (!controlled) setUncontrolledValue(nextValue);
      setNativeSelectValue(native, nextValue);
      closeList(true);
    },
    [closeList, controlled],
  );

  const runTypeahead = useCallback(
    (character: string) => {
      const lowerCharacter = character.toLocaleLowerCase();
      const previous = typeaheadRef.current.query;
      const combined = `${previous}${lowerCharacter}`;
      const repeatedCharacter = combined.split("").every((entry) => entry === lowerCharacter);
      const query = repeatedCharacter ? lowerCharacter : combined;
      const start = activeIndex >= 0 ? activeIndex : initialActiveIndex;
      const ordered = options.map((_, offset) => (start + offset + 1) % options.length);
      const match = ordered.find(
        (index) =>
          !options[index].disabled && options[index].label.toLocaleLowerCase().startsWith(query),
      );
      if (match !== undefined) setActiveIndex(match);
      if (!isOpen) {
        setAnimateOpen(false);
        setOpen(true);
      }

      if (typeaheadRef.current.timeout !== null) {
        window.clearTimeout(typeaheadRef.current.timeout);
      }
      typeaheadRef.current = {
        query,
        timeout: window.setTimeout(clearTypeahead, 650),
      };
    },
    [activeIndex, clearTypeahead, initialActiveIndex, isOpen, options],
  );

  const handleTriggerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (effectiveDisabled) return;

      if (!isOpen) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
          event.preventDefault();
          openList("selected", false);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          openList("last", false);
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          openList(event.key === "Home" ? "first" : "last", false);
          return;
        }
      } else {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((current) =>
            nextEnabledIndex(options, current, event.key === "ArrowDown" ? 1 : -1),
          );
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          setActiveIndex(
            event.key === "Home" ? firstEnabledIndex(options) : lastEnabledIndex(options),
          );
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const option = options[activeIndex];
          if (option && !option.disabled) selectValue(option.value);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeList(true);
          return;
        }
        if (event.key === "Tab") {
          closeList();
          return;
        }
      }

      if (
        event.key.length === 1 &&
        event.key !== " " &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        runTypeahead(event.key);
      }
    },
    [
      activeIndex,
      closeList,
      effectiveDisabled,
      isOpen,
      openList,
      options,
      runTypeahead,
      selectValue,
    ],
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listboxRef.current?.contains(target)) return;
      closeList();
    };
    const handleWindowBlur = () => closeList();

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [closeList, isOpen]);

  return (
    <span
      className={`select-control ${compact ? "select-control--compact" : ""} ${className}`}
      data-open={isOpen}
      data-state={effectiveDisabled ? "disabled" : state}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-activedescendant={
          isOpen && activeIndex >= 0 ? optionId(listboxId, activeIndex) : undefined
        }
        aria-busy={effectiveBusy}
        aria-controls={listboxId}
        aria-describedby={ariaDescribedBy}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={effectiveInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-required={required || undefined}
        autoFocus={autoFocus}
        className="select-control__trigger"
        disabled={effectiveDisabled}
        tabIndex={tabIndex}
        title={title}
        onClick={() => (isOpen ? closeList() : openList())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="select-control__content" aria-hidden="true">
          <span className="select-control__value" title={displayValue}>
            {loading ? "Loading…" : displayValue}
          </span>
          {!compact && detail ? <span className="select-control__detail">{detail}</span> : null}
        </span>
        <span className="select-control__indicator" aria-hidden="true">
          {state === "success" ? (
            <I.Check size={14} stroke={2.5} />
          ) : state === "error" ? (
            <I.AlertTriangle size={14} />
          ) : loading ? (
            <span className="select-control__spinner" />
          ) : (
            <I.ChevronDown size={15} stroke={2.25} />
          )}
        </span>
      </button>
      <select
        {...selectProps}
        ref={nativeRef}
        id={nativeId}
        value={value}
        defaultValue={defaultValue}
        disabled={effectiveDisabled}
        required={required}
        aria-busy={effectiveBusy}
        aria-hidden="true"
        aria-invalid={effectiveInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className="select-control__native"
        tabIndex={-1}
        onChange={(event) => {
          if (!controlled) setUncontrolledValue(event.currentTarget.value);
          onChange?.(event);
        }}
      >
        {children}
      </select>
      {isOpen && triggerRef.current ? (
        <SelectListbox
          anchor={triggerRef.current}
          activeIndex={activeIndex}
          animateOpen={animateOpen}
          ariaLabel={ariaLabel}
          ariaLabelledBy={ariaLabelledBy}
          listboxId={listboxId}
          listboxRef={listboxRef}
          onActiveIndexChange={setActiveIndex}
          onClose={handlePopoverClose}
          onSelect={selectValue}
          options={options}
          selectedValue={selectedValue}
        />
      ) : null}
    </span>
  );
}
