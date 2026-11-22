import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../../server/src/config';
import { createLogger } from '../../server/src/services/logger';
import { DiscordService } from '../../server/src/services/discordService';

describe('Optional Discord Service Safety & Failure Handling', () => {
  it('safely disables OAuth, community link, and webhooks when env vars are unconfigured', async () => {
    const config = loadServerConfig({
      nodeEnv: 'test',
      discordClientId: null,
      discordClientSecret: null,
      discordRedirectUri: null,
      discordInviteUrl: null,
      discordWebhookUrl: null,
    });
    const logger = createLogger('error', true);
    const discord = new DiscordService(config, logger);

    expect(discord.isOAuthConfigured()).toBe(false);
    expect(discord.isWebhookConfigured()).toBe(false);
    expect(discord.getSafeInviteUrl()).toBeNull();
    expect(discord.createAuthorizationUrl()).toBeNull();
    expect(discord.getPublicConfig()).toEqual({
      oauthEnabled: false,
      communityEnabled: false,
      inviteUrl: null,
      webhooksEnabled: false,
    });

    const delivered = await discord.sendGameNotification({
      title: 'Test Event',
      description: 'Should safely return false without throwing',
    });
    expect(delivered).toBe(false);
  });

  it('rejects forged or invalid OAuth state tokens and verifies signed Discord session cookies', () => {
    const config = loadServerConfig({
      nodeEnv: 'test',
      discordClientId: '1234567890',
      discordClientSecret: 'test-secret',
      discordRedirectUri: 'https://example.com/api/auth/discord/callback',
      discordInviteUrl: 'https://discord.gg/validinvite',
      discordSessionSecret: 'hmac-test-key',
    });
    const logger = createLogger('error', true);
    const discord = new DiscordService(config, logger);

    expect(discord.isOAuthConfigured()).toBe(true);
    expect(discord.getSafeInviteUrl()).toBe('https://discord.gg/validinvite');
    expect(discord.consumeOAuthState('forged-state')).toBe(false);

    const token = discord.signSessionToken({
      id: 'usr_1',
      username: 'vaibhav',
      globalName: 'Vaibhav Kumar Sharma',
      avatarUrl: null,
    });
    const verified = discord.verifySessionToken(token);
    expect(verified?.id).toBe('usr_1');
    expect(verified?.username).toBe('vaibhav');
    expect(discord.verifySessionToken(`${token}tampered`)).toBeNull();
  });
});
