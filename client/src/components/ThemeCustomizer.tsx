import type { ColorGroup } from '@capitalloop/shared';
import type { ThemeConfig, ThemeMode } from '../types/theme';

interface ThemeCustomizerProps {
  theme: ThemeConfig;
  onSetMode: (mode: ThemeMode) => void;
  onUpdateField: (
    field: 'mainBg' | 'surfaceBg' | 'boardBg' | 'accentColor' | 'buttonColor',
    value: string,
  ) => void;
  onUpdateGroupColor: (group: ColorGroup, value: string) => void;
  onReset: () => void;
}

const GROUP_LABELS: { key: ColorGroup; label: string }[] = [
  { key: 'brown', label: 'Brazil' },
  { key: 'lightBlue', label: 'Italy' },
  { key: 'pink', label: 'Germany' },
  { key: 'orange', label: 'India' },
  { key: 'red', label: 'Japan' },
  { key: 'yellow', label: 'France' },
  { key: 'green', label: 'United Kingdom' },
  { key: 'darkBlue', label: 'USA' },
];

export function ThemeCustomizer({
  theme,
  onSetMode,
  onUpdateField,
  onUpdateGroupColor,
  onReset,
}: ThemeCustomizerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className={`btn ${theme.mode === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1 }}
          onClick={() => onSetMode('dark')}
        >
          Dark Theme
        </button>
        <button
          type="button"
          className={`btn ${theme.mode === 'light' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1 }}
          onClick={() => onSetMode('light')}
        >
          Light Theme
        </button>
      </div>

      <div>
        <div className="setting-label" style={{ marginBottom: 8 }}>
          Interface &amp; Board Colors
        </div>
        <div className="settings-grid">
          <ColorPickerRow
            label="Main Background"
            value={theme.mainBg}
            onChange={(v) => onUpdateField('mainBg', v)}
          />
          <ColorPickerRow
            label="Panel Surface"
            value={theme.surfaceBg}
            onChange={(v) => onUpdateField('surfaceBg', v)}
          />
          <ColorPickerRow
            label="Board Background"
            value={theme.boardBg}
            onChange={(v) => onUpdateField('boardBg', v)}
          />
          <ColorPickerRow
            label="Accent Color"
            value={theme.accentColor}
            onChange={(v) => onUpdateField('accentColor', v)}
          />
          <ColorPickerRow
            label="Primary Buttons"
            value={theme.buttonColor}
            onChange={(v) => onUpdateField('buttonColor', v)}
          />
        </div>
      </div>

      <div>
        <div className="setting-label" style={{ marginBottom: 8 }}>
          Country Group Colors
        </div>
        <div className="settings-grid">
          {GROUP_LABELS.map((group) => (
            <ColorPickerRow
              key={group.key}
              label={group.label}
              value={theme.groupColors[group.key]}
              onChange={(v) => onUpdateGroupColor(group.key, v)}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onReset}>
          Reset to Default Preset
        </button>
      </div>
    </div>
  );
}

function ColorPickerRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <label className="setting-item setting-item-toggle" style={{ cursor: 'pointer' }}>
      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 34,
          height: 26,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
        }}
      />
    </label>
  );
}
