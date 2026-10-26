/**
 * WhatsApp CRM Frontend Service for BUSINZ HRMS
 * Interacts with /api/v1/crm endpoints
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import { API_BASE_URL } from '../config/api';
import type {
  CrmContact,
  CrmTag,
  CrmConversation,
  CrmMessage,
  CrmBroadcast,
  CrmAnalyticsKPIs,
  CrmTemplate
} from '../types/crm';

const getApiBase = () => {
  const base = `${API_BASE_URL}`;
  return base.endsWith('/api/v1') ? `${base}/crm` : `${base}/api/v1/crm`;
};

const getAuthToken = (): string | null => {
  let token = (
    localStorage.getItem('vrm_auth_token') ||
    sessionStorage.getItem('vrm_auth_token') ||
    localStorage.getItem('token') ||
    null
  );
  if (!token) {
    const rawUser = localStorage.getItem('vrm_hrms_current_user');
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        const payload = btoa(unescape(encodeURIComponent(JSON.stringify(u))));
        token = 'vrm_session_' + payload;
      } catch {}
    }
  }
  return token;
};

const getHeaders = (extra: Record<string, string> = {}) => {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const crmService = {
  // 1. Health
  async getHealth(): Promise<{ ok: boolean; timestamp: string }> {
    const res = await fetch(`${getApiBase()}/health`, { credentials: 'omit', headers: getHeaders() });
    return res.json();
  },

  // 2. Contacts
  async getContacts(params?: {
    category?: string;
    tag?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ contacts: CrmContact[]; total: number }> {
    const q = new URLSearchParams();
    if (params?.category) q.append('category', params.category);
    if (params?.tag) q.append('tag', params.tag);
    if (params?.search) q.append('search', params.search);
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.offset) q.append('offset', String(params.offset));

    const url = `${getApiBase()}/contacts?${q.toString()}`;
    const res = await fetch(url, { headers: getHeaders() });
    const data = await res.json();
    return { contacts: data.data || [], total: data.total || 0 };
  },

  async getContactById(id: string): Promise<CrmContact | null> {
    const res = await fetch(`${getApiBase()}/contacts/${id}`, { headers: getHeaders() });
    const data = await res.json();
    return data.data || null;
  },

  async upsertContact(contact: Partial<CrmContact>): Promise<CrmContact> {
    const res = await fetch(`${getApiBase()}/contacts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(contact)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save contact');
    return data.data;
  },

  async deleteContact(id: string): Promise<boolean> {
    const res = await fetch(`${getApiBase()}/contacts/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    return !!data.success;
  },

  // 3. Tags
  async getTags(): Promise<CrmTag[]> {
    const res = await fetch(`${getApiBase()}/tags`, { headers: getHeaders() });
    const data = await res.json();
    return data.data || [];
  },

  async createTag(name: string, color?: string): Promise<CrmTag> {
    const res = await fetch(`${getApiBase()}/tags`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, color })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create tag');
    return data.data;
  },

  async assignTag(contactId: string, tagId: string): Promise<void> {
    const res = await fetch(`${getApiBase()}/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ tagId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to assign tag');
  },

  async removeTag(contactId: string, tagId: string): Promise<void> {
    const res = await fetch(`${getApiBase()}/contacts/${contactId}/tags/${tagId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to remove tag');
  },

  // 4. Conversations
  async getConversations(params?: {
    status?: string;
    assignedEmployeeId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<CrmConversation[]> {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.assignedEmployeeId) q.append('assignedEmployeeId', params.assignedEmployeeId);
    if (params?.search) q.append('search', params.search);
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.offset) q.append('offset', String(params.offset));

    const res = await fetch(`${getApiBase()}/conversations?${q.toString()}`, { headers: getHeaders() });
    const data = await res.json();
    return data.data || [];
  },

  async getConversationById(id: string): Promise<CrmConversation | null> {
    const res = await fetch(`${getApiBase()}/conversations/${id}`, { headers: getHeaders() });
    const data = await res.json();
    return data.data || null;
  },

  async assignConversation(id: string, employeeId?: string | null, employeeName?: string | null): Promise<boolean> {
    const res = await fetch(`${getApiBase()}/conversations/${id}/assign`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ employeeId, employeeName })
    });
    const data = await res.json();
    return !!data.success;
  },

  async markAsRead(id: string): Promise<void> {
    await fetch(`${getApiBase()}/conversations/${id}/read`, {
      method: 'POST',
      headers: getHeaders()
    });
  },

  // 5. Messages
  async getMessages(conversationId: string, limit = 100, offset = 0): Promise<CrmMessage[]> {
    const res = await fetch(`${getApiBase()}/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`, {
      headers: getHeaders()
    });
    const data = await res.json();
    return data.data || [];
  },

  async sendMessage(conversationId: string, text: string): Promise<CrmMessage> {
    const res = await fetch(`${getApiBase()}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to send message');
    return data.data;
  },

  async sendTemplateMessage(payload: {
    contactId?: string;
    recipientPhone?: string;
    recipientName?: string;
    templateName: string;
    language?: string;
    languageCode?: string;
    bodyParameters?: string[];
    components?: any[];
    category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  }): Promise<CrmMessage> {
    const res = await fetch(`${getApiBase()}/messages/template`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        ...payload,
        language: payload.language || payload.languageCode || 'en'
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to send template message');
    return data.data;
  },

  // 6. Broadcasts
  async getBroadcasts(): Promise<CrmBroadcast[]> {
    const res = await fetch(`${getApiBase()}/broadcasts`, { headers: getHeaders() });
    const data = await res.json();
    return data.data || [];
  },

  async createBroadcast(payload: {
    name: string;
    templateName: string;
    templateLanguage?: string;
    templateVariables?: any;
    audienceFilter?: any;
    scheduledAt?: string;
    status?: string;
    totalRecipients?: number;
  }): Promise<CrmBroadcast> {
    const res = await fetch(`${getApiBase()}/broadcasts`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to create broadcast');
    return data.data;
  },

  async getBroadcastById(id: string): Promise<{ broadcast: CrmBroadcast; recipients: any[] }> {
    const res = await fetch(`${getApiBase()}/broadcasts/${id}`, { headers: getHeaders() });
    const data = await res.json();
    return { broadcast: data.data, recipients: data.recipients || [] };
  },

  // 7. Templates
  async getTemplates(params?: { category?: string; status?: string; search?: string }): Promise<CrmTemplate[]> {
    const q = new URLSearchParams();
    if (params?.category) q.append('category', params.category);
    if (params?.status) q.append('status', params.status);
    if (params?.search) q.append('search', params.search);

    const res = await fetch(`${getApiBase()}/templates?${q.toString()}`, { headers: getHeaders() });
    const data = await res.json();
    return data.data || [];
  },

  async getTemplateById(id: string): Promise<CrmTemplate | null> {
    const res = await fetch(`${getApiBase()}/templates/${id}`, { headers: getHeaders() });
    const data = await res.json();
    return data.data || null;
  },

  async saveTemplateDraft(payload: Partial<CrmTemplate>): Promise<CrmTemplate> {
    const res = await fetch(`${getApiBase()}/templates/draft`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save template draft');
    return data.data;
  },

  async submitTemplateToMeta(id: string): Promise<CrmTemplate> {
    const res = await fetch(`${getApiBase()}/templates/${id}/submit`, {
      method: 'POST',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to submit template to Meta');
    return data.data;
  },

  async syncMetaTemplates(): Promise<CrmTemplate[]> {
    const res = await fetch(`${getApiBase()}/templates/sync`, {
      method: 'POST',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to sync templates with Meta');
    return data.data || [];
  },

  async duplicateTemplate(id: string): Promise<CrmTemplate> {
    const res = await fetch(`${getApiBase()}/templates/${id}/duplicate`, {
      method: 'POST',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to duplicate template');
    return data.data;
  },

  async deleteTemplate(id: string): Promise<boolean> {
    const res = await fetch(`${getApiBase()}/templates/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to delete template');
    return true;
  },

  // 8. Analytics
  async getAnalytics(): Promise<CrmAnalyticsKPIs> {
    const res = await fetch(`${getApiBase()}/analytics`, { headers: getHeaders() });
    const data = await res.json();
    return data.data;
  }
};
