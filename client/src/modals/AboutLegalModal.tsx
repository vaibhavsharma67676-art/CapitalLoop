import { useState } from 'react';
import { DiscordIcon } from '../assets/icons';
import { ModalShell } from './ModalShell';

export type InfoModalTab = 'about' | 'rules' | 'privacy' | 'terms';

interface AboutLegalModalProps {
  initialTab?: InfoModalTab;
  discordInviteUrl: string | null;
  onClose: () => void;
}

export function AboutLegalModal({
  initialTab = 'about',
  discordInviteUrl,
  onClose,
}: AboutLegalModalProps) {
  const [tab, setTab] = useState<InfoModalTab>(initialTab);

  return (
    <ModalShell
      title="CAPITALLOOP"
      subtitle="Version 2.0 • © 2026 Vaibhav Kumar Sharma. All rights reserved."
      wide
      onClose={onClose}
    >
      <div className="info-tab-bar" role="tablist" aria-label="Information sections">
        {(
          [
            ['about', 'About & Credits'],
            ['rules', 'How to Play'],
            ['privacy', 'Privacy Policy'],
            ['terms', 'Terms of Service'],
          ] as Array<[InfoModalTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`btn btn-xs ${tab === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="info-tab-body">
        {tab === 'about' && (
          <>
            <section className="info-section">
              <h3>About CAPITALLOOP</h3>
              <p>
                CAPITALLOOP is a real-time, server-authoritative Monopoly-style multiplayer board
                game built for smooth play on mobile portrait phones, tablets, and desktop browsers.
              </p>
            </section>

            <section className="info-section">
              <h3>Core Features</h3>
              <ul>
                <li>
                  <strong>Three Game Modes:</strong> Play Private Rooms with Friends, Quick Match
                  with Online Players, or mix AI Bots (Easy, Medium, Hard, Expert).
                </li>
                <li>
                  <strong>Fair Cryptographic Dice:</strong> Every roll is calculated server-side
                  using Node.js <code>crypto.randomInt</code> with zero bias or hidden manipulation.
                </li>
                <li>
                  <strong>Advanced Mortgage System:</strong> Mortgage eligible properties on your
                  turn—including mid-purchase when short on cash—without losing your buy chance.
                </li>
                <li>
                  <strong>Full Economy:</strong> Auctions, player-to-player trades with
                  counteroffers, progressive 1–4 houses &amp; hotels, Prison rules, taxes, and live
                  reconnection.
                </li>
              </ul>
            </section>

            <section className="info-section">
              <h3>Creator &amp; Credits</h3>
              <p>
                Created and maintained by <strong>Vaibhav Kumar Sharma</strong>.
              </p>
              <p className="info-muted">
                © 2026 Vaibhav Kumar Sharma. All rights reserved. Open-source dependencies (React,
                Vite, TypeScript, Express, Socket.IO, Zod, Helmet) remain the property of their
                respective authors and licenses.
              </p>
            </section>

            {discordInviteUrl && (
              <div className="info-discord-card">
                <div>
                  <strong>CAPITALLOOP Discord Community</strong>
                  <div className="info-muted">Find matches, report bugs, and suggest new features.</div>
                </div>
                <a
                  href={discordInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-discord btn-sm"
                >
                  <DiscordIcon size={15} />
                  Join Discord
                </a>
              </div>
            )}
          </>
        )}

        {tab === 'rules' && (
          <>
            <section className="info-section">
              <h3>How to Play</h3>
              <ol>
                <li>
                  <strong>Pick a Mode:</strong> Create a Private Room for friends, join via a
                  5-character invite code, start Quick Match, or add AI Bots.
                </li>
                <li>
                  <strong>Roll &amp; Acquire:</strong> Roll two fair dice clockwise around 40 tiles
                  (22 global cities across 8 countries, 4 international airports, and 2 utilities).
                </li>
                <li>
                  <strong>Mortgage Mid-Purchase:</strong> Short on cash when landing on an unowned
                  city? Tap <em>Mortgage to Buy</em> to raise funds from eligible properties and
                  complete the purchase on the same turn.
                </li>
                <li>
                  <strong>Build &amp; Trade:</strong> Collect a complete country set to charge 2x
                  base rent and build houses (1 → 2 → 3 → 4 → Hotel) evenly across the group.
                </li>
                <li>
                  <strong>Win:</strong> Outlast every rival through smart rent, auctions, and
                  trades until you are the last solvent player standing.
                </li>
              </ol>
            </section>
          </>
        )}

        {tab === 'privacy' && (
          <>
            <section className="info-section">
              <h3>Privacy Policy</h3>
              <p>
                CAPITALLOOP collects only the minimal technical data required to operate live
                multiplayer rooms:
              </p>
              <ul>
                <li>
                  <strong>Gameplay Session Data:</strong> Chosen nickname, random per-room session
                  token (stored locally in your browser for reconnection), and temporary active room
                  state.
                </li>
                <li>
                  <strong>Optional Discord Login:</strong> If you choose to connect Discord via
                  OAuth2, only your basic Discord user ID, username, and avatar are stored in a
                  signed HttpOnly session cookie. You can disconnect anytime.
                </li>
                <li>
                  <strong>Abuse Prevention:</strong> Temporary IP addresses are used strictly in
                  server memory for rate limiting and host kick enforcement.
                </li>
              </ul>
              <p className="info-muted">
                We do not sell personal data or run third-party ad trackers. Expired room snapshots
                are automatically purged by the server.
              </p>
            </section>
          </>
        )}

        {tab === 'terms' && (
          <>
            <section className="info-section">
              <h3>Terms of Service</h3>
              <ul>
                <li>
                  <strong>Fair Play:</strong> Attempting to exploit, spoof, spam, or disrupt active
                  rooms or matchmaking queues may result in rate-limiting or removal.
                </li>
                <li>
                  <strong>Chat Conduct:</strong> Keep private and Quick Match chat respectful and
                  free of harassment or malicious links.
                </li>
                <li>
                  <strong>Service Availability:</strong> CAPITALLOOP is provided &ldquo;as is&rdquo;
                  for entertainment without real-money gambling or monetary prizes. All in-game
                  currency is purely fictional.
                </li>
              </ul>
              <p className="info-muted">© 2026 Vaibhav Kumar Sharma. All rights reserved.</p>
            </section>
          </>
        )}
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}
