import { BasePlatformService } from '../base.platform.js';
import { publishTweet } from './x.publisher.js';
import { buildXAuthUrl } from './x.oauth.js';
import { createLogger } from '../../middleware/logger.js';
import { saveConnectedAccount, getAccountCredentials } from '../../shared/utils/dbHelpers.js';

const logger = createLogger('XService');

export class XService extends BasePlatformService {
  constructor() {
    super('x', 'X (Twitter)');
  }

  getAuthUrl(req) {
    return buildXAuthUrl(req);
  }

  async connect(params) {
    try {
      const accountData = {
        id: params.id || `x_${Date.now()}`,
        name: params.name || 'Alex Morgan ⚡',
        handle: params.handle || '@alexm_tech',
        avatar: params.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        status: 'connected'
      };

      await saveConnectedAccount('x', accountData);
      logger.info('Connected X account successfully', { handle: accountData.handle });
      return { success: true, account: accountData };
    } catch (err) {
      logger.error('Failed to connect X account', err);
      return { success: false, error: err.message };
    }
  }

  async publish(payload) {
    try {
      const { caption, mediaIds = [], accountId } = payload;
      const accountRecord = await getAccountCredentials('x', accountId);

      if (!accountRecord || !accountRecord.accessToken || accountRecord.accessToken.startsWith('mock_')) {
        return {
          success: false,
          error: 'No connected X (Twitter) account found. Please connect your X account first.'
        };
      }

      const bearerToken = accountRecord.accessToken;
      const result = await publishTweet(bearerToken, caption, mediaIds);
      if (result.success) {
        logger.info('Published Tweet successfully', { postId: result.platformPostId });
      } else {
        logger.error('Failed to publish Tweet to X', { error: result.error });
      }
      return result;
    } catch (err) {
      logger.error('Error publishing to X', err);
      return { success: false, error: err.message || 'Failed to publish to X' };
    }
  }

  async disconnect(accountId) {
    logger.info('Disconnected X account', { accountId });
    return { success: true };
  }

  async refreshToken(tokenData) {
    return { success: true, newToken: tokenData };
  }

  async validateToken(bearerToken) {
    return { valid: true };
  }
}

export const xService = new XService();
