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
  Paperclip
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type {
  CrmConversation,
  CrmMessage,
  CrmContact,
  CrmTag
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
      const convs = await crmService.getConversations();
      const existing = convs.find(c => c.contactId === contactId);
      if (existing) {
        setSelectedConvId(existing.id);
      } else {
        await loadConversations();
      }
    } catch (err) {
      console.error('Error opening contact conversation:', err);
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
              <div style={{ fontSize: '0.76rem', color: '#667085' }}>
                Start a chat from the Contacts tab or adjust your filter.
              </div>
            </div>
          ) : (
            conversations.map(conv => {
              const isSelected = conv.id === selectedConvId;
              const initial = (conv.contactName || conv.contactPhone || 'U').charAt(0).toUpperCase();
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
                        {conv.contactName || conv.contactPhone || 'Unknown'}
                      </span>
                      <span className={`crm-conv-time ${conv.unreadCount > 0 ? 'unread' : ''}`}>
                        {formatListDate(conv.lastMessageTimestamp)}
                      </span>
                    </div>

                    <div className="crm-conv-bottom-line">
                      <span className="crm-conv-snippet">
                        {conv.lastMessageText || conv.contactPhone || 'No messages yet'}
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
                    {(activeConv.contactName || activeConv.contactPhone || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="crm-chat-header-meta">
                    <div className="crm-chat-header-name-row">
                      <span className="crm-chat-header-name">
                        {activeConv.contactName || activeConv.contactPhone}
                      </span>
                      {activeConv.contactCategory && (
                        <span className="crm-chat-category-tag">{activeConv.contactCategory}</span>
                      )}
                    </div>
                    <div className="crm-chat-header-phone">{activeConv.contactPhone}</div>
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
                  <div style={{ fontSize: '0.78rem', color: '#667085', marginTop: '2px' }}>
                    Send a message below to start the conversation.
                  </div>
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
                          <div className="crm-msg-text">{msg.contentText}</div>
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
    </div>
  );
};
