/**
 * WhatsApp CRM Inbox View for BUSINZ HRMS
 * Desktop: WhatsApp Web Style | Mobile: Native iOS WhatsApp App Experience
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Send,
  Check,
  CheckCheck,
  AlertCircle,
  User,
  Phone,
  Mail,
  Plus,
  X,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  UserCheck,
  RefreshCw,
  ArrowLeft,
  Info,
  Paperclip,
  FileText
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type {
  CrmConversation,
  CrmMessage,
  CrmContact,
  CrmTag,
  CrmTemplate
} from '../../../types/crm';
import { useHRMS } from '../../../context/HRMSContext';

interface CrmInboxViewProps {
  initialContactId?: string;
}

export const CrmInboxView: React.FC<CrmInboxViewProps> = ({ initialContactId }) => {
  const { employees } = useHRMS();

  // Conversations State
  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loadingConvs, setLoadingConvs] = useState(false);

  // Active Chat State
  const [activeConv, setActiveConv] = useState<CrmConversation | null>(null);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // Contact Info Panel State (Shown only when requested/toggled)
  const [showContactInfo, setShowContactInfo] = useState<boolean>(false);
  const [contactDetails, setContactDetails] = useState<CrmContact | null>(null);
  const [availableTags, setAvailableTags] = useState<CrmTag[]>([]);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  // New Chat & In-Chat Template Picker Modal States
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [directoryContacts, setDirectoryContacts] = useState<CrmContact[]>([]);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [loadingDirectoryContacts, setLoadingDirectoryContacts] = useState(false);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [approvedTemplates, setApprovedTemplates] = useState<CrmTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CrmTemplate | null>(null);
  const [templateVarValues, setTemplateVarValues] = useState<string[]>([]);
  const [sendingTemplate, setSendingTemplate] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Load conversations on mount & filter change
  useEffect(() => {
    loadConversations();
    loadTags();
  }, [statusFilter]);

  // Handle initialContactId if passed from Contacts directory
  useEffect(() => {
    if (initialContactId) {
      handleOpenContactConversation(initialContactId);
    }
  }, [initialContactId]);

  // Load conversation details & messages when active conversation changes
  useEffect(() => {
    if (selectedConvId) {
      loadConversationData(selectedConvId);
      const interval = setInterval(() => {
        pollMessages(selectedConvId);
      }, 6000);
      return () => clearInterval(interval);
    } else {
      setActiveConv(null);
      setMessages([]);
      setContactDetails(null);
      setShowContactInfo(false);
    }
  }, [selectedConvId]);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    setLoadingConvs(true);
    try {
      const data = await crmService.getConversations({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery || undefined
      });
      setConversations(data);
      if (data.length > 0 && !selectedConvId && !initialContactId) {
        if (typeof window !== 'undefined' && window.innerWidth > 768) {
          setSelectedConvId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConvs(false);
    }
  };

  const loadTags = async () => {
    try {
      const tags = await crmService.getTags();
      setAvailableTags(tags);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const handleOpenContactConversation = async (contactId: string) => {
    try {
      const conv = await crmService.startOrGetConversation(contactId);
      if (conv && conv.id) {
        setConversations(prev => {
          const exists = prev.some(c => c.id === conv.id);
          return exists ? prev.map(c => (c.id === conv.id ? { ...c, ...conv } : c)) : [conv, ...prev];
        });
        setActiveConv(conv);
        setSelectedConvId(conv.id);
      } else {
        await loadConversations();
      }
    } catch (err) {
      console.error('Error opening contact conversation:', err);
    }
  };

  const handleOpenNewChatModal = async () => {
    setShowNewChatModal(true);
    setLoadingDirectoryContacts(true);
    try {
      const res = await crmService.getContacts({ limit: 100, offset: 0 });
      setDirectoryContacts(res.contacts || []);
    } catch (err) {
      console.error('Failed to load contacts for new chat:', err);
    } finally {
      setLoadingDirectoryContacts(false);
    }
  };

  const handleOpenTemplatePicker = async () => {
    setShowTemplateModal(true);
    try {
      const tmpls = await crmService.getTemplates({ status: 'APPROVED' });
      const list = tmpls.length > 0 ? tmpls : await crmService.getTemplates();
      setApprovedTemplates(list);
      const firstApproved = list.find(t => t.status === 'APPROVED') || list[0] || null;
      handleSelectTemplateForSend(firstApproved);
    } catch (err) {
      console.error('Failed to load templates for chat:', err);
    }
  };

  const handleSelectTemplateForSend = (tmpl: CrmTemplate | null) => {
    setSelectedTemplate(tmpl);
    if (!tmpl || !tmpl.bodyText) {
      setTemplateVarValues([]);
      return;
    }
    const matches = tmpl.bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const count = matches.length;
    const defaults = Array.from({ length: count }, (_, i) => {
      if (i === 0 && (activeConv?.contactName || contactDetails?.name)) {
        return activeConv?.contactName || contactDetails?.name || '';
      }
      return tmpl.bodyExampleValues?.[i] || '';
    });
    setTemplateVarValues(defaults);
  };

  const handleSendSelectedTemplate = async () => {
    if (!selectedTemplate || !activeConv || sendingTemplate) return;
    setSendingTemplate(true);
    try {
      const msg = await crmService.sendTemplateMessage({
        contactId: activeConv.contactId,
        recipientPhone: activeConv.contactPhone || contactDetails?.phone,
        recipientName: activeConv.contactName || contactDetails?.name,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language || 'en_US',
        category: (selectedTemplate.category as any) || 'UTILITY',
        bodyParameters: templateVarValues.filter(v => v !== undefined)
      });
      setMessages(prev => [...prev, msg]);
      setConversations(prev =>
        prev.map(c =>
          c.id === activeConv.id
            ? {
                ...c,
                lastMessageText: msg.contentText || `Template: ${selectedTemplate.name}`,
                lastMessageTimestamp: new Date().toISOString()
              }
            : c
        )
      );
      setShowTemplateModal(false);
    } catch (err: any) {
      alert(`Failed to send template: ${err.message || 'Meta API error'}`);
    } finally {
      setSendingTemplate(false);
    }
  };

  const loadConversationData = async (convId: string) => {
    setLoadingMessages(true);
    try {
      const conv = await crmService.getConversationById(convId);
      setActiveConv(conv);

      if (conv?.contactId) {
        const contact = await crmService.getContactById(conv.contactId);
        setContactDetails(contact);
      }

      const msgs = await crmService.getMessages(convId);
      setMessages(msgs);

      await crmService.markAsRead(convId);
      setConversations(prev =>
        prev.map(c => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Error loading conversation data:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const pollMessages = async (convId: string) => {
    try {
      const msgs = await crmService.getMessages(convId);
      setMessages(msgs);
    } catch (err) {
      console.error('Error polling messages:', err);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedConvId || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      const newMsg = await crmService.sendMessage(selectedConvId, text);
      setMessages(prev => [...prev, newMsg]);

      setConversations(prev =>
        prev.map(c =>
          c.id === selectedConvId
            ? {
                ...c,
                lastMessageText: text,
                lastMessageTimestamp: new Date().toISOString()
              }
            : c
        )
      );
    } catch (err: any) {
      alert(`Message failed to send: ${err.message || 'WhatsApp API error'}`);
    } finally {
      setSending(false);
    }
  };

  const handleAssignAgent = async (employeeId: string) => {
    if (!selectedConvId) return;
    const emp = employees.find(e => e.id === employeeId || e.employeeId === employeeId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : 'Assigned Agent';

    try {
      await crmService.assignConversation(selectedConvId, employeeId, empName);
      setActiveConv(prev => (prev ? { ...prev, assignedEmployeeId: employeeId, assignedEmployeeName: empName } : null));
      setConversations(prev =>
        prev.map(c =>
          c.id === selectedConvId
            ? { ...c, assignedEmployeeId: employeeId, assignedEmployeeName: empName }
            : c
        )
      );
    } catch (err) {
      console.error('Failed to assign agent:', err);
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (!contactDetails) return;
    try {
      await crmService.assignTag(contactDetails.id, tagId);
      const updated = await crmService.getContactById(contactDetails.id);
      setContactDetails(updated);
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!contactDetails) return;
    try {
      await crmService.removeTag(contactDetails.id, tagId);
      const updated = await crmService.getContactById(contactDetails.id);
      setContactDetails(updated);
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const handleCreateNewTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const tag = await crmService.createTag(newTagName.trim(), '#0E7490');
      setAvailableTags(prev => [...prev, tag]);
      if (contactDetails) {
        await handleAddTag(tag.id);
      }
      setNewTagName('');
      setShowAddTagModal(false);
    } catch (err: any) {
      alert(err.message || 'Error creating tag');
    }
  };

  const formatTime = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatListDate = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatDateSeparator = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInputText(prev => (prev ? `${prev} [Attachment: ${file.name}]` : `[Attachment: ${file.name}]`));
    e.target.value = '';
  };

  const showRightDrawer = Boolean(activeConv && contactDetails && showContactInfo);

  return (
    <div
      className={`crm-inbox-container ${selectedConvId ? 'mobile-show-chat' : ''} ${
        showRightDrawer ? 'with-contact-drawer' : ''
      }`}
    >
      {/* ============================================================
          1. LEFT PANEL: Conversation Search, Filters & List
          ============================================================ */}
      <div className="crm-inbox-left">
        <div className="crm-inbox-left-header">
          <div className="crm-inbox-title-row">
            <h2 className="crm-inbox-heading">Chats</h2>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={handleOpenNewChatModal}
                title="Start New Chat"
                aria-label="Start New Chat"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#FFFFFF',
                  color: '#0E7490',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} />
                <span>New Chat</span>
              </button>
              <button
                type="button"
                onClick={loadConversations}
                title="Refresh conversations"
                aria-label="Refresh conversations"
                className="crm-icon-btn"
              >
                <RefreshCw size={15} className={loadingConvs ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="crm-inbox-search-box">
            <Search size={15} className="crm-inbox-search-icon" />
            <input
              type="text"
              placeholder="Search name or phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadConversations()}
              className="crm-inbox-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTimeout(loadConversations, 0);
                }}
                aria-label="Clear search"
                className="crm-inbox-search-clear"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Compact Filter Chips: All / Open / Snoozed / Closed */}
          <div className="crm-inbox-filter-chips" role="tablist" aria-label="Conversation status filter">
            {(['all', 'open', 'snoozed', 'closed'] as const).map(st => {
              const isActive = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setStatusFilter(st)}
                  className={`crm-inbox-chip ${isActive ? 'active' : ''}`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation List */}
        <div className="crm-conv-list">
          {loadingConvs ? (
            <div className="crm-conv-empty">Loading chats...</div>
          ) : conversations.length === 0 ? (
            <div className="crm-conv-empty">
              <MessageSquare size={26} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, color: '#17212C', marginBottom: '2px' }}>No conversations found</div>
              <div style={{ fontSize: '0.76rem', color: '#667085', marginBottom: '12px' }}>
                Start a chat with any contact or employee.
              </div>
              <button
                type="button"
                onClick={handleOpenNewChatModal}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Plus size={15} />
                <span>Start New Chat</span>
              </button>
            </div>
          ) : (
            conversations.map(conv => {
              const isSelected = conv.id === selectedConvId;
              const resolvedName = conv.contactName || (conv as any).contact?.name || conv.contactPhone || (conv as any).contact?.phone || 'Unknown';
              const resolvedPhone = conv.contactPhone || (conv as any).contact?.phone || '';
              const resolvedTime = conv.lastMessageTimestamp || (conv as any).lastMessageAt;
              const initial = resolvedName.charAt(0).toUpperCase();
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`crm-conv-row ${isSelected ? 'selected' : ''}`}
                >
                  <div className="crm-conv-avatar">{initial}</div>

                  <div className="crm-conv-main">
                    <div className="crm-conv-top-line">
                      <span className="crm-conv-name">
                        {resolvedName}
                      </span>
                      <span className={`crm-conv-time ${conv.unreadCount > 0 ? 'unread' : ''}`}>
                        {formatListDate(resolvedTime)}
                      </span>
                    </div>

                    <div className="crm-conv-bottom-line">
                      <span className="crm-conv-snippet">
                        {conv.lastMessageText || resolvedPhone || 'No messages yet'}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="crm-conv-unread-badge">{conv.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ============================================================
          2. CENTER PANEL: Active Chat Thread & Composer
          ============================================================ */}
      <div className="crm-inbox-center">
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div className="crm-chat-header">
              <div className="crm-chat-header-left">
                <button
                  type="button"
                  onClick={() => setSelectedConvId(null)}
                  className="crm-chat-back-btn"
                  title="Back to Chats"
                  aria-label="Back to Chats"
                >
                  <ArrowLeft size={20} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowContactInfo(prev => !prev)}
                  className="crm-chat-contact-trigger"
                  title="View contact info"
                >
                  <div className="crm-chat-header-avatar">
                    {(activeConv.contactName || contactDetails?.name || activeConv.contactPhone || contactDetails?.phone || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="crm-chat-header-meta">
                    <div className="crm-chat-header-name-row">
                      <span className="crm-chat-header-name">
                        {activeConv.contactName || contactDetails?.name || activeConv.contactPhone || contactDetails?.phone}
                      </span>
                      {(activeConv.contactCategory || contactDetails?.category) && (
                        <span className="crm-chat-category-tag">{activeConv.contactCategory || contactDetails?.category}</span>
                      )}
                    </div>
                    <div className="crm-chat-header-phone">{activeConv.contactPhone || contactDetails?.phone}</div>
                  </div>
                </button>
              </div>

              {/* Header Right Controls: Agent Assign & Contact Info Toggle */}
              <div className="crm-chat-header-actions">
                <div className="crm-agent-assign-wrap" title="Assign team member">
                  <UserCheck size={14} color="#667085" className="crm-agent-icon" />
                  <select
                    value={activeConv.assignedEmployeeId || ''}
                    onChange={e => handleAssignAgent(e.target.value)}
                    aria-label="Assign conversation to employee"
                    className="crm-agent-select"
                  >
                    <option value="">Unassigned</option>
                    {employees.map(emp => (
                      <option key={emp.id || emp.employeeId} value={emp.employeeId || emp.id}>
                        {emp.firstName} {emp.lastName}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowContactInfo(prev => !prev)}
                  className={`crm-icon-btn ${showContactInfo ? 'active' : ''}`}
                  title={showContactInfo ? 'Hide contact info' : 'Show contact info'}
                  aria-label="Contact info"
                >
                  <Info size={18} />
                </button>
              </div>
            </div>

            {/* Anti-Spam Consent Warning Banner */}
            {contactDetails?.consentStatus === 'Opted Out' && (
              <div className="crm-consent-warning-bar">
                <ShieldAlert size={15} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Opted Out:</strong> Promotional messages are restricted. Only reply to direct inquiries.
                </span>
              </div>
            )}

            {/* Chat Messages Scroll Area */}
            <div className="crm-chat-messages-area">
              {loadingMessages ? (
                <div className="crm-chat-status-msg">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="crm-chat-status-msg">
                  <MessageSquare size={28} style={{ margin: '0 auto 8px', opacity: 0.35 }} />
                  <div style={{ fontWeight: 600, color: '#17212C' }}>No messages yet</div>
                  <div style={{ fontSize: '0.78rem', color: '#667085', marginTop: '4px', maxWidth: '340px', marginInline: 'auto' }}>
                    To start a new WhatsApp chat (before the contact messages you), send an approved template first or type a reply below.
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenTemplatePicker}
                    style={{
                      marginTop: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: '1px solid #0E7490',
                      backgroundColor: '#ECFEFF',
                      color: '#0E7490',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <FileText size={15} />
                    <span>Send Approved Template</span>
                  </button>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isOutbound =
                    msg.senderType === 'agent' || msg.senderType === 'bot' || msg.senderType === 'system';
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const currDateLabel = formatDateSeparator(msg.createdAt);
                  const prevDateLabel = prevMsg ? formatDateSeparator(prevMsg.createdAt) : '';
                  const showDateDivider = currDateLabel && currDateLabel !== prevDateLabel;

                  return (
                    <React.Fragment key={msg.id}>
                      {showDateDivider && (
                        <div className="crm-date-separator">
                          <span>{currDateLabel}</span>
                        </div>
                      )}

                      <div className={`crm-msg-row ${isOutbound ? 'outbound' : 'inbound'}`}>
                        <div className={`crm-msg-bubble ${isOutbound ? 'outbound' : 'inbound'}`}>
                          {msg.contentType === 'template' && (msg as any).templateName && (
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0E7490', marginBottom: '3px', textTransform: 'uppercase' }}>
                              Template • {(msg as any).templateName}
                            </div>
                          )}
                          <div className="crm-msg-text">{msg.contentText || ((msg as any).templateName ? `Template: ${(msg as any).templateName}` : '')}</div>
                          {msg.status === 'failed' && (
                            <div style={{ marginTop: '6px', paddingTop: '5px', borderTop: '1px solid rgba(220,38,38,0.2)', fontSize: '0.72rem', color: '#DC2626', fontWeight: 600 }}>
                              <div>Delivery failed: {(msg as any).failureReason || 'Outside 24-hour customer reply window — send an Approved Template first.'}</div>
                              <button
                                type="button"
                                onClick={handleOpenTemplatePicker}
                                style={{
                                  marginTop: '4px',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #DC2626',
                                  backgroundColor: '#FEF2F2',
                                  color: '#DC2626',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                Send Approved Template
                              </button>
                            </div>
                          )}
                          <div className="crm-msg-meta">
                            <span>{formatTime(msg.createdAt)}</span>
                            {isOutbound && (
                              <span className="crm-msg-tick">
                                {msg.status === 'read' ? (
                                  <CheckCheck size={14} color="#0284C7" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck size={14} color="#667085" />
                                ) : msg.status === 'failed' ? (
                                  <AlertCircle size={13} color="#DC2626" />
                                ) : (
                                  <Check size={14} color="#667085" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Message Composer */}
            <form onSubmit={handleSendMessage} className="crm-chat-composer">
              <input
                ref={attachmentInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleAttachmentSelect}
              />
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="crm-composer-attach-btn"
                title="Attach file"
                aria-label="Attach file"
              >
                <Paperclip size={18} />
              </button>

              <button
                type="button"
                onClick={handleOpenTemplatePicker}
                className="crm-composer-attach-btn"
                title="Send Approved WhatsApp Template"
                aria-label="Send Approved WhatsApp Template"
                style={{ color: '#0E7490' }}
              >
                <FileText size={18} />
              </button>

              <input
                type="text"
                placeholder="Message..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                disabled={sending}
                className="crm-composer-input"
              />

              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className={`crm-composer-send-btn ${inputText.trim() && !sending ? 'ready' : ''}`}
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </form>
          </>
        ) : (
          <div className="crm-inbox-empty-state">
            <div className="crm-inbox-empty-icon">
              <MessageSquare size={26} />
            </div>
            <h3 className="crm-inbox-empty-title">Select a conversation</h3>
            <p className="crm-inbox-empty-desc">
              Choose a contact from the left panel to view messages or send a reply.
            </p>
          </div>
        )}
      </div>

      {/* ============================================================
          3. RIGHT PANEL: On-Demand Contact Info Drawer / Mobile Sheet
          ============================================================ */}
      {showRightDrawer && contactDetails && (
        <div className="crm-contact-drawer-backdrop" onClick={() => setShowContactInfo(false)}>
          <aside
            className="crm-inbox-right"
            aria-label="Contact Information"
            onClick={e => e.stopPropagation()}
          >
            <div className="crm-contact-drawer-header">
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#17212C' }}>Contact Info</span>
              <button
                type="button"
                onClick={() => setShowContactInfo(false)}
                className="crm-icon-btn"
                aria-label="Close contact info"
              >
                <X size={17} />
              </button>
            </div>

            {/* Profile Summary */}
            <div className="crm-contact-profile-box">
              <div className="crm-contact-large-avatar">
                {contactDetails.name.charAt(0).toUpperCase()}
              </div>
              <h4 className="crm-contact-profile-name">{contactDetails.name}</h4>
              <p className="crm-contact-profile-sub">
                {contactDetails.designation || contactDetails.category || 'Contact'}
              </p>
              {contactDetails.companyName && (
                <p className="crm-contact-profile-company">{contactDetails.companyName}</p>
              )}
            </div>

            {/* Consent Status */}
            <div
              className={`crm-consent-card ${
                contactDetails.consentStatus === 'Opted In'
                  ? 'opted-in'
                  : contactDetails.consentStatus === 'Opted Out'
                  ? 'opted-out'
                  : 'pending'
              }`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {contactDetails.consentStatus === 'Opted In' ? (
                  <ShieldCheck size={16} color="#16A34A" />
                ) : contactDetails.consentStatus === 'Opted Out' ? (
                  <ShieldAlert size={16} color="#DC2626" />
                ) : (
                  <ShieldQuestion size={16} color="#D97706" />
                )}
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#17212C' }}>
                  {contactDetails.consentStatus}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#667085', marginTop: '4px' }}>
                Source: {contactDetails.consentSource || contactDetails.sourceType || 'Direct'}
              </div>
            </div>

            {/* Contact Details List */}
            <div className="crm-contact-section">
              <div className="crm-contact-section-label">Details</div>
              <div className="crm-contact-detail-list">
                <div className="crm-contact-detail-row">
                  <Phone size={14} color="#667085" />
                  <span>{contactDetails.phone}</span>
                </div>
                {contactDetails.email && (
                  <div className="crm-contact-detail-row">
                    <Mail size={14} color="#667085" />
                    <span style={{ overflowWrap: 'anywhere' }}>{contactDetails.email}</span>
                  </div>
                )}
                {contactDetails.category && (
                  <div className="crm-contact-detail-row">
                    <User size={14} color="#667085" />
                    <span>{contactDetails.category}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags Section */}
            <div className="crm-contact-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="crm-contact-section-label" style={{ marginBottom: 0 }}>
                  Tags
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddTagModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0E7490',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {contactDetails.tags && contactDetails.tags.length > 0 ? (
                  contactDetails.tags.map(t => (
                    <span key={t.id} className="crm-tag-pill">
                      <span>{t.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t.id)}
                        aria-label={`Remove tag ${t.name}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'inherit',
                          cursor: 'pointer',
                          display: 'inline-flex'
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#667085' }}>No tags assigned</span>
                )}
              </div>
            </div>

            {/* Notes Section */}
            {contactDetails.notes && (
              <div className="crm-contact-section">
                <div className="crm-contact-section-label">Notes</div>
                <div className="crm-contact-notes-box">{contactDetails.notes}</div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Add Tag Modal */}
      {showAddTagModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAddTagModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '16px'
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '22px',
              width: '100%',
              maxWidth: '360px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)',
              border: '1px solid #E5E7EB'
            }}
          >
            <h4 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, color: '#17212C' }}>
              Assign or Create Tag
            </h4>

            {availableTags.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.78rem', color: '#667085', marginBottom: '8px' }}>Select Existing:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {availableTags.map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        handleAddTag(tag.id);
                        setShowAddTagModal(false);
                      }}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '9999px',
                        backgroundColor: '#F8FAFC',
                        color: '#17212C',
                        border: '1px solid #E5E7EB',
                        fontSize: '0.76rem',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      + {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.78rem', color: '#667085', marginBottom: '6px' }}>New Tag Name:</div>
              <input
                type="text"
                placeholder="e.g. VIP Client, Priority"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '42px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E5E7EB',
                  fontSize: '0.86rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowAddTagModal(false)}
                style={{
                  minHeight: '40px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#FFFFFF',
                  color: '#667085',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewTag}
                disabled={!newTagName.trim()}
                style={{
                  minHeight: '40px',
                  padding: '0 16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: newTagName.trim() ? '#0E7490' : '#E5E7EB',
                  color: newTagName.trim() ? '#FFFFFF' : '#94A3B8',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: newTagName.trim() ? 'pointer' : 'default'
                }}
              >
                Create &amp; Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start New Chat Contact Picker Modal */}
      {showNewChatModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowNewChatModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '16px'
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '20px',
              width: '100%',
              maxWidth: '440px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)',
              border: '1px solid #E5E7EB'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#17212C' }}>Start New WhatsApp Chat</h4>
              <button type="button" onClick={() => setShowNewChatModal(false)} className="crm-icon-btn">
                <X size={18} />
              </button>
            </div>

            <div className="crm-inbox-search-box" style={{ marginBottom: '12px' }}>
              <Search size={15} className="crm-inbox-search-icon" />
              <input
                type="text"
                placeholder="Search contact name or phone..."
                value={contactSearchTerm}
                onChange={e => setContactSearchTerm(e.target.value)}
                className="crm-inbox-search-input"
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {loadingDirectoryContacts ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#667085', fontSize: '0.84rem' }}>
                  Loading contacts...
                </div>
              ) : (
                directoryContacts
                  .filter(c => {
                    if (!contactSearchTerm.trim()) return true;
                    const q = contactSearchTerm.toLowerCase();
                    return (
                      c.name.toLowerCase().includes(q) ||
                      c.phone.toLowerCase().includes(q) ||
                      (c.companyName || '').toLowerCase().includes(q)
                    );
                  })
                  .map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setShowNewChatModal(false);
                        void handleOpenContactConversation(c.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #F1F5F9',
                        backgroundColor: '#FFFFFF',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div className="crm-conv-avatar" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#17212C' }}>{c.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#667085' }}>
                            {c.phone} {c.category ? `• ${c.category}` : ''}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          backgroundColor: '#ECFEFF',
                          color: '#0E7490',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0
                        }}
                      >
                        Chat
                      </span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send Approved WhatsApp Template Modal */}
      {showTemplateModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowTemplateModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '16px'
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '22px',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)',
              border: '1px solid #E5E7EB'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#17212C' }}>
                Send Approved WhatsApp Template
              </h4>
              <button type="button" onClick={() => setShowTemplateModal(false)} className="crm-icon-btn">
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#667085', marginBottom: '14px', lineHeight: 1.45 }}>
              Meta requires an <strong>Approved Template</strong> to initiate a new conversation when the recipient has not messaged your business number in the last 24 hours.
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#17212C', marginBottom: '6px' }}>
                Select Template
              </label>
              <select
                value={selectedTemplate?.id || ''}
                onChange={e => {
                  const found = approvedTemplates.find(t => t.id === e.target.value) || null;
                  handleSelectTemplateForSend(found);
                }}
                style={{
                  width: '100%',
                  minHeight: '42px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E5E7EB',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  color: '#17212C'
                }}
              >
                {approvedTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.category} • {t.language} • {t.status})
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E5E7EB',
                  fontSize: '0.82rem',
                  color: '#17212C',
                  marginBottom: '14px',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {selectedTemplate.bodyText}
              </div>
            )}

            {templateVarValues.length > 0 && (
              <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#17212C' }}>Template Variables</div>
                {templateVarValues.map((val, i) => (
                  <input
                    key={i}
                    type="text"
                    placeholder={`Value for {{${i + 1}}}`}
                    value={val}
                    onChange={e => {
                      const next = [...templateVarValues];
                      next[i] = e.target.value;
                      setTemplateVarValues(next);
                    }}
                    style={{
                      width: '100%',
                      minHeight: '38px',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid #E5E7EB',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                style={{
                  minHeight: '40px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#FFFFFF',
                  color: '#667085',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendSelectedTemplate}
                disabled={!selectedTemplate || sendingTemplate}
                style={{
                  minHeight: '40px',
                  padding: '0 16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: selectedTemplate && !sendingTemplate ? '#0E7490' : '#E5E7EB',
                  color: selectedTemplate && !sendingTemplate ? '#FFFFFF' : '#94A3B8',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: selectedTemplate && !sendingTemplate ? 'pointer' : 'default'
                }}
              >
                {sendingTemplate ? 'Sending...' : 'Send Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
