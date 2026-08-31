import type { CSSProperties } from "react";
import Link from "next/link";

import { burnerTagline } from "../lib/brand";
import { BurnerMark } from "./burner-mark";

type BurnerLogoProps = {
  className?: string;
  href?: string;
  iconSize?: number;
  scale?: number;
};

export function BurnerLogo({
  className,
  href,
  iconSize = 44,
  scale = 1,
}: BurnerLogoProps) {
  const classes = ["burner-logo", className].filter(Boolean).join(" ");
  const style = { "--burner-logo-scale": scale } as CSSProperties;

  const mark = (
    <>
      <BurnerMark className="burner-logo__mark" size={iconSize} />
      <div className="burner-logo__lockup">
        <span className="burner-logo__wordmark">Burner</span>
        <span className="burner-logo__tagline">{burnerTagline}</span>
      </div>
    </>
  );

  if (href) {
    return (
      <Link aria-label="Burner home" className={classes} href={href} style={style}>
        {mark}
      </Link>
    );
  }

  return (
    <div aria-label="Burner logo" className={classes} role="img" style={style}>
      {mark}
    </div>
  );
}
