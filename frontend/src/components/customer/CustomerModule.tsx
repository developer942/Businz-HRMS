import React, { useState, useEffect } from 'react';
import { CustomerContact } from '../../types/customer';
import { AddCustomerView } from './AddCustomerView';
import { CustomerRecordsView } from './CustomerRecordsView';
import { SendWhatsAppModal } from './SendWhatsAppModal';
import { customerService } from '../../services/customerService';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Users, 
  UserPlus, 
  Table, 
  MessageSquare, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Settings,
  Camera,
  Contact2
} from 'lucide-react';

export type CustomerModuleTab = 'add_customer' | 'records';

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
    { id: 'records', label: 'Contact Directory', icon: Table },
    { id: 'add_customer', label: 'Scan Visiting Card', icon: Camera }
  ];

  return (
    <div className="customer-module-wrapper">
      {/* Sleek Page Header with Integrated Pill Tabs */}
      <div className="customer-unified-header">
        <div className="customer-header-left">
          <div className="customer-header-icon-box">
            <Contact2 size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 className="customer-header-title">Contact Card Scanner</h1>
              {isWhatsAppConfigured && (
                <span className="customer-whatsapp-badge">
                  <CheckCircle2 size={13} />
                  <span>WhatsApp Connected {configuredSender ? `(${configuredSender})` : ''}</span>
                </span>
              )}
            </div>
            <p className="customer-header-subtitle">
              Digitize visiting cards with AI OCR, manage verified customer contacts, and initiate direct communications
            </p>
          </div>
        </div>

        {/* Modern Segmented Navigation Tabs */}
        <div className="customer-segmented-tabs">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`customer-segment-tab ${isActive ? 'active' : ''}`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
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
            onNavigateToAddCustomer={() => setActiveTab('add_customer')}
          />
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
