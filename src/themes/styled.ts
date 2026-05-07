/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { Theme } from '@mui/material';
import { styled as materialStyled } from '@mui/material/styles';
import type { CreateStyledComponent } from '@mui/styled-engine';
import type { MUIStyledCommonProps } from '@mui/system';

/**
 * Mapped type that adds `.div`, `.span`, etc. tag accessors
 * mirroring Emotion's `styled.div` syntax on top of MUI's styled().
 */
type StyledTags = {
  [Tag in keyof React.JSX.IntrinsicElements]: CreateStyledComponent<
    MUIStyledCommonProps<Theme>,
    React.JSX.IntrinsicElements[Tag],
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {},
    Theme
  >;
};

type StyledFunc = typeof materialStyled & StyledTags;

/**
 * Drop-in replacement for `@emotion/styled` that delegates to MUI's styled().
 *
 * Supports both:
 *   styled('div')`...`        — MUI syntax
 *   styled.div`...`           — Emotion syntax (via Proxy)
 */
const styled: StyledFunc = new Proxy(materialStyled as unknown as StyledFunc, {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop, receiver);
    }
    if (typeof prop === 'string') {
      return materialStyled(prop as keyof React.JSX.IntrinsicElements);
    }
    return undefined;
  },
});

export default styled;
