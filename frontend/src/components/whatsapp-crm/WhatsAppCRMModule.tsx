/**
 * WhatsApp CRM Master Module for BUSINZ HRMS
 * Integrates adapted features from wacrm (https://github.com/ArnasDon/wacrm)
 * Adheres strictly to VRM Enterprise HRM Design System
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import React, { useState } from 'react';
import {
  MessageSquare,
  Users,
  Send,
  FileText,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { CrmInboxView } from './inbox/CrmInboxView';
import { CrmContactsDirectory } from './contacts/CrmContactsDirectory';
import { CrmBroadcastManager } from './broadcasts/CrmBroadcastManager';
import { CrmTemplateManager } from './templates/CrmTemplateManager';
import { CrmAnalyticsDashboard } from './analytics/CrmAnalyticsDashboard';
import '../../styles/whatsapp-crm.css';

export type CrmTab = 'inbox' | 'contacts' | 'broadcasts' | 'templates' | 'analytics';

export const WhatsAppCRMModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CrmTab>('inbox');
  const [targetContactIdForChat, setTargetContactIdForChat] = useState<string | undefined>(undefined);

  const handleStartChatFromDirectory = (contactId: string) => {
    setTargetContactIdForChat(contactId);
    setActiveTab('inbox');
  };

  const tabs: { id: CrmTab; label: string; icon: React.ElementType }[] = [
    { id: 'inbox', label: 'Shared Inbox', icon: MessageSquare },
    { id: 'contacts', label: 'Contacts Directory', icon: Users },
    { id: 'broadcasts', label: 'Broadcast Campaigns', icon: Send },
    { id: 'templates', label: 'WhatsApp Templates', icon: FileText },
    { id: 'analytics', label: 'Analytics & KPIs', icon: TrendingUp }
  ];

  return (
    <div className="crm-module-wrapper">
      {/* Top Header Card */}
      <div className="crm-header-card">
        <div className="crm-header-left">
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '14px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <MessageSquare size={24} />
          </div>
          <div className="crm-header-info">
            <div className="crm-header-title-row">
              <h2 className="crm-header-title">
                WhatsApp CRM
              </h2>
              <span className="crm-header-badge">
                <CheckCircle2 size={13} />
                Meta Cloud API Active
              </span>
            </div>
            <p className="crm-header-subtitle">
              Shared Team Inbox, Segmented Directory, Meta Cloud Broadcasts & Delivery Tracking
            </p>
          </div>
        </div>

        {/* Sub-navigation Tabs (Scrollable on mobile) */}
        <div className="crm-tabs-bar">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id !== 'inbox') {
                    setTargetContactIdForChat(undefined);
                  }
                }}
                className="crm-tab-button"
                style={{
                  backgroundColor: isActive ? '#0E7490' : 'transparent',
                  color: isActive ? '#FFFFFF' : '#475569'
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Panes */}
      <div>
        {activeTab === 'inbox' && (
          <CrmInboxView initialContactId={targetContactIdForChat} />
        )}
        {activeTab === 'contacts' && (
          <CrmContactsDirectory onStartChat={handleStartChatFromDirectory} />
        )}
        {activeTab === 'broadcasts' && (
          <CrmBroadcastManager />
        )}
        {activeTab === 'templates' && (
          <CrmTemplateManager />
        )}
        {activeTab === 'analytics' && (
          <CrmAnalyticsDashboard />
        )}
      </div>
    </div>
  );
};

export default WhatsAppCRMModule;
