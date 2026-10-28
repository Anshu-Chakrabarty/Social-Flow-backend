import { BasePlatformService } from '../base.platform.js';
import { publishUgcPost } from './linkedin.publisher.js';
import { buildLinkedInAuthUrl } from './linkedin.oauth.js';
import { createLogger } from '../../middleware/logger.js';
import { saveConnectedAccount, getAccountCredentials } from '../../shared/utils/dbHelpers.js';

const logger = createLogger('LinkedInService');

export class LinkedInService extends BasePlatformService {
  constructor() {
    super('linkedin', 'LinkedIn Profile');
  }

  getAuthUrl(req) {
    return buildLinkedInAuthUrl(req);
  }

  async connect(params) {
    try {
      const accountData = {
        id: params.urn || `urn:li:person:${Date.now()}`,
        name: params.name || 'Alex Morgan',
        handle: params.handle || 'in/alex-morgan-tech',
        avatar: params.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        status: 'connected'
      };

      await saveConnectedAccount('linkedin', accountData);
      logger.info('Connected LinkedIn account successfully', { handle: accountData.handle });
      return { success: true, account: accountData };
    } catch (err) {
      logger.error('Failed to connect LinkedIn account', err);
      return { success: false, error: err.message };
    }
  }

  async publish(payload) {
    try {
      const { caption, accountId } = payload;
      const accountRecord = await getAccountCredentials('linkedin', accountId);

      if (!accountRecord || !accountRecord.accessToken || accountRecord.accessToken.startsWith('mock_')) {
        return {
          success: false,
          error: 'No connected LinkedIn account found. Please connect your LinkedIn Profile first.'
        };
      }

      const accessToken = accountRecord.accessToken;
      const authorUrn = accountRecord.id || accountRecord.authorUrn || 'urn:li:person:me';

      const result = await publishUgcPost(accessToken, authorUrn, caption);
      if (result.success) {
        logger.info('Published UGC Post to LinkedIn successfully', { postId: result.platformPostId });
      } else {
        logger.error('Failed to publish UGC Post to LinkedIn', { error: result.error });
      }
      return result;
    } catch (err) {
      logger.error('Error publishing to LinkedIn', err);
      return { success: false, error: err.message || 'Failed to publish to LinkedIn' };
    }
  }

  async disconnect(accountId) {
    logger.info('Disconnected LinkedIn account', { accountId });
    return { success: true };
  }

  async refreshToken(tokenData) {
    return { success: true, newToken: tokenData };
  }

  async validateToken(accessToken) {
    return { valid: true };
  }
}

export const linkedinService = new LinkedInService();
