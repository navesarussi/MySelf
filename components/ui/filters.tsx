import type { ReactNode } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { chipClass, inputClass, selectClass } from "./theme";

/** Consistent toolbar container that holds a screen's search / filter controls. */
export function FilterBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`card mb-4 flex flex-col gap-2 p-2.5 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
      {children}
    </div>
  );
}

export type ChipOption = { value: string; label: ReactNode };

/**
 * The single, canonical way to render a discrete filter (project / status /
 * priority / category) anywhere in the app. Pass `hrefFor` for server-driven
 * pages (renders links) or `onChange` for client state (renders buttons).
 */
export function FilterChips({
  options,
  value,
  onChange,
  hrefFor,
  label,
}: {
  options: ChipOption[];
  value: string;
  onChange?: (value: string) => void;
  hrefFor?: (value: string) => string;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {label && <span className="me-0.5 text-xs text-muted">{label}</span>}
      {options.map((opt) => {
        const active = value === opt.value;
        if (hrefFor) {
          return (
            <Link key={opt.value} href={hrefFor(opt.value)} className={chipClass(active)}>
              {opt.label}
            </Link>
          );
        }
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange?.(opt.value)}
            className={chipClass(active)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Search box with a leading icon. Controlled (value/onChange) or uncontrolled (name/defaultValue for forms). */
export function SearchInput({
  value,
  onChange,
  name,
  defaultValue,
  placeholder,
  className = "",
}: {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-[10rem] flex-1 ${className}`}>
      <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={`${inputClass} ps-9`}
      />
    </div>
  );
}

export { selectClass };
