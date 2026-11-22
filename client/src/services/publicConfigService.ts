import type { DiscordUserProfile } from '@capitalloop/shared';

export interface PublicAppConfig {
  matchmakingEnabled: boolean;
  discord: {
    oauthEnabled: boolean;
    communityEnabled: boolean;
    inviteUrl: string | null;
    webhooksEnabled: boolean;
  };
}

export const DEFAULT_PUBLIC_CONFIG: PublicAppConfig = {
  matchmakingEnabled: true,
  discord: {
    oauthEnabled: false,
    communityEnabled: false,
    inviteUrl: null,
    webhooksEnabled: false,
  },
};

export async function fetchPublicConfig(): Promise<PublicAppConfig> {
  try {
    const res = await fetch('/api/public-config', { credentials: 'include' });
    if (!res.ok) return DEFAULT_PUBLIC_CONFIG;
    const body = (await res.json()) as {
      ok?: boolean;
      matchmakingEnabled?: boolean;
      discord?: PublicAppConfig['discord'];
    };
    if (!body.ok) return DEFAULT_PUBLIC_CONFIG;
    return {
      matchmakingEnabled: body.matchmakingEnabled ?? true,
      discord: body.discord ?? DEFAULT_PUBLIC_CONFIG.discord,
    };
  } catch {
    return DEFAULT_PUBLIC_CONFIG;
  }
}

export async function fetchDiscordSession(): Promise<DiscordUserProfile | null> {
  try {
    const res = await fetch('/api/auth/discord/me', { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; user?: DiscordUserProfile | null };
    return body.ok && body.user ? body.user : null;
  } catch {
    return null;
  }
}

export async function logoutDiscordSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/discord/logout', {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}
