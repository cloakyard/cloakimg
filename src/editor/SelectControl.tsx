/** Air select adapter. Base UI owns navigation, focus and collision handling. */
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Select } from "@base-ui/react/select";
import { I } from "../components/icons";
interface SelectControlProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children" | "className" | "multiple" | "size"
> {
  children: ReactNode;
  displayValue: string;
  detail?: string;
  compact?: boolean;
  className?: string;
  state?: "default" | "loading" | "error" | "success";
  readOnly?: boolean;
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

export function SelectControl({
  children,
  displayValue,
  detail,
  compact = false,
  className = "",
  state = "default",
  value,
  defaultValue,
  disabled,
  readOnly = false,
  onChange,
  id,
  autoFocus,
  tabIndex,
  title,
  required,
  ...nativeProps
}: SelectControlProps) {
  const generated = useId(),
    triggerId = id ?? generated;
  const native = useRef<HTMLSelectElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => parseOptions(children), [children]);
  const groups = useMemo(() => groupOptions(options), [options]);
  const [local, setLocal] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const selected = value === undefined ? local : String(value);
  const [open, setOpen] = useState(false);
  const loading = state === "loading",
    unavailable = disabled || loading;
  useEffect(() => {
    const form = native.current?.form;
    if (!form) return;
    const reset = () =>
      queueMicrotask(() => {
        if (value === undefined) setLocal(native.current?.value ?? "");
      });
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [value]);
  return (
    <span
      className={`select-control ${compact ? "select-control--compact" : ""} ${className}`}
      data-state={unavailable ? "disabled" : state}
      data-open={open}
    >
      <Select.Root
        value={selected}
        items={options}
        open={open}
        onOpenChange={setOpen}
        disabled={unavailable}
        readOnly={readOnly}
        highlightItemOnHover={false}
        onValueChange={(next) => {
          if (next === null || !native.current) return;
          native.current.value = next;
          native.current.dispatchEvent(new Event("change", { bubbles: true }));
        }}
      >
        <Select.Trigger
          ref={trigger}
          id={triggerId}
          className="air-field air-select-trigger select-control__trigger"
          autoFocus={autoFocus}
          tabIndex={tabIndex}
          title={title}
          aria-label={nativeProps["aria-label"]}
          aria-labelledby={nativeProps["aria-labelledby"]}
          aria-describedby={nativeProps["aria-describedby"]}
          aria-required={required || undefined}
          aria-invalid={state === "error" || nativeProps["aria-invalid"] || undefined}
          aria-busy={loading || undefined}
        >
          <span className="select-control__content">
            <span className="select-control__value">{loading ? "Loading…" : displayValue}</span>
            {!compact && detail && <span className="select-control__detail">{detail}</span>}
          </span>
          <Select.Icon className="air-select-icon" aria-hidden="true">
            {state === "success" ? (
              <I.Check size={16} />
            ) : state === "error" ? (
              <I.AlertTriangle size={16} />
            ) : (
              <I.ChevronDown size={16} />
            )}
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            className="air-floating-positioner"
            sideOffset={8}
            collisionPadding={16}
            positionMethod="fixed"
            align="start"
            alignItemWithTrigger={false}
          >
            <Select.Popup
              className="air-menu air-select-popup"
              aria-label={
                nativeProps["aria-label"] ? `${nativeProps["aria-label"]} options` : undefined
              }
              aria-labelledby={nativeProps["aria-labelledby"]}
            >
              <Select.List
                aria-label={
                  nativeProps["aria-label"] ? `${nativeProps["aria-label"]} options` : undefined
                }
                aria-labelledby={nativeProps["aria-labelledby"]}
              >
                {groups.map((group, i) => (
                  <Select.Group key={group.label ?? i}>
                    {group.label && (
                      <Select.GroupLabel className="air-menu-label">
                        {group.label}
                      </Select.GroupLabel>
                    )}
                    {group.options.map((option) => (
                      <Select.Item
                        className="air-menu-item"
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                      >
                        <Select.ItemText>{option.label}</Select.ItemText>
                        <Select.ItemIndicator className="air-menu-check">
                          <I.Check size={16} aria-hidden="true" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Group>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      <select
        {...nativeProps}
        ref={native}
        id={`${triggerId}-native`}
        className="select-control__native"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        defaultValue={defaultValue}
        disabled={unavailable}
        required={required}
        onInvalid={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
        onChange={(event) => {
          if (readOnly) return;
          if (value === undefined) setLocal(event.currentTarget.value);
          onChange?.(event);
        }}
      >
        {children}
      </select>
    </span>
  );
}
