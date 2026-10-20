import React, { useState, useEffect } from 'react';
import { CustomerContact } from '../../types/customer';
import { AddCustomerView } from './AddCustomerView';
import { CustomerRecordsView } from './CustomerRecordsView';
import { WhatsAppTemplatesView } from './WhatsAppTemplatesView';
import { WhatsAppMessageHistoryView } from './WhatsAppMessageHistoryView';
import { SendWhatsAppModal } from './SendWhatsAppModal';
import { customerService } from '../../services/customerService';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Users, 
  UserPlus, 
  Table, 
  MessageSquare, 
  History, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Settings
} from 'lucide-react';

export type CustomerModuleTab = 'add_customer' | 'records' | 'templates' | 'history';

interface CustomerModuleProps {
  initialTab?: CustomerModuleTab;
}

export const CustomerModule: React.FC<CustomerModuleProps> = ({
  initialTab = 'records'
}) => {
  const { currentUser, setActiveModule } = useHRMS();
  const [activeTab, setActiveTab] = useState<CustomerModuleTab>(initialTab);

  // Send WhatsApp modal trigger from anywhere
  const [activeSendCustomer, setActiveSendCustomer] = useState<CustomerContact | null>(null);

  // WhatsApp API status indicator
  const [isWhatsAppConfigured, setIsWhatsAppConfigured] = useState<boolean>(false);
  const [configuredSender, setConfiguredSender] = useState<string | null>(null);

  useEffect(() => {
    checkConnectionStatus();
  }, [currentUser]);

  const checkConnectionStatus = async () => {
    try {
      const cfg = await customerService.getWhatsAppConfig(currentUser?.company_id || 'company-a');
      setIsWhatsAppConfigured(cfg.isConfigured);
      if (cfg.configuredSender) {
        setConfiguredSender(cfg.configuredSender);
      }
    } catch {
      setIsWhatsAppConfigured(false);
    }
  };

  const tabs: { id: CustomerModuleTab; label: string; icon: React.ElementType }[] = [
    { id: 'records', label: 'Customer Records', icon: Table },
    { id: 'add_customer', label: 'Add Customer', icon: UserPlus },
    { id: 'templates', label: 'WhatsApp Templates', icon: MessageSquare },
    { id: 'history', label: 'Message History', icon: History }
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Module Title Header Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        padding: '24px 28px',
        border: '1px solid #E7ECF3',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 700, color: '#1E293B', margin: '0 0 4px 0' }}>
              Customer Data Collection
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>
              Field Customer Capture, Visiting Card OCR, and Meta WhatsApp Business Cloud Messaging
            </p>
          </div>
        </div>

        {/* WhatsApp Cloud API Connection Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isWhatsAppConfigured ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: '#DCFCE7',
              border: '1px solid #BBF7D0',
              color: '#15803D',
              fontSize: '0.8rem',
              fontWeight: 600
            }}>
              <CheckCircle2 size={15} />
              Meta WhatsApp Connected {configuredSender ? `(${configuredSender})` : ''}
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FDE68A',
              color: '#B45309',
              fontSize: '0.8rem',
              fontWeight: 600
            }}>
              <AlertCircle size={15} />
              <span>WhatsApp Cloud API Pending</span>
              <button
                onClick={() => setActiveModule('settings')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0E7490',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.8rem'
                }}
              >
                Configure in Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modern Segmented Navigation Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid #E2E8F0',
        paddingBottom: '2px'
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                borderRadius: '12px 12px 0 0',
                border: 'none',
                backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                color: isActive ? '#0E7490' : '#64748B',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                borderBottom: isActive ? '3px solid #0E7490' : '3px solid transparent',
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={18} color={isActive ? '#0E7490' : '#64748B'} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Render Active View */}
      <div>
        {activeTab === 'add_customer' && (
          <AddCustomerView
            onCustomerSaved={() => {
              // Trigger reload in records
            }}
            onNavigateToRecords={() => setActiveTab('records')}
          />
        )}

        {activeTab === 'records' && (
          <CustomerRecordsView
            onOpenSendWhatsApp={(c) => setActiveSendCustomer(c)}
            onOpenMessageHistory={() => setActiveTab('history')}
            onNavigateToAddCustomer={() => setActiveTab('add_customer')}
          />
        )}

        {activeTab === 'templates' && (
          <WhatsAppTemplatesView />
        )}

        {activeTab === 'history' && (
          <WhatsAppMessageHistoryView />
        )}
      </div>

      {/* Send WhatsApp Modal from Records */}
      {activeSendCustomer && (
        <SendWhatsAppModal
          customer={activeSendCustomer}
          isOpen={Boolean(activeSendCustomer)}
          onClose={() => setActiveSendCustomer(null)}
          onSuccess={() => {
            setActiveSendCustomer(null);
            checkConnectionStatus();
          }}
        />
      )}
    </div>
  );
};
