import { useId } from "react";

type BurnerMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

export function BurnerMark({
  size = 28,
  className,
  title = "Burner logo",
}: BurnerMarkProps) {
  const id = useId();

  return (
    <svg
      aria-label={title}
      className={className}
      height={size}
      role="img"
      viewBox="0 0 72 72"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={`${id}-flame`} x1="20%" x2="72%" y1="8%" y2="94%">
          <stop offset="0%" stopColor="#ffca54" />
          <stop offset="35%" stopColor="#ff8d2d" />
          <stop offset="72%" stopColor="#f1441c" />
          <stop offset="100%" stopColor="#b91409" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="24%" x2="74%" y1="12%" y2="88%">
          <stop offset="0%" stopColor="#fff6d8" />
          <stop offset="32%" stopColor="#ffb244" />
          <stop offset="100%" stopColor="#ef4a1c" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0%" x2="100%" y1="8%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.94" />
          <stop offset="100%" stopColor="#ffe7cd" stopOpacity="0.2" />
        </linearGradient>
        <filter
          id={`${id}-shadow`}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feDropShadow
            dx="0"
            dy="2.2"
            floodColor="#5b0904"
            floodOpacity="0.3"
            stdDeviation="2.4"
          />
        </filter>
      </defs>
      <path
        d="M40 4 C49 10 56 20 58 31 C60 40 58 49 53 56 C48 63 39 68 29 68 C20 68 11 63 8 55 C5 48 7 39 13 31 C16 27 20 23 23 20 C23 31 28 39 37 44 C34 36 34 25 36 16 C36.8 11.4 38.2 7.4 40 4 Z"
        fill={`url(#${id}-flame)`}
        filter={`url(#${id}-shadow)`}
      />
      <path
        d="M39 16 C44 21 48 29 48 37 C48 46 41 54 31 56 C24 58 16 54 14 46 C12 38 16 31 22 26 C22 34 25 41 31 45 C28 39 29 30 32 23 C33.6 19.6 36 17 39 16 Z"
        fill={`url(#${id}-inner)`}
      />
      <path
        d="M41 10 C48 16 52 25 53 34"
        stroke={`url(#${id}-edge)`}
        strokeLinecap="round"
        strokeWidth="3.4"
      />
      <path
        d="M30 23 C29 29 31 36 35 41"
        stroke={`url(#${id}-edge)`}
        strokeLinecap="round"
        strokeWidth="2.3"
        opacity="0.84"
      />
      <path
        d="M40 4 C49 10 56 20 58 31 C60 40 58 49 53 56 C48 63 39 68 29 68 C20 68 11 63 8 55 C5 48 7 39 13 31 C16 27 20 23 23 20"
        stroke="#fff2df"
        strokeOpacity="0.74"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
