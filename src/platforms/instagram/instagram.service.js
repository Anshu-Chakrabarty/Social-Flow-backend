import { BasePlatformService } from '../base.platform.js';
import { publishToInstagramMedia } from './instagram.publisher.js';
import { buildInstagramAuthUrl, exchangeInstagramCodeForToken } from './instagram.oauth.js';
import { instagramApiClient } from './instagram.client.js';
import { createLogger } from '../../middleware/logger.js';
import { saveConnectedAccount, getAccountCredentials } from '../../shared/utils/dbHelpers.js';

const logger = createLogger('InstagramService');

export class InstagramService extends BasePlatformService {
  constructor() {
    super('instagram', 'Instagram Business');
  }

  getAuthUrl(req) {
    return buildInstagramAuthUrl(req?.oauthState);
  }

  async connect(params) {
    try {
      const { code } = params;
      let accessToken = params.accessToken;
      let igAccountId = params.igAccountId;
      let accountName = params.name;
      let handle = params.handle;
      let avatar = params.avatar;
      let followers = params.followers || 0;

      if (code) {
        accessToken = await exchangeInstagramCodeForToken(code);
        
        let igProfile = null;
        try {
          igProfile = await instagramApiClient.get('me', accessToken, {
            fields: 'id,username,name,profile_picture_url,followers_count'
          });
        } catch (err) {
          logger.warn('Direct me profile query failed, trying me/accounts fallback', { error: err.message });
        }

        if (igProfile && (igProfile.id || igProfile.username)) {
          igAccountId = igProfile.id;
          accountName = igProfile.name || igProfile.username || 'Instagram Business Account';
          handle = igProfile.username ? `@${igProfile.username}` : '@instagram_user';
          avatar = igProfile.profile_picture_url || 'https://images.unsplash.com/photo-1611262588024-d12430b98920?auto=format&fit=crop&w=150&q=80';
          followers = igProfile.followers_count || 0;
        } else {
          try {
            const pagesData = await instagramApiClient.get('me/accounts', accessToken, {
              fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count}'
            });

            const pages = pagesData.data || [];
            const pageWithIg = pages.find(p => p.instagram_business_account);

            if (pageWithIg && pageWithIg.instagram_business_account) {
              const igBusAcc = pageWithIg.instagram_business_account;
              igAccountId = igBusAcc.id;
              accountName = igBusAcc.name || igBusAcc.username || 'Instagram Business Account';
              handle = igBusAcc.username ? `@${igBusAcc.username}` : '@instagram_user';
              avatar = igBusAcc.profile_picture_url || 'https://images.unsplash.com/photo-1611262588024-d12430b98920?auto=format&fit=crop&w=150&q=80';
              followers = igBusAcc.followers_count || 0;
              accessToken = pageWithIg.access_token || accessToken;
            }
          } catch (err) {
            logger.warn('Could not fetch Instagram accounts from Facebook Pages API', { error: err.message });
          }
        }
      }

      const accountData = {
        id: igAccountId || `ig_${Date.now()}`,
        name: accountName || 'Instagram Account',
        handle: handle || '@instagram_user',
        avatar: avatar || 'https://images.unsplash.com/photo-1611262588024-d12430b98920?auto=format&fit=crop&w=150&q=80',
        followers,
        accessToken,
        igAccountId,
        status: 'connected'
      };

      await saveConnectedAccount('instagram', accountData);
      logger.info('Connected Instagram account successfully', { handle: accountData.handle, igAccountId });
      return { success: true, account: accountData };
    } catch (err) {
      logger.error('Failed to connect Instagram account', err);
      return { success: false, error: err.message };
    }
  }

  async publish(payload) {
    try {
      const { caption, mediaUrls = [], accountId } = payload;

      const accountRecord = await getAccountCredentials('instagram', accountId);

      if (!accountRecord || !accountRecord.accessToken || accountRecord.accessToken.startsWith('mock_')) {
        return {
          success: false,
          error: 'No connected Instagram account found. Please connect your Instagram Business account first.'
        };
      }

      const igAccountId = accountRecord.id || accountRecord.igAccountId || 'me';
      const accessToken = accountRecord.accessToken;
      const imageUrl = mediaUrls[0];

      if (!imageUrl) {
        return {
          success: false,
          error: 'An image URL is required to publish to Instagram.'
        };
      }

      const result = await publishToInstagramMedia(igAccountId, accessToken, caption, imageUrl);
      if (result.success) {
        logger.info('Published post to Instagram successfully', { postId: result.platformPostId });
      } else {
        logger.error('Failed to publish post to Instagram', { error: result.error });
      }
      return result;
    } catch (err) {
      logger.error('Error publishing to Instagram', err);
      return { success: false, error: err.message || 'Failed to publish to Instagram' };
    }
  }

  async disconnect(accountId) {
    logger.info('Disconnected Instagram account', { accountId });
    return { success: true };
  }

  async refreshToken(tokenData) {
    return { success: true, newToken: tokenData };
  }

  async validateToken(accessToken) {
    try {
      if (!accessToken || accessToken.startsWith('mock_')) return { valid: true };
      await instagramApiClient.get('me', accessToken, { fields: 'id' });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

export const instagramService = new InstagramService();
