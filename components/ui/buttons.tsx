import { ReactNode } from "react";
import { actionButton } from "./theme";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function PrimaryActionButton({
  children,
  fullWidth = false,
  className = "",
  type = "submit",
  ...props
}: ButtonProps & { fullWidth?: boolean; children: ReactNode }) {
  return (
    <button
      type={type}
      className={`${fullWidth ? actionButton.primaryFull : actionButton.primary} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function WarnActionButton({
  children,
  fullWidth = false,
  className = "",
  type = "submit",
  ...props
}: ButtonProps & { fullWidth?: boolean; children: ReactNode }) {
  return (
    <button
      type={type}
      className={`${fullWidth ? actionButton.warnFull : actionButton.warn} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconEditButton({ title, className = "", ...props }: ButtonProps & { title: string }) {
  return (
    <button
      type="button"
      title={title}
      className={`${actionButton.iconEdit} ${className}`.trim()}
      {...props}
    />
  );
}

export function IconDeleteButton({ title, className = "", ...props }: ButtonProps & { title: string }) {
  return (
    <button
      type="button"
      title={title}
      className={`${actionButton.iconDelete} ${className}`.trim()}
      {...props}
    />
  );
}
