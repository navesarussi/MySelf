import Image from "next/image";

type AppLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

export function AppLogo({ size = 32, className = "", priority = false }: AppLogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="MySelf"
      width={size}
      height={size}
      className={`shrink-0 rounded-lg ${className}`}
      priority={priority}
    />
  );
}
