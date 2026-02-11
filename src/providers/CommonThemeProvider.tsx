'use client';

import React, { type ReactNode, createContext, useContext } from 'react';

import type { Theme as BaseTheme } from '@kausal/themes/types';

interface ThemeContextValue {
  theme: BaseTheme;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  theme: BaseTheme;
}

/**
 * Provider to use the base theme in common components. This is required as long as we use
 * different styling libraries in the same project. Currently Kausal Watch uses styled-components
 * and Kausal Paths uses emotion.
 *
 * TODO: Remove this component and used providers when Watch migrates to emotion. At that time,
 * we can use the theme provider directly from @emotion/react.
 */
export function CommonThemeProvider({ children, theme }: ThemeProviderProps) {
  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
}

export function useBaseTheme() {
  const context = useContext(ThemeContext);

  if (!context?.theme) {
    throw new Error('useBaseTheme must be used within a CommonThemeProvider');
  }

  return context.theme;
}
