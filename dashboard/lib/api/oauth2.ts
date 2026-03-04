import { apiClient } from './client';

// OAuth2 types
export interface OAuth2Provider {
  id: string;
  name: string;
  auth_url: string;
  token_url: string;
  user_info_url?: string;
  scopes?: string;
  docs_url?: string;
}

export interface OAuth2Token {
  access_token: string;
  token_type: string;
  expires_in?: number;
  expires_at?: string;
  refresh_token?: string;
  scope?: string;
}

export type OAuth2GrantType = 'authorization_code' | 'client_credentials' | 'password' | 'refresh_token';

export interface OAuth2Config {
  grant_type: OAuth2GrantType;
  client_id: string;
  client_secret?: string;
  auth_url?: string;
  token_url: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
}

// Get list of known OAuth2 providers
export async function getOAuth2Providers(): Promise<{ providers: OAuth2Provider[] }> {
  const response = await apiClient.get('/oauth2/providers');
  return response.data;
}

// Get a specific provider by name
export async function getOAuth2Provider(name: string): Promise<OAuth2Provider> {
  const response = await apiClient.get(`/oauth2/providers/${name}`);
  return response.data;
}

// Get authorization URL for authorization code flow
export async function getAuthorizationURL(config: OAuth2Config): Promise<{ authorization_url: string }> {
  const response = await apiClient.post('/oauth2/auth-url', config);
  return response.data;
}

// Exchange authorization code for tokens
export async function exchangeAuthorizationCode(params: {
  code: string;
  client_id: string;
  client_secret?: string;
  token_url: string;
  redirect_uri?: string;
}): Promise<OAuth2Token> {
  const response = await apiClient.post('/oauth2/token/code', params);
  return response.data;
}

// Get token using client credentials
export async function getClientCredentialsToken(params: {
  client_id: string;
  client_secret: string;
  token_url: string;
  scope?: string;
}): Promise<OAuth2Token> {
  const response = await apiClient.post('/oauth2/token/client-credentials', params);
  return response.data;
}

// Get token using password grant
export async function getPasswordGrantToken(params: {
  client_id: string;
  client_secret?: string;
  token_url: string;
  username: string;
  password: string;
  scope?: string;
}): Promise<OAuth2Token> {
  const response = await apiClient.post('/oauth2/token/password', params);
  return response.data;
}

// Refresh token
export async function refreshToken(params: {
  refresh_token: string;
  client_id: string;
  client_secret?: string;
  token_url: string;
}): Promise<OAuth2Token> {
  const response = await apiClient.post('/oauth2/token/refresh', params);
  return response.data;
}
