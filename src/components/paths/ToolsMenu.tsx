import { type RefObject, useState } from 'react';

import {
  Alert,
  IconButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Snackbar,
} from '@mui/material';

import { kebabCase } from 'lodash-es';
import { FiletypeCsv, FiletypePng, FiletypeXls, ThreeDotsVertical } from 'react-bootstrap-icons';

import type { ChartHandle } from '@common/components/Chart';
import styled from '@common/themes/styled';
import { type ParsedMetric, type SliceConfig, downloadData } from '@common/utils/paths/metric';

const Tools = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  text-align: right;
  .btn-link {
    text-decoration: none;
  }
  .icon {
    width: 1.25rem !important;
    height: 1.25rem !important;
    vertical-align: -0.2rem;
  }
`;

/** Translated labels of the tools menu */
export type ToolsMenuLabels = {
  /** "Download", the menu's name */
  downloadData: string;
  /** Shown when the chart image could not be created */
  downloadError: string;
};

const downloadChartAsPng = (dataUrl: string, filename: string) => {
  const safeName = kebabCase(filename) || 'chart';
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `${safeName}.png`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

type ToolsMenuProps = {
  cube: ParsedMetric;
  sliceConfig: SliceConfig;
  chartRef: RefObject<ChartHandle | null>;
  pngFilename: string;
  /** As in `sliceBy`; the download follows the chart */
  filterZero: boolean;
  labels: ToolsMenuLabels;
};

/** Downloads of a node chart: its data as XLS or CSV, and the chart as PNG */
export default function ToolsMenu({
  cube,
  sliceConfig,
  chartRef,
  pngFilename,
  filterZero,
  labels,
}: ToolsMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const open = Boolean(anchorEl);

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDownload = (format: 'xlsx' | 'csv') => {
    void downloadData(cube, sliceConfig, format, { filterZero });
    handleClose();
  };

  const handleDownloadPng = () => {
    const dataUrl = chartRef.current?.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#fff',
    });
    if (dataUrl) {
      downloadChartAsPng(dataUrl, pngFilename);
    } else {
      setErrorMessage(labels.downloadError);
    }
    handleClose();
  };

  return (
    <Tools>
      <IconButton
        id="tools-button"
        aria-controls={open ? 'tools-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        aria-label={labels.downloadData}
      >
        <ThreeDotsVertical />
      </IconButton>
      <Menu
        id="tools-menu"
        anchorEl={anchorEl}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={open}
        onClose={handleClose}
        slotProps={{ list: { 'aria-labelledby': 'tools-button' } }}
      >
        <ListSubheader>{` ${labels.downloadData}`}</ListSubheader>
        <MenuItem onClick={() => handleDownload('xlsx')}>
          <ListItemIcon>
            <FiletypeXls />
          </ListItemIcon>
          <ListItemText>XLS</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleDownload('csv')}>
          <ListItemIcon>
            <FiletypeCsv />
          </ListItemIcon>
          <ListItemText>CSV</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDownloadPng}>
          <ListItemIcon>
            <FiletypePng />
          </ListItemIcon>
          <ListItemText>PNG</ListItemText>
        </MenuItem>
      </Menu>
      <Snackbar
        open={errorMessage !== null}
        autoHideDuration={4000}
        onClose={() => setErrorMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </Tools>
  );
}
