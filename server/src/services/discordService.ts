import crypto from 'node:crypto';
import type { DiscordUserProfile } from '@capitalloop/shared';
import type { ServerConfig } from '../config';
import type { Logger } from './logger';

export interface PublicDiscordConfig {
  oauthEnabled: boolean;
  communityEnabled: boolean;
  inviteUrl: string | null;
  webhooksEnabled: boolean;
}

interface SignedSessionPayload {
  user: DiscordUserProfile;
  exp: number;
}

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const OAUTH_STATE_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const MAX_PENDING_STATES = 500;
const NETWORK_TIMEOUT_MS = 4_500;

function isSafeHttpsUrl(raw: string | null, allowedHosts?: readonly string[]): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;
    if (allowedHosts && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export class DiscordService {
  private readonly pendingStates = new Map<string, number>();

  constructor(
    private readonly config: ServerConfig,
    private readonly logger: Logger,
  ) {}

  isOAuthConfigured(): boolean {
    return Boolean(
      this.config.discordClientId &&
        this.config.discordClientSecret &&
        this.config.discordRedirectUri,
    );
  }

  isWebhookConfigured(): boolean {
    return (
      isSafeHttpsUrl(this.config.discordWebhookUrl, ['discord.com', 'discordapp.com']) &&
      Boolean(this.config.discordWebhookUrl?.includes('/api/webhooks/'))
    );
  }

  getSafeInviteUrl(): string | null {
    return isSafeHttpsUrl(this.config.discordInviteUrl, [
      'discord.gg',
      'discord.com',
      'www.discord.com',
    ])
      ? this.config.discordInviteUrl
      : null;
  }

  /**
   * Public metadata safe to expose to the browser. Never leaks secrets or webhook URLs.
   */
  getPublicConfig(): PublicDiscordConfig {
    const inviteUrl = this.getSafeInviteUrl();
    return {
      oauthEnabled: this.isOAuthConfigured(),
      communityEnabled: Boolean(inviteUrl),
      inviteUrl,
      webhooksEnabled: this.isWebhookConfigured(),
    };
  }

  createAuthorizationUrl(): string | null {
    if (!this.isOAuthConfigured()) return null;
    this.pruneExpiredStates();

    const state = crypto.randomBytes(24).toString('hex');
    this.pendingStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);

    const params = new URLSearchParams({
      client_id: this.config.discordClientId!,
      redirect_uri: this.config.discordRedirectUri!,
      response_type: 'code',
      scope: 'identify',
      state,
      prompt: 'none',
    });

    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  consumeOAuthState(state: string): boolean {
    this.pruneExpiredStates();
    const expiresAt = this.pendingStates.get(state);
    if (!expiresAt) return false;
    this.pendingStates.delete(state);
    return expiresAt > Date.now();
  }

  async exchangeCodeForProfile(code: string): Promise<DiscordUserProfile | null> {
    if (!this.isOAuthConfigured()) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

    try {
      const tokenRes = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.discordClientId!,
          client_secret: this.config.discordClientSecret!,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.config.discordRedirectUri!,
        }),
        signal: controller.signal,
      });

      if (!tokenRes.ok) {
        this.logger.warn('Discord OAuth token exchange failed', { status: tokenRes.status });
        return null;
      }

      const tokenBody = (await tokenRes.json()) as { access_token?: string };
      if (!tokenBody.access_token) return null;

      const userRes = await fetch(`${DISCORD_API_BASE}/users/@me`, {
        headers: { Authorization: `Bearer ${tokenBody.access_token}` },
        signal: controller.signal,
      });

      if (!userRes.ok) {
        this.logger.warn('Discord user profile fetch failed', { status: userRes.status });
        return null;
      }

      const rawUser = (await userRes.json()) as {
        id?: string;
        username?: string;
        global_name?: string | null;
        avatar?: string | null;
      };

      if (!rawUser.id || !rawUser.username) return null;

      const avatarUrl = rawUser.avatar
        ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(rawUser.id)}/${encodeURIComponent(rawUser.avatar)}.png?size=128`
        : null;

      return {
        id: rawUser.id,
        username: rawUser.username,
        globalName: rawUser.global_name ?? null,
        avatarUrl,
      };
    } catch (err) {
      this.logger.warn('Discord OAuth request error', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  signSessionToken(user: DiscordUserProfile): string {
    const payload: SignedSessionPayload = {
      user,
      exp: Date.now() + SESSION_TTL_MS,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.config.discordSessionSecret)
      .update(encoded, 'utf8')
      .digest('base64url');
    return `${encoded}.${sig}`;
  }

  verifySessionToken(token: string | null | undefined): DiscordUserProfile | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [encoded, sig] = parts;
    if (!encoded || !sig) return null;

    const expectedSig = crypto
      .createHmac('sha256', this.config.discordSessionSecret)
      .update(encoded, 'utf8')
      .digest('base64url');

    const bufA = Buffer.from(sig, 'utf8');
    const bufB = Buffer.from(expectedSig, 'utf8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as SignedSessionPayload;
      if (!parsed || typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) {
        return null;
      }
      if (!parsed.user?.id || !parsed.user?.username) return null;
      return parsed.user;
    } catch {
      return null;
    }
  }

  /**
   * Sends optional non-blocking Discord webhook notifications.
   * Never throws or impacts live gameplay if Discord is unconfigured or unavailable.
   */
  async sendGameNotification(event: {
    title: string;
    description: string;
    color?: number;
  }): Promise<boolean> {
    if (!this.isWebhookConfigured() || !this.config.discordWebhookUrl) {
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);

    try {
      const res = await fetch(this.config.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'CAPITALLOOP',
          embeds: [
            {
              title: event.title.slice(0, 200),
              description: event.description.slice(0, 1000),
              color: event.color ?? 0x7c4dff,
              footer: { text: 'CAPITALLOOP Multiplayer' },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        this.logger.warn('Discord webhook returned non-2xx', { status: res.status });
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn('Discord webhook request failed', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  notifyRoomCreated(hostName: string, visibility: 'PRIVATE' | 'PUBLIC_MATCH'): void {
    // Never leak private room join codes to a public Discord channel
    const modeLabel = visibility === 'PUBLIC_MATCH' ? 'Quick Match' : 'Private Room';
    void this.sendGameNotification({
      title: `New ${modeLabel} Created`,
      description: `**${hostName}** opened a new CAPITALLOOP table.`,
      color: 0x8b5cf6,
    });
  }

  notifyGameStarted(mapName: string, playerCount: number, botCount: number): void {
    const botSuffix = botCount > 0 ? ` (${botCount} AI bot${botCount > 1 ? 's' : ''})` : '';
    void this.sendGameNotification({
      title: 'Match Started',
      description: `A ${playerCount}-player game${botSuffix} just started on **${mapName}**.`,
      color: 0x10b981,
    });
  }

  notifyGameCompleted(winnerName: string, turnCount: number, isBotWinner: boolean): void {
    const tag = isBotWinner ? ' (AI)' : '';
    void this.sendGameNotification({
      title: 'Match Complete — Victory!',
      description: `**${winnerName}${tag}** won CAPITALLOOP in **${turnCount} turns**!`,
      color: 0xfacc15,
    });
  }

  private pruneExpiredStates(): void {
    const now = Date.now();
    for (const [key, exp] of this.pendingStates.entries()) {
      if (exp <= now) {
        this.pendingStates.delete(key);
      }
    }
    while (this.pendingStates.size >= MAX_PENDING_STATES) {
      const oldest = this.pendingStates.keys().next().value;
      if (!oldest) break;
      this.pendingStates.delete(oldest);
    }
  }
}
