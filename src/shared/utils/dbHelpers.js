import { supabase } from './supabase.js';

const usersDb = [
  {
    id: 'user_1',
    email: 'demo@socialflow.app',
    name: 'Demo Creator',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
    provider: 'email',
  },
];

const connectedAccountsDb = new Map();

function persistSecret() {
  return String(process.env.WORKSPACE_PERSIST_SECRET || '').trim();
}

export function persistConfigured() {
  return persistSecret().length >= 16;
}

function accountKey(platform) {
  return String(platform || '').toLowerCase();
}

function fromRow(record) {
  if (!record) return null;
  return {
    id: record.account_id || record.id,
    name: record.name,
    handle: record.handle,
    avatar: record.avatar,
    followers: record.followers || 0,
    accessToken: record.access_token || '',
    refreshToken: record.refresh_token || null,
    status: record.status || 'connected',
    platform: record.platform,
  };
}

function toRow(platform, accountData) {
  const key = accountKey(platform);
  return {
    account_key: key,
    platform: key,
    account_id: String(accountData.id || accountData.handle || key),
    name: accountData.name || '',
    handle: accountData.handle || '',
    avatar: accountData.avatar || '',
    followers: Number(accountData.followers || 0),
    access_token: accountData.accessToken || '',
    refresh_token: accountData.refreshToken || '',
    status: accountData.status || 'connected',
    user_id: accountData.userId || 'workspace',
  };
}

function cachePut(platform, record) {
  const key = accountKey(platform);
  connectedAccountsDb.set(key, { ...record, platform: key, updatedAt: new Date().toISOString() });
  return connectedAccountsDb.get(key);
}

async function rpc(name, args) {
  const secret = persistSecret();
  if (!secret) {
    throw new Error('WORKSPACE_PERSIST_SECRET is missing. Connected accounts cannot survive a restart.');
  }
  const { data, error } = await supabase.rpc(name, { p_secret: secret, ...args });
  if (error) {
    throw new Error(error.message || `Supabase ${name} failed.`);
  }
  return data;
}

export function findUserByEmail(email) {
  if (!email) return null;
  return usersDb.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export function saveUser(user) {
  const index = usersDb.findIndex((u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
  if (index >= 0) {
    usersDb[index] = { ...usersDb[index], ...user };
    return usersDb[index];
  }
  usersDb.push(user);
  return user;
}

export async function saveConnectedAccount(platform, accountData) {
  const key = accountKey(platform);
  const record = {
    ...accountData,
    platform: key,
    updatedAt: new Date().toISOString(),
  };
  cachePut(key, record);

  const row = toRow(key, record);
  await rpc('persist_social_account', {
    p_account_key: row.account_key,
    p_platform: row.platform,
    p_account_id: row.account_id,
    p_name: row.name,
    p_handle: row.handle,
    p_avatar: row.avatar,
    p_followers: row.followers,
    p_access_token: row.access_token,
    p_refresh_token: row.refresh_token,
    p_status: row.status,
  });

  return record;
}

export function getConnectedAccounts(platform = null) {
  const accounts = Array.from(connectedAccountsDb.values());
  if (!platform) return accounts;
  return accounts.filter((a) => a.platform === accountKey(platform));
}

export async function getAccountCredentials(platform, accountId = null) {
  const key = accountKey(platform);
  const cached = connectedAccountsDb.get(key);
  if (cached?.accessToken && cached.status === 'connected') {
    if (!accountId || cached.id === accountId || cached.handle === accountId) {
      return cached;
    }
  }

  if (!persistConfigured()) return cached || null;

  const data = await rpc('fetch_social_account', { p_platform: key });
  const row = Array.isArray(data) ? data[0] : data;
  const match = fromRow(row);
  if (match?.accessToken && match.status === 'connected') {
    cachePut(key, match);
    if (!accountId || match.id === accountId || match.handle === accountId) {
      return match;
    }
  }
  return null;
}

export async function disconnectConnectedAccount(platform) {
  const key = accountKey(platform);
  const current = connectedAccountsDb.get(key);
  if (current) {
    cachePut(key, {
      ...current,
      status: 'disconnected',
      accessToken: '',
      refreshToken: '',
    });
  }
  await rpc('disconnect_social_account', { p_platform: key });
  return { success: true };
}

export async function deleteConnectedAccount(platform) {
  return disconnectConnectedAccount(platform);
}

export async function getPersistStatus() {
  if (!persistConfigured()) {
    return { configured: false, ok: false, error: 'WORKSPACE_PERSIST_SECRET is missing.' };
  }
  try {
    await rpc('fetch_social_accounts', {});
    return { configured: true, ok: true };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}
