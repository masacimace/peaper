export function normalizePreviewUrl(input: string, peaperOrigin: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Enter a complete local URL, for example http://localhost:3000.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
    throw new Error('Choose a local http(s) address on localhost or 127.0.0.1.');
  if (url.username || url.password)
    throw new Error('Use a local URL without embedded credentials.');
  const current = new URL(peaperOrigin);
  if (url.protocol === current.protocol && url.port === current.port)
    throw new Error('This is Peaper’s port. Use the address of your app’s dev server.');
  if (url.href.length > 2048) throw new Error('This URL is too long.');
  return url.href;
}
