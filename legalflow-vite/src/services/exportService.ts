export const exportToCSV = (filename: string, headers: string[], rows: (string | number | undefined)[][]) => {
  const sanitizedRows = rows.map(row =>
    row.map(cell => {
      if (cell === undefined || cell === null) return '';
      const cellStr = cell.toString();
      return cellStr.includes(',') ? `"${cellStr.replace(/"/g, '""')}"` : cellStr;
    })
  );

  const csvContent =
    '\uFEFF' +
    [headers.join(','), ...sanitizedRows.map(row => row.join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

