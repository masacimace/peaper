import { api } from '../../lib/api';
export async function downloadSession(id: string, format: 'json' | 'markdown') {
  const file = await api.exportSession(id, format);
  const url = URL.createObjectURL(new Blob([file.content], { type: file.type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
