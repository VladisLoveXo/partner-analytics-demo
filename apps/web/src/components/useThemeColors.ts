import { useEffect, useState } from "react";

export interface ThemeColors {
  series: string;
  surface: string;
  grid: string;
  baseline: string;
  muted: string;
}

function read(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string) => style.getPropertyValue(name).trim();
  return {
    series: value("--series-1"),
    surface: value("--surface-card"),
    grid: value("--gridline"),
    baseline: value("--baseline"),
    muted: value("--ink-muted"),
  };
}

/** SVG attributes do not resolve CSS variables reliably, so the chart gets real values and follows the OS theme. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setColors(read());
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return colors;
}
