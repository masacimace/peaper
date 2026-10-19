import { useSyncExternalStore } from 'react';
import { normalizeTheme, themeStorageKey, type ThemeId } from './themes';

const listeners = new Set<() => void>();
function readSavedTheme() {
  try {
    return normalizeTheme(localStorage.getItem(themeStorageKey));
  } catch {
    return normalizeTheme(document.documentElement.dataset.theme);
  }
}
function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  const canvas = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', canvas);
  for (const listener of listeners) listener();
}
export function initializeTheme() {
  applyTheme(readSavedTheme());
}
export function setTheme(id: ThemeId) {
  const next = normalizeTheme(id);
  try {
    localStorage.setItem(themeStorageKey, next);
  } catch {
    // Theme switching still works when browser storage is unavailable.
  }
  applyTheme(next);
}
function onStorage(event: StorageEvent) {
  if (event.key === themeStorageKey || event.key === null) applyTheme(readSavedTheme());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
}
function snapshot() {
  return normalizeTheme(document.documentElement.dataset.theme);
}
export function useTheme() {
  return useSyncExternalStore(subscribe, snapshot);
}
