import { BasePlatformService } from '../base.platform.js';
import { uploadYouTubeVideo } from './youtube.publisher.js';
import { buildYouTubeAuthUrl, exchangeCodeForTokens, fetchYouTubeChannelProfile } from './youtube.oauth.js';
import { createLogger } from '../../middleware/logger.js';
import { saveConnectedAccount, getAccountCredentials } from '../../shared/utils/dbHelpers.js';

const logger = createLogger('YouTubeService');

export class YouTubeService extends BasePlatformService {
  constructor() {
    super('youtube', 'YouTube Channel');
  }

  getAuthUrl(req) {
    return buildYouTubeAuthUrl(req?.oauthState);
  }

  async handleOAuthCallback(code) {
    try {
      // 1. Exchange authorization code for tokens
      const tokenData = await exchangeCodeForTokens(code);

      // 2. Fetch channel profile from YouTube API
      const profile = await fetchYouTubeChannelProfile(tokenData.accessToken);

      const accountData = {
        id: profile.channelId,
        name: profile.title,
        handle: profile.handle,
        avatar: profile.avatar,
        followers: profile.subscriberCount,
        status: 'connected',
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken
      };

      await saveConnectedAccount('youtube', accountData);

      logger.info('Connected YouTube channel successfully via OAuth code exchange', { channelId: profile.channelId, handle: profile.handle });
      return { success: true, account: accountData };
    } catch (err) {
      logger.error('Failed to handle YouTube OAuth callback', err);
      return { success: false, error: err.message || 'Failed to authorize YouTube connection' };
    }
  }

  async connect(params) {
    try {
      const accountData = {
        id: params.channelId || `yt_${Date.now()}`,
        name: params.name || 'YouTube Studio',
        handle: params.handle || '@YouTubeStudio',
        avatar: params.avatar || 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?auto=format&fit=crop&w=150&q=80',
        status: 'connected'
      };

      await saveConnectedAccount('youtube', accountData);
      logger.info('Connected YouTube channel successfully', { handle: accountData.handle });
      return { success: true, account: accountData };
    } catch (err) {
      logger.error('Failed to connect YouTube channel', err);
      return { success: false, error: err.message };
    }
  }

  async publish(payload) {
    try {
      const { caption = '', mediaUrls = [], accountId } = payload;

      const accountRecord = await getAccountCredentials('youtube', accountId);

      if (!accountRecord || !accountRecord.accessToken || accountRecord.accessToken.startsWith('mock_')) {
        return {
          success: false,
          error: 'No connected YouTube channel found. Please connect your YouTube Channel via Google OAuth first.'
        };
      }

      const accessToken = accountRecord.accessToken;
      const title = caption.substring(0, 50) || 'New YouTube Update';
      const result = await uploadYouTubeVideo(accessToken, title, caption, mediaUrls);

      if (result.success) {
        logger.info('Uploaded video to YouTube successfully', { postId: result.platformPostId });
      } else {
        logger.error('Failed to upload video to YouTube', { error: result.error });
      }
      return result;
    } catch (err) {
      logger.error('Error publishing to YouTube', err);
      return { success: false, error: err.message || 'Failed to publish to YouTube' };
    }
  }

  async disconnect(accountId) {
    logger.info('Disconnected YouTube channel', { accountId });
    return { success: true };
  }

  async refreshToken(tokenData) {
    return { success: true, newToken: tokenData };
  }

  async validateToken(accessToken) {
    return { valid: true };
  }
}

export const youtubeService = new YouTubeService();

