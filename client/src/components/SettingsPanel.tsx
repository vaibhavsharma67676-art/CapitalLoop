import {
  getAllBoardMaps,
  SETTINGS_BOUNDS,
  type GameSettings,
  type PartialGameSettings,
} from '@capitalloop/shared';

interface SettingsPanelProps {
  settings: GameSettings;
  editable: boolean;
  currentPlayerCount: number;
  onChange?: (patch: PartialGameSettings) => void;
}

export function SettingsPanel({
  settings,
  editable,
  currentPlayerCount,
  onChange,
}: SettingsPanelProps) {
  const maps = getAllBoardMaps();

  const update = (patch: PartialGameSettings) => {
    if (editable && onChange) {
      onChange(patch);
    }
  };

  return (
    <div className="settings-grid">
      <div className="setting-item">
        <label className="setting-label" htmlFor="set-map">
          Board Map
        </label>
        <select
          id="set-map"
          className="select-field"
          disabled={!editable}
          value={settings.mapId}
          onChange={(e) => update({ mapId: e.target.value as GameSettings['mapId'] })}
        >
          {maps.map((map) => (
            <option key={map.id} value={map.id}>
              {map.name}
            </option>
          ))}
        </select>
      </div>

      <div className="setting-item">
        <label className="setting-label" htmlFor="set-max-players">
          Max Players ({settings.maxPlayers})
        </label>
        <select
          id="set-max-players"
          className="select-field"
          disabled={!editable}
          value={settings.maxPlayers}
          onChange={(e) => update({ maxPlayers: Number(e.target.value) })}
        >
          {Array.from(
            { length: SETTINGS_BOUNDS.maxPlayers.max - SETTINGS_BOUNDS.maxPlayers.min + 1 },
            (_, i) => SETTINGS_BOUNDS.maxPlayers.min + i,
          ).map((n) => (
            <option key={n} value={n} disabled={n < currentPlayerCount}>
              {n} Players
            </option>
          ))}
        </select>
      </div>

      <div className="setting-item">
        <label className="setting-label" htmlFor="set-starting-cash">
          Starting Cash (${settings.startingCash})
        </label>
        <input
          id="set-starting-cash"
          type="range"
          className="trade-range-slider"
          disabled={!editable}
          min={SETTINGS_BOUNDS.startingCash.min}
          max={SETTINGS_BOUNDS.startingCash.max}
          step={SETTINGS_BOUNDS.startingCash.step}
          value={settings.startingCash}
          onChange={(e) => update({ startingCash: Number(e.target.value) })}
        />
      </div>

      <div className="setting-item">
        <label className="setting-label" htmlFor="set-start-bonus">
          Pass-Start Bonus (${settings.passStartBonus})
        </label>
        <input
          id="set-start-bonus"
          type="range"
          className="trade-range-slider"
          disabled={!editable}
          min={SETTINGS_BOUNDS.passStartBonus.min}
          max={SETTINGS_BOUNDS.passStartBonus.max}
          step={SETTINGS_BOUNDS.passStartBonus.step}
          value={settings.passStartBonus}
          onChange={(e) => update({ passStartBonus: Number(e.target.value) })}
        />
      </div>

      <div className="setting-item">
        <label className="setting-label" htmlFor="set-timer">
          Turn Timer
        </label>
        <select
          id="set-timer"
          className="select-field"
          disabled={!editable}
          value={settings.turnTimerSeconds}
          onChange={(e) => update({ turnTimerSeconds: Number(e.target.value) })}
        >
          {SETTINGS_BOUNDS.turnTimerOptions.map((sec) => (
            <option key={sec} value={sec}>
              {sec === 0 ? 'Unlimited (Off)' : `${sec} seconds`}
            </option>
          ))}
        </select>
      </div>

      <div className="setting-item">
        <label className="setting-label" htmlFor="set-tax">
          Income Tax Mode
        </label>
        <select
          id="set-tax"
          className="select-field"
          disabled={!editable}
          value={settings.incomeTaxMode}
          onChange={(e) =>
            update({ incomeTaxMode: e.target.value as GameSettings['incomeTaxMode'] })
          }
        >
          <option value="CHOICE_FLAT_OR_PERCENT">Choice ($200 or 10%)</option>
          <option value="FLAT_200">Flat $200</option>
          <option value="PERCENT_10">10% of Net Worth</option>
        </select>
      </div>

      <div className="setting-item">
        <label className="setting-label" htmlFor="set-mortgage-interest">
          Unmortgage Interest
        </label>
        <select
          id="set-mortgage-interest"
          className="select-field"
          disabled={!editable}
          value={settings.mortgageInterestPercent}
          onChange={(e) => update({ mortgageInterestPercent: Number(e.target.value) })}
        >
          {SETTINGS_BOUNDS.mortgageInterestOptions.map((pct) => (
            <option key={pct} value={pct}>
              {pct}% Interest
            </option>
          ))}
        </select>
      </div>

      <div className="setting-item">
        <label className="setting-label" htmlFor="set-bankruptcy">
          Bankruptcy Transfer
        </label>
        <select
          id="set-bankruptcy"
          className="select-field"
          disabled={!editable}
          value={settings.bankruptcyTransferMode}
          onChange={(e) =>
            update({
              bankruptcyTransferMode: e.target.value as GameSettings['bankruptcyTransferMode'],
            })
          }
        >
          <option value="CREDITOR">Transfer to Creditor</option>
          <option value="BANK">Return to Bank</option>
        </select>
      </div>

      <div className="setting-item">
        <label className="setting-label" htmlFor="set-speed">
          Game Speed
        </label>
        <select
          id="set-speed"
          className="select-field"
          disabled={!editable}
          value={settings.gameSpeed}
          onChange={(e) => update({ gameSpeed: e.target.value as GameSettings['gameSpeed'] })}
        >
          <option value="NORMAL">Normal</option>
          <option value="FAST">Fast (Shorter timers)</option>
        </select>
      </div>

      <ToggleSetting
        label="Auction Declined Properties"
        hint="Start open auction when skipped"
        checked={settings.auctionDeclinedProperties}
        disabled={!editable}
        onToggle={(val) => update({ auctionDeclinedProperties: val })}
      />

      <ToggleSetting
        label="2x Rent for Color Set"
        hint="Double rent on unimproved full sets"
        checked={settings.doubleRentOnColorSet}
        disabled={!editable}
        onToggle={(val) => update({ doubleRentOnColorSet: val })}
      />

      <ToggleSetting
        label="Vacation Cash Pot"
        hint="Taxes & fines collect on Vacation"
        checked={settings.vacationPotEnabled}
        disabled={!editable}
        onToggle={(val) => update({ vacationPotEnabled: val })}
      />

      <ToggleSetting
        label="Even Building Rule"
        hint="Build/sell evenly across a group"
        checked={settings.evenBuilding}
        disabled={!editable}
        onToggle={(val) => update({ evenBuilding: val })}
      />

      <ToggleSetting
        label="Limited Bank Supply"
        hint="Classic 32 houses / 12 hotels cap"
        checked={settings.limitedSupply}
        disabled={!editable}
        onToggle={(val) => update({ limitedSupply: val })}
      />

      <ToggleSetting
        label="Allow Trading"
        hint="Enable player-to-player deals"
        checked={settings.tradingEnabled}
        disabled={!editable}
        onToggle={(val) => update({ tradingEnabled: val })}
      />

      <ToggleSetting
        label="Allow Mortgages"
        hint="Mortgage unimproved properties"
        checked={settings.mortgageEnabled}
        disabled={!editable}
        onToggle={(val) => update({ mortgageEnabled: val })}
      />

      <ToggleSetting
        label="Doubles Extra Turn"
        hint="Roll again on doubles"
        checked={settings.doublesExtraTurn}
        disabled={!editable}
        onToggle={(val) => update({ doublesExtraTurn: val })}
      />

      <ToggleSetting
        label="3 Doubles to Prison"
        hint="3rd consecutive double jails player"
        checked={settings.threeDoublesToJail}
        disabled={!editable}
        onToggle={(val) => update({ threeDoublesToJail: val })}
      />

      <ToggleSetting
        label="2x Bonus Exact Start"
        hint="Double bonus when landing on Start"
        checked={settings.doubleGoOnExactLand}
        disabled={!editable}
        onToggle={(val) => update({ doubleGoOnExactLand: val })}
      />

      <ToggleSetting
        label="Collect Rent in Prison"
        hint="Allow rent income while jailed"
        checked={settings.collectRentInJail}
        disabled={!editable}
        onToggle={(val) => update({ collectRentInJail: val })}
      />
    </div>
  );
}

function ToggleSetting({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (val: boolean) => void;
}) {
  return (
    <label className="setting-item setting-item-toggle" style={{ cursor: disabled ? 'default' : 'pointer' }}>
      <div>
        <div className="setting-label">{label}</div>
        <div className="setting-hint">{hint}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
      />
    </label>
  );
}