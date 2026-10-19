// Select the saved palette before the first paint. CSS owns all color values.
try {
  const theme = localStorage.getItem('peaper:theme');
  document.documentElement.dataset.theme = ['ink', 'mono', 'midnight', 'paper', 'linen'].includes(
    theme,
  )
    ? theme
    : 'ink';
} catch {
  document.documentElement.dataset.theme = 'ink';
}
