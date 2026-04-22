import type { CSSProperties } from "react";

import { burnerTagline } from "../lib/brand";
import { BurnerMark } from "./burner-mark";

type BurnerLogoProps = {
  className?: string;
  iconSize?: number;
  scale?: number;
};

export function BurnerLogo({
  className,
  iconSize = 44,
  scale = 1,
}: BurnerLogoProps) {
  const classes = ["burner-logo", className].filter(Boolean).join(" ");
  const style = { "--burner-logo-scale": scale } as CSSProperties;

  return (
    <div aria-label="Burner logo" className={classes} role="img" style={style}>
      <BurnerMark className="burner-logo__mark" size={iconSize} />
      <div className="burner-logo__lockup">
        <span className="burner-logo__wordmark">Burner</span>
        <span className="burner-logo__tagline">{burnerTagline}</span>
      </div>
    </div>
  );
}
