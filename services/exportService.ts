export const exportToCSV = (
  filename: string,
  headers: string[],
  rows: (string | number | undefined)[][]
) => {
  const csvContent =
    '\uFEFF' +
    [
      headers.join(','),
      ...rows.map(row =>
        row
          .map(cell => {
            if (cell === undefined || cell === null) {
              return '';
            }
            const value = String(cell).replace(/"/g, '""');
            return `"${value}"`;
          })
          .join(',')
      ),
    ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

