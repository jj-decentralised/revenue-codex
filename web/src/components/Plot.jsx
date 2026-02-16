import Plotly from 'plotly.js-basic-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'

const Plot = createPlotlyComponent(Plotly)

const FONT_SANS = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
const FONT_MONO = 'Consolas, Courier New, monospace'

// Shared layout defaults — editorial / newspaper aesthetic
export const defaultLayout = {
  paper_bgcolor: '#FFFFFF',
  plot_bgcolor: '#FFFFFF',
  font: {
    family: FONT_SANS,
    color: '#1A1A1A',
    size: 12,
  },
  xaxis: {
    gridcolor: '#E5E3E0',
    linecolor: '#E5E3E0',
    zerolinecolor: '#E5E3E0',
    tickfont: { size: 11, color: '#7A7A7A', family: FONT_MONO },
  },
  yaxis: {
    gridcolor: '#E5E3E0',
    linecolor: '#E5E3E0',
    zerolinecolor: '#E5E3E0',
    tickfont: { size: 11, color: '#7A7A7A', family: FONT_MONO },
  },
  margin: { t: 30, r: 20, b: 50, l: 60 },
  hoverlabel: {
    bgcolor: '#FFFFFF',
    bordercolor: '#E5E3E0',
    font: { family: FONT_SANS, size: 12, color: '#1A1A1A' },
  },
  legend: {
    font: { size: 11, color: '#7A7A7A' },
    bgcolor: 'transparent',
  },
}

export const defaultConfig = {
  displayModeBar: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
  responsive: true,
}

// Muted editorial color palette
export const colors = {
  primary: '#2E5E8E',
  secondary: '#6B5B8D',
  success: '#2E7D4F',
  warning: '#B8860B',
  danger: '#C1352D',
  slate: '#64748B',
  indigo: '#4E5BA6',
  cyan: '#1A7F8F',
  rose: '#B5465A',
  amber: '#B8860B',
  emerald: '#2E7D4F',
  palette: [
    '#2E5E8E', '#6B5B8D', '#2E7D4F', '#B8860B', '#C1352D',
    '#1A7F8F', '#B5465A', '#4E5BA6', '#64748B',
  ],
}

export default Plot
