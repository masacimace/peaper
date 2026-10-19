import { Check } from 'lucide-react';
import { themes } from './themes';
import { setTheme, useTheme } from './useTheme';

export function ThemePicker() {
  const selected = useTheme();
  const active = themes.find((theme) => theme.id === selected)!;
  return (
    <div className="theme-settings">
      <div className="theme-setting-heading">
        <span>Color scheme</span>
        <span className="setting-value" role="status">
          {active.name}
        </span>
      </div>
      <fieldset className="theme-picker">
        <legend className="sr-only">Color scheme</legend>
        {themes.map((theme) => (
          <label className="theme-choice" key={theme.id}>
            <input
              className="sr-only"
              type="radio"
              name="color-scheme"
              value={theme.id}
              aria-label={theme.name}
              checked={selected === theme.id}
              onChange={() => setTheme(theme.id)}
            />
            <span className="theme-choice-body">
              <span className="theme-sample" data-theme-preview={theme.id} aria-hidden="true">
                <span className="theme-sample-nav" />
                <span className="theme-sample-agent">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-sample-work">
                  <i />
                  <i />
                  <i />
                  <span />
                </span>
                <span className="theme-sample-files">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </span>
              <span className="theme-choice-name">
                <strong>{theme.name}</strong>
                {selected === theme.id && <Check size={13} aria-hidden="true" />}
              </span>
              <small>
                {theme.mode === 'dark' ? 'Dark' : 'Light'} · {theme.description}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="theme-setting-note">
        Saved in this browser. Applies to Peaper, the editor, and the terminal. Preview pages keep
        their own appearance.
      </p>
    </div>
  );
}
