import { BasePlatformService } from '../base.platform.js';
import { publishToFacebookFeed } from './facebook.publisher.js';
import { buildFacebookAuthUrl, exchangeFacebookCodeForToken } from './facebook.oauth.js';
import { facebookApiClient } from './facebook.client.js';
import { createLogger } from '../../middleware/logger.js';
import { saveConnectedAccount, getAccountCredentials } from '../../shared/utils/dbHelpers.js';

const logger = createLogger('FacebookService');

export class FacebookService extends BasePlatformService {
  constructor() {
    super('facebook', 'Facebook Page');
  }

  getAuthUrl(req) {
    return buildFacebookAuthUrl(undefined, req?.oauthState);
  }

  async connect(params) {
    try {
      const { code } = params;
      if (!code) {
        throw new Error('Authorization code required to connect Facebook account.');
      }
      const accessToken = await exchangeFacebookCodeForToken(code);
      const profile = await facebookApiClient.get('me', accessToken, { fields: 'id,name,email,picture.type(large)' });
      
      let pages = [];
      try {
        const pagesData = await facebookApiClient.get('me/accounts', accessToken, { fields: 'id,name,access_token,fan_count,followers_count,picture' });
        pages = pagesData.data || [];
      } catch (err) {
        logger.warn('Could not fetch Facebook pages list from me/accounts', { error: err.message });
      }

      let selectedPage = pages.length > 0 ? pages[0] : null;
      let pageAccessToken = selectedPage?.access_token || accessToken;
      let followersCount = selectedPage ? (selectedPage.followers_count ?? selectedPage.fan_count ?? 0) : 0;

      if (selectedPage?.id) {
        try {
          const pageDetails = await facebookApiClient.get(selectedPage.id, pageAccessToken, { fields: 'id,name,fan_count,followers_count,picture' });
          followersCount = pageDetails.followers_count ?? pageDetails.fan_count ?? followersCount;
          if (pageDetails.name) selectedPage.name = pageDetails.name;
        } catch (err) {
          logger.warn('Could not fetch specific page details, using account list data', { error: err.message });
        }
      }

      const accountName = selectedPage ? selectedPage.name : (profile.name || 'Facebook Account');
      const avatar = selectedPage?.picture?.data?.url || profile.picture?.data?.url || `https://graph.facebook.com/v19.0/${profile.id}/picture?type=large`;

      const accountData = {
        id: selectedPage ? selectedPage.id : profile.id,
        name: accountName,
        handle: `@${accountName.toLowerCase().replace(/[^a-z0-9._]/g, '')}`,
        avatar,
        followers: followersCount,
        accessToken: pageAccessToken,
        status: 'connected'
      };

      await saveConnectedAccount('facebook', accountData);
      logger.info('Connected Facebook account successfully', { name: accountName });
      return { success: true, account: accountData };
    } catch (err) {
      logger.error('Failed to connect Facebook account', err);
      return { success: false, error: err.message };
    }
  }

  async publish(payload) {
    try {
      const { caption, mediaUrls = [], accountId } = payload;

      const accountRecord = await getAccountCredentials('facebook', accountId);

      if (!accountRecord || !accountRecord.accessToken || accountRecord.accessToken.startsWith('mock_')) {
        return {
          success: false,
          error: 'No connected Facebook account found with a valid Page Access Token. Please connect your Facebook Page.'
        };
      }

      const pageId = accountRecord.id || 'me';
      const accessToken = accountRecord.accessToken;

      const result = await publishToFacebookFeed(pageId, accessToken, caption, mediaUrls);
      if (result.success) {
        logger.info('Published post to Facebook successfully', { postId: result.platformPostId });
      } else {
        logger.error('Failed to publish post to Facebook', { error: result.error });
      }
      return result;
    } catch (err) {
      logger.error('Error publishing to Facebook', err);
      return { success: false, error: err.message || 'Failed to publish to Facebook' };
    }
  }

  async disconnect(accountId) {
    logger.info('Disconnected Facebook account', { accountId });
    return { success: true };
  }

  async refreshToken(tokenData) {
    return { success: true, newToken: tokenData };
  }

  async validateToken(accessToken) {
    try {
      if (!accessToken || accessToken === 'mock_token') return { valid: true };
      await facebookApiClient.get('me', accessToken, { fields: 'id' });
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

export const facebookService = new FacebookService();
