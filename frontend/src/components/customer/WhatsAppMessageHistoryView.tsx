import React, { useState, useEffect } from 'react';
import { WhatsAppMessage, WhatsAppMessageStatus } from '../../types/customer';
import { customerService } from '../../services/customerService';
import { useHRMS } from '../../context/HRMSContext';
import { DateInput } from '../common/DateInput';
import { formatDateTimeDDMMYYYY } from '../../utils/dateUtils';
import { 
  History, 
  Search, 
  Filter, 
  RefreshCw, 
  Eye, 
  CheckCheck, 
  Check, 
  Clock, 
  AlertTriangle, 
  X,
  Calendar,
  User,
  Phone,
  MessageSquare
} from 'lucide-react';

export const WhatsAppMessageHistoryView: React.FC = () => {
  const { currentUser } = useHRMS();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchCustomer, setSearchCustomer] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<WhatsAppMessage | null>(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await customerService.getMessageHistory({
        customerName: searchCustomer,
        status: statusFilter,
        from: dateFrom,
        to: dateTo,
        companyId: currentUser?.company_id || 'company-a'
      });
      setMessages(res.messages || []);
    } catch (err) {
      console.error('Failed to fetch WhatsApp history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [searchCustomer, statusFilter, dateFrom, dateTo, currentUser]);

  const renderStatusPill = (status: WhatsAppMessageStatus) => {
    switch (status) {
      case 'read':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#DBEAFE',
            color: '#1D4ED8',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <CheckCheck size={14} color="#0284C7" /> Read
          </span>
        );
      case 'delivered':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#DCFCE7',
            color: '#15803D',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <CheckCheck size={14} /> Delivered
          </span>
        );
      case 'sent':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <Check size={14} /> Sent
          </span>
        );
      case 'accepted':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#F3E8FF',
            color: '#6D28D9',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <Clock size={12} /> Accepted by API
          </span>
        );
      case 'queued':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#FEF3C7',
            color: '#B45309',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <Clock size={12} /> Queued
          </span>
        );
      case 'failed':
        return (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#FEE2E2',
            color: '#B91C1C',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <AlertTriangle size={12} /> Failed
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Filter Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        padding: '20px 24px',
        border: '1px solid #E7ECF3',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1E293B' }}>
              WhatsApp Message Audit History
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
              Track Meta delivery milestones: API acceptance, sent, device delivery, read receipts and error diagnostics.
            </p>
          </div>

          <button
            onClick={fetchHistory}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search customer name..."
              value={searchCustomer}
              onChange={e => setSearchCustomer(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.875rem',
                outline: 'none'
              }}
            />
            <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '11px' }} />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                fontSize: '0.875rem',
                backgroundColor: '#FFFFFF',
                outline: 'none'
              }}
            >
              <option value="">All Delivery Statuses</option>
              <option value="read">Read (Blue Ticks)</option>
              <option value="delivered">Delivered (Double Ticks)</option>
              <option value="sent">Sent (Single Tick)</option>
              <option value="accepted">Accepted by API</option>
              <option value="queued">Queued</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div>
            <DateInput
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.875rem' }}
              title="From Date"
            />
          </div>

          <div>
            <DateInput
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.875rem' }}
              title="To Date"
            />
          </div>
        </div>
      </div>

      {/* History Table Card */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E7ECF3',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E7ECF3' }}>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Message ID</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Customer Name</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Contact Number</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Template Name</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Sent By</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Dispatched Time</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600 }}>Delivery Status</th>
                <th style={{ padding: '14px 18px', color: '#64748B', fontWeight: 600, textAlign: 'center' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                    Loading message history...
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '60px 20px', textAlign: 'center', color: '#64748B' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: '4px' }}>
                      No Messages Found
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>
                      Messages dispatched to customers will appear here with live Meta webhook delivery updates.
                    </div>
                  </td>
                </tr>
              ) : (
                messages.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '14px 18px', fontFamily: 'monospace', color: '#0E7490', fontSize: '0.8rem' }}>
                      {m.id.slice(0, 12)}...
                    </td>

                    <td style={{ padding: '14px 18px', fontWeight: 600, color: '#1E293B' }}>
                      {m.customerName}
                    </td>

                    <td style={{ padding: '14px 18px', color: '#475569' }}>
                      {m.customerPhone}
                    </td>

                    <td style={{ padding: '14px 18px', color: '#0F172A', fontWeight: 500 }}>
                      {m.templateName}
                    </td>

                    <td style={{ padding: '14px 18px', color: '#64748B' }}>
                      {m.senderEmployeeName}
                    </td>

                    <td style={{ padding: '14px 18px', color: '#64748B', whiteSpace: 'nowrap' }}>
                      {formatDateTimeDDMMYYYY(m.createdAt)}
                    </td>

                    <td style={{ padding: '14px 18px' }}>
                      {renderStatusPill(m.status)}
                    </td>

                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                      <button
                        onClick={() => setSelectedMessage(m)}
                        title="View Rendered Message"
                        style={{
                          border: 'none',
                          backgroundColor: '#F1F5F9',
                          color: '#0E7490',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Eye size={13} /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rendered Message Detail Modal */}
      {selectedMessage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '560px',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1E293B' }}>
                  Dispatched WhatsApp Message
                </h4>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                  To {selectedMessage.customerName} ({selectedMessage.customerPhone})
                </div>
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Chat bubble render */}
            <div style={{
              backgroundColor: '#EFEAE2',
              borderRadius: '12px',
              padding: '20px 16px',
              marginBottom: '16px'
            }}>
              <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '0px 12px 12px 12px',
                padding: '12px 16px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
                whiteSpace: 'pre-line',
                fontSize: '0.875rem',
                lineHeight: 1.5,
                color: '#1E293B'
              }}>
                {selectedMessage.renderedBody}
              </div>
            </div>

            {/* Meta response & status info */}
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#F8FAFC',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              fontSize: '0.8rem',
              color: '#475569',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div>
                <strong>Status:</strong> {selectedMessage.status.toUpperCase()}
              </div>
              <div>
                <strong>Dispatched By:</strong> {selectedMessage.senderEmployeeName}
              </div>
              {selectedMessage.metaMessageId && (
                <div>
                  <strong>Meta Message ID:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedMessage.metaMessageId}</span>
                </div>
              )}
              {selectedMessage.errorMessage && (
                <div style={{ color: '#DC2626' }}>
                  <strong>Error details:</strong> {selectedMessage.errorMessage}
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedMessage(null)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
