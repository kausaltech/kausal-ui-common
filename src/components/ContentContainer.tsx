'use client';

import { forwardRef } from 'react';

import MuiContainer, { type ContainerProps as MuiContainerProps } from '@mui/material/Container';
import { type Breakpoint, type Theme, styled } from '@mui/material/styles';

/*
 * The page content container shared by the apps.
 *
 * Like MUI's `fixed` Container it is capped at each breakpoint's own width, but
 * only from lg, so phones and tablets get the full width. A cap at md (768px)
 * would leave a growing gap towards 1199px.
 */

// The breakpoints at which the container is capped, at the breakpoint's width
const CONTAINER_CAPS = ['lg', 'xl'] as const satisfies readonly Breakpoint[];

export type ContentContainerMaxWidth = (typeof CONTAINER_CAPS)[number];

type ContainerMaxWidthOptions = {
  /** The breakpoint below which the container is full width */
  from?: Breakpoint;
  /** The widest cap */
  upTo?: ContentContainerMaxWidth;
};

/** Media queries capping the container's `max-width` at the breakpoints between `from` and `upTo`. */
export function containerMaxWidthStyles(
  theme: Theme,
  { from, upTo = 'xl' }: ContainerMaxWidthOptions = {}
) {
  const { values } = theme.breakpoints;
  const start = from ? values[from] : 0;
  return Object.fromEntries(
    CONTAINER_CAPS.filter((bp) => values[bp] >= start && values[bp] <= values[upTo]).map((bp) => [
      theme.breakpoints.up(bp),
      { maxWidth: `${values[bp]}${theme.breakpoints.unit}` },
    ])
  );
}

const ContainerRoot = styled(MuiContainer, {
  shouldForwardProp: (prop) => prop !== '$upTo',
})<{ $upTo: ContentContainerMaxWidth }>(({ theme, $upTo }) =>
  containerMaxWidthStyles(theme, { upTo: $upTo })
);

export type ContentContainerProps = Omit<MuiContainerProps, 'maxWidth' | 'fixed'> & {
  /** The widest cap (default `xl`) */
  maxWidth?: ContentContainerMaxWidth;
};

const ContentContainer = forwardRef<HTMLDivElement, ContentContainerProps>(
  function ContentContainer({ maxWidth = 'xl', ...props }, ref) {
    return <ContainerRoot ref={ref} maxWidth={false} $upTo={maxWidth} {...props} />;
  }
);

export default ContentContainer;
