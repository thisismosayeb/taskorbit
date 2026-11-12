// next-themes provider (Part 3, §6).
//
// Mounted once in the root layout. `attribute="class"` makes next-themes
// toggle the `dark` class on <html>, which is what Tailwind's
// `darkMode: "class"` and the `.dark` CSS variables in globals.css key
// off. The inline script next-themes injects applies the stored/system
// theme before first paint, so there is no flash of the wrong theme.
// `defaultTheme` comes from the server (profile `theme_preference` when
// known, else "system"); a stored local choice always wins over it.

"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  defaultTheme = "system",
}: {
  children: React.ReactNode;
  defaultTheme?: "light" | "dark" | "system";
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange
      storageKey="taskorbit-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
