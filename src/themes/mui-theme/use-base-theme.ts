import { useTheme as useMuiTheme } from '@mui/material';

import type { Theme } from '@kausal/themes/types';

export function useBaseTheme() {
  const muiTheme = useMuiTheme();

  return muiTheme as unknown as Theme;
}
