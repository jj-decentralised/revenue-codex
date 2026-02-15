import Plotly from 'plotly.js-basic-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'

const Plot = createPlotlyComponent(Plotly)

// Shared layout defaults for clean white aesthetic
export const defaultLayout = {
  paper_bgcolor: '#FFFFFF',
  plot_bgcolor: '#FFFFFF',
  font: {
    family: 'Inter, system-ui, sans-serif',
    color: '#111827',
    size: 12,
  },
  xaxis: {
    gridcolor: '#F3F4F6',
    linecolor: '#E5E7EB',
    zerolinecolor: '#E5E7EB',
    tickfont: { size: 11, color: '#6B7280' },
  },
  yaxis: {
    gridcolor: '#F3F4F6',
    linecolor: '#E5E7EB',
    zerolinecolor: '#E5E7EB',
    tickfont: { size: 11, color: '#6B7280' },
  },
  margin: { t: 30, r: 20, b: 50, l: 60 },
  hoverlabel: {
    bgcolor: '#FFFFFF',
    bordercolor: '#E5E7EB',
    font: { family: 'Inter, system-ui, sans-serif', size: 12, color: '#111827' },
  },
  legend: {
    font: { size: 11, color: '#6B7280' },
    bgcolor: 'transparent',
  },
}

export const defaultConfig = {
  displayModeBar: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
  responsive: true,
}

// Color palette
export const colors = {
  primary: '#2563EB',
  secondary: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  slate: '#64748B',
  indigo: '#6366F1',
  cyan: '#06B6D4',
  rose: '#F43F5E',
  amber: '#F59E0B',
  emerald: '#10B981',
  palette: ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#F43F5E', '#6366F1', '#64748B'],
}

export default Plot
