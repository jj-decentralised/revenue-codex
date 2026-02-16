/**
 * Download data as a CSV file.
 * @param {string} filename - File name (without .csv extension)
 * @param {string[]} headers - Column headers
 * @param {Array<Array<string|number>>} rows - Row data
 */
export function downloadCSV(filename, headers, rows) {
  const escape = (val) => {
    if (val === null || val === undefined) return ''
    const s = String(val)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const csv = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
