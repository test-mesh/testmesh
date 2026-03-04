import { apiClient } from './client';

// Workspace types
export type WorkspaceType = 'personal' | 'team';
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface WorkspaceSettings {
  default_environment?: string;
  variables?: Record<string, string>;
  allow_public_sharing?: boolean;
  require_approval?: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  type: WorkspaceType;
  owner_id: string;
  settings: WorkspaceSettings;
  created_at: string;
  updated_at: string;
  members?: WorkspaceMember[];
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  email: string;
  name?: string;
  role: WorkspaceRole;
  invited_by?: string;
  invited_at?: string;
  joined_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  expires_at: string;
  created_at: string;
  workspace?: Workspace;
}

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
  type?: WorkspaceType;
  settings?: WorkspaceSettings;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
  settings?: WorkspaceSettings;
}

export interface AddMemberRequest {
  user_id?: string;
  email: string;
  name?: string;
  role: WorkspaceRole;
}

export interface InviteMemberRequest {
  email: string;
  role: WorkspaceRole;
}

export interface AcceptInvitationRequest {
  token: string;
  user_id: string;
  name?: string;
}

export interface ListWorkspacesResponse {
  workspaces: Workspace[];
  total: number;
}

export interface ListMembersResponse {
  members: WorkspaceMember[];
}

export interface ListInvitationsResponse {
  invitations: WorkspaceInvitation[];
}

export interface UserRoleResponse {
  role: WorkspaceRole;
  permissions: string[];
}

// Role permissions helper
export const ROLE_PERMISSIONS: Record<WorkspaceRole, string[]> = {
  owner: [
    'workspace:delete',
    'workspace:settings',
    'members:manage',
    'flows:create', 'flows:edit', 'flows:delete', 'flows:run', 'flows:view',
    'collections:create', 'collections:edit', 'collections:delete', 'collections:view',
    'mocks:create', 'mocks:edit', 'mocks:delete', 'mocks:view',
    'contracts:create', 'contracts:edit', 'contracts:delete', 'contracts:view',
  ],
  admin: [
    'workspace:settings',
    'members:manage',
    'flows:create', 'flows:edit', 'flows:delete', 'flows:run', 'flows:view',
    'collections:create', 'collections:edit', 'collections:delete', 'collections:view',
    'mocks:create', 'mocks:edit', 'mocks:delete', 'mocks:view',
    'contracts:create', 'contracts:edit', 'contracts:delete', 'contracts:view',
  ],
  editor: [
    'flows:create', 'flows:edit', 'flows:run', 'flows:view',
    'collections:create', 'collections:edit', 'collections:view',
    'mocks:create', 'mocks:edit', 'mocks:view',
    'contracts:create', 'contracts:edit', 'contracts:view',
  ],
  viewer: [
    'flows:view', 'flows:run',
    'collections:view',
    'mocks:view',
    'contracts:view',
  ],
};

export function hasPermission(role: WorkspaceRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// API functions

// Workspace CRUD
export async function createWorkspace(data: CreateWorkspaceRequest): Promise<Workspace> {
  const response = await apiClient.post('/api/v1/workspaces', data);
  return response.data;
}

export async function getWorkspace(id: string): Promise<Workspace> {
  const response = await apiClient.get(`/api/v1/workspaces/${id}`);
  return response.data;
}

export async function getWorkspaceBySlug(slug: string): Promise<Workspace> {
  const response = await apiClient.get(`/api/v1/workspaces/slug/${slug}`);
  return response.data;
}

export async function listWorkspaces(params?: {
  type?: WorkspaceType;
  search?: string;
  sort_by?: string;
  sort_desc?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ListWorkspacesResponse> {
  const response = await apiClient.get('/api/v1/workspaces', { params });
  return response.data;
}

export async function updateWorkspace(id: string, data: UpdateWorkspaceRequest): Promise<Workspace> {
  const response = await apiClient.put(`/api/v1/workspaces/${id}`, data);
  return response.data;
}

export async function deleteWorkspace(id: string): Promise<void> {
  await apiClient.delete(`/api/v1/workspaces/${id}`);
}

export async function getPersonalWorkspace(name?: string): Promise<Workspace> {
  const response = await apiClient.get('/api/v1/workspaces/personal', {
    params: name ? { name } : undefined,
  });
  return response.data;
}

export async function getUserRole(workspaceId: string): Promise<UserRoleResponse> {
  const response = await apiClient.get(`/api/v1/workspaces/${workspaceId}/role`);
  return response.data;
}

// Member operations
export async function listMembers(workspaceId: string): Promise<ListMembersResponse> {
  const response = await apiClient.get(`/api/v1/workspaces/${workspaceId}/members`);
  return response.data;
}

export async function addMember(workspaceId: string, data: AddMemberRequest): Promise<WorkspaceMember> {
  const response = await apiClient.post(`/api/v1/workspaces/${workspaceId}/members`, data);
  return response.data;
}

export async function updateMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<WorkspaceMember> {
  const response = await apiClient.put(`/api/v1/workspaces/${workspaceId}/members/${userId}`, { role });
  return response.data;
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await apiClient.delete(`/api/v1/workspaces/${workspaceId}/members/${userId}`);
}

// Invitation operations
export async function listInvitations(workspaceId: string): Promise<ListInvitationsResponse> {
  const response = await apiClient.get(`/api/v1/workspaces/${workspaceId}/invitations`);
  return response.data;
}

export async function inviteMember(workspaceId: string, data: InviteMemberRequest): Promise<WorkspaceInvitation> {
  const response = await apiClient.post(`/api/v1/workspaces/${workspaceId}/invitations`, data);
  return response.data;
}

export async function revokeInvitation(workspaceId: string, invitationId: string): Promise<void> {
  await apiClient.delete(`/api/v1/workspaces/${workspaceId}/invitations/${invitationId}`);
}

export async function acceptInvitation(data: AcceptInvitationRequest): Promise<WorkspaceMember> {
  const response = await apiClient.post('/api/v1/invitations/accept', data);
  return response.data;
}
