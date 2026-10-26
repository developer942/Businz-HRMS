/**
 * Professional WhatsApp Template Editor Modal for BUSINZ HRMS
 * Live WhatsApp Message Preview, Category Rules, Variable Samples, & Meta Validation
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Send,
  Save,
  HelpCircle,
  ExternalLink,
  Phone,
  MessageSquare,
  Sparkles,
  Smartphone,
  Eye,
  FileText,
  UploadCloud,
  Check,
  Image as ImageIcon,
  Video as VideoIcon,
  FolderOpen,
  Link2
} from 'lucide-react';
import type {
  CrmTemplate,
  CrmTemplateCategory,
  CrmTemplateHeaderType,
  CrmTemplateButton
} from '../../../types/crm';

interface CrmTemplateEditorModalProps {
  isOpen: boolean;
  initialTemplate?: CrmTemplate | null;
  onClose: () => void;
  onSaveDraft: (template: Partial<CrmTemplate>) => Promise<void>;
  onSubmitToMeta?: (template: Partial<CrmTemplate>) => Promise<void>;
}

export const CrmTemplateEditorModal: React.FC<CrmTemplateEditorModalProps> = ({
  isOpen,
  initialTemplate,
  onClose,
  onSaveDraft,
  onSubmitToMeta
}) => {
  if (!isOpen) return null;

  // Form State
  const [name, setName] = useState(initialTemplate?.name || '');
  const [category, setCategory] = useState<CrmTemplateCategory>(initialTemplate?.category || 'MARKETING');
  const [language, setLanguage] = useState(initialTemplate?.language || 'en');
  
  // Header
  const [headerType, setHeaderType] = useState<CrmTemplateHeaderType>(initialTemplate?.headerType || 'NONE');
  const [headerContent, setHeaderContent] = useState(initialTemplate?.headerContent || '');
  const [headerSample, setHeaderSample] = useState(initialTemplate?.headerExample?.[0] || '');

  // Direct File Upload State for Media Headers
  const [headerFileName, setHeaderFileName] = useState(
    initialTemplate?.headerType && initialTemplate.headerType !== 'NONE' && initialTemplate.headerType !== 'TEXT'
      ? initialTemplate.headerContent || ''
      : ''
  );
  const [headerFileDataUrl, setHeaderFileDataUrl] = useState<string>(initialTemplate?.headerExample?.[0] || '');
  const [headerFileSize, setHeaderFileSize] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File) => {
    const maxSizes: Record<string, number> = {
      IMAGE: 5 * 1024 * 1024,
      VIDEO: 16 * 1024 * 1024,
      DOCUMENT: 100 * 1024 * 1024
    };
    const maxLimit = maxSizes[headerType] || 10 * 1024 * 1024;
    if (file.size > maxLimit) {
      const mb = Math.round(maxLimit / (1024 * 1024));
      alert(`File size exceeds maximum allowed limit of ${mb}MB for ${headerType}.`);
      return;
    }

    const formattedSize = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`;

    setHeaderFileName(file.name);
    setHeaderFileSize(formattedSize);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setHeaderFileDataUrl(result);
      setHeaderSample(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleRemoveHeaderFile = () => {
    setHeaderFileName('');
    setHeaderFileSize('');
    setHeaderFileDataUrl('');
    setHeaderSample('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [mediaInputMode, setMediaInputMode] = useState<'upload' | 'url'>('upload');

  // Clipboard Paste support (Ctrl + V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (headerType !== 'IMAGE' && headerType !== 'VIDEO' && headerType !== 'DOCUMENT') return;
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            handleFileChange(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [headerType]);

  const getFileAccept = () => {
    switch (headerType) {
      case 'IMAGE':
        return '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
      case 'VIDEO':
        return '.mp4,.3gp,video/mp4,video/3gpp';
      case 'DOCUMENT':
        return '.pdf,.doc,.docx,application/pdf';
      default:
        return '*/*';
    }
  };

  // Body
  const [bodyText, setBodyText] = useState(initialTemplate?.bodyText || '');
  const [bodyVariables, setBodyVariables] = useState<string[]>([]);
  const [bodySampleValues, setBodySampleValues] = useState<Record<number, string>>({});

  // Footer
  const [footerText, setFooterText] = useState(initialTemplate?.footerText || '');

  // Buttons
  const [buttons, setButtons] = useState<CrmTemplateButton[]>(initialTemplate?.buttons || []);

  // UI state
  const [previewMode, setPreviewMode] = useState<'sample' | 'raw'>('sample');
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Parse variables from body text
  useEffect(() => {
    const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const uniqueVars = Array.from(new Set(matches)).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10);
      const numB = parseInt(b.replace(/\D/g, ''), 10);
      return numA - numB;
    });
    setBodyVariables(uniqueVars);

    // Initial populate from initialTemplate if available
    if (initialTemplate?.bodyExampleValues && initialTemplate.bodyExampleValues.length > 0) {
      const initialMap: Record<number, string> = {};
      initialTemplate.bodyExampleValues.forEach((val, idx) => {
        initialMap[idx + 1] = val;
      });
      setBodySampleValues(prev => ({ ...initialMap, ...prev }));
    }
  }, [bodyText]);

  // Insert {{1}}, {{2}} at cursor
  const handleInsertVariable = () => {
    const nextVarNum = bodyVariables.length + 1;
    const varTag = `{{${nextVarNum}}}`;
    
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newText = bodyText.substring(0, start) + varTag + bodyText.substring(end);
      setBodyText(newText);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = start + varTag.length;
          textareaRef.current.selectionEnd = start + varTag.length;
        }
      }, 0);
    } else {
      setBodyText(prev => prev + ' ' + varTag);
    }
  };

  // Add Button
  const handleAddButton = (type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER') => {
    if (buttons.length >= 3) {
      alert('Maximum 3 buttons allowed by WhatsApp Meta API');
      return;
    }
    const newBtn: CrmTemplateButton = {
      type,
      text: type === 'QUICK_REPLY' ? 'Quick Reply' : type === 'URL' ? 'Visit Website' : 'Call Support',
      url: type === 'URL' ? 'https://example.com' : undefined,
      phoneNumber: type === 'PHONE_NUMBER' ? '+919876543210' : undefined
    };
    setButtons([...buttons, newBtn]);
  };

  const handleRemoveButton = (idx: number) => {
    setButtons(buttons.filter((_, i) => i !== idx));
  };

  // Validate form
  const validateTemplate = (forSubmission = false): boolean => {
    const errors: string[] = [];
    const cleanName = name.toLowerCase().trim();

    if (!cleanName) {
      errors.push('Template name is required.');
    } else if (!/^[a-z0-9_]+$/.test(cleanName)) {
      errors.push('Template name must be lowercase alphanumeric with underscores only (e.g. order_shipped_v1).');
    }

    if (!bodyText.trim()) {
      errors.push('Message body text cannot be empty.');
    } else if (bodyText.length > 1024) {
      errors.push('Body text exceeds 1,024 characters limit.');
    }

    if (footerText && footerText.length > 60) {
      errors.push('Footer text exceeds 60 characters limit.');
    }

    if (headerType === 'TEXT' && headerContent.length > 60) {
      errors.push('Header text exceeds 60 characters limit.');
    }

    if (forSubmission && (headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT')) {
      if (!headerFileDataUrl && !headerSample) {
        errors.push(`Please upload a sample ${headerType.toLowerCase()} file for Meta review verification.`);
      }
    }

    // Variable sequence verification: {{1}}, {{2}} must be sequential starting at 1
    const foundNums = bodyVariables.map(v => parseInt(v.replace(/\D/g, ''), 10));
    for (let i = 1; i <= foundNums.length; i++) {
      if (!foundNums.includes(i)) {
        errors.push(`Variable numbers must be sequential. Missing {{${i}}}.`);
        break;
      }
    }

    if (forSubmission) {
      // For Meta submission, all variables MUST have sample values
      for (let i = 1; i <= bodyVariables.length; i++) {
        if (!bodySampleValues[i] || !bodySampleValues[i].trim()) {
          errors.push(`Please provide an example value for variable {{${i}}}.`);
        }
      }
    }

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const getPayload = (): Partial<CrmTemplate> => {
    const sampleArr: string[] = [];
    for (let i = 1; i <= bodyVariables.length; i++) {
      sampleArr.push(bodySampleValues[i] || `Value${i}`);
    }

    return {
      ...(initialTemplate?.id ? { id: initialTemplate.id } : {}),
      name: name.toLowerCase().trim(),
      category,
      language,
      headerType,
      headerContent: headerType === 'TEXT' ? headerContent.trim() : headerFileName || (headerType !== 'NONE' ? headerType : null),
      headerExample: headerFileDataUrl ? [headerFileDataUrl] : headerSample ? [headerSample] : null,
      bodyText: bodyText.trim(),
      bodyExampleValues: sampleArr,
      footerText: footerText.trim() || null,
      buttons: buttons.length > 0 ? buttons : null
    };
  };

  const handleSave = async () => {
    if (!validateTemplate(false)) return;
    setIsSaving(true);
    try {
      await onSaveDraft(getPayload());
      onClose();
    } catch (err: any) {
      alert(`Save Draft Failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateTemplate(true)) return;
    if (!window.confirm(`Submit "${name}" to Meta for official review? Meta review usually takes a few minutes.`)) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (onSubmitToMeta) {
        await onSubmitToMeta(getPayload());
      } else {
        await onSaveDraft({ ...getPayload(), status: 'PENDING' });
      }
      onClose();
    } catch (err: any) {
      alert(`Submission Failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preview replacement renderer
  const renderPreviewBody = () => {
    if (!bodyText) return 'Type your message body on the left...';
    if (previewMode === 'raw') return bodyText;

    let rendered = bodyText;
    bodyVariables.forEach((v, idx) => {
      const num = idx + 1;
      const sample = bodySampleValues[num] || `[Example ${num}]`;
      rendered = rendered.split(v).join(sample);
    });
    return rendered;
  };

  const languagesList = [
    { code: 'en', label: 'English' },
    { code: 'en_US', label: 'English (US)' },
    { code: 'ta', label: 'Tamil (தமிழ்)' },
    { code: 'hi', label: 'Hindi (हिन्दी)' },
    { code: 'te', label: 'Telugu (తెలుగు)' },
    { code: 'ml', label: 'Malayalam (മലയാളം)' },
    { code: 'kn', label: 'Kannada (ಕನ್ನಡ)' },
    { code: 'es', label: 'Spanish' },
    { code: 'ar', label: 'Arabic' }
  ];

  return (
    <div className="crm-editor-modal-wrapper">
      <div className="crm-editor-modal-container">
        {/* Modal Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#FFFFFF'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: '#ECFEFF',
              color: '#0E7490',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <MessageSquare size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1E293B', fontWeight: 700 }}>
                {initialTemplate ? 'Edit WhatsApp Template' : 'Create WhatsApp Message Template'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                Meta WhatsApp Business Cloud API Template Studio
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body - 2 Columns (Editor + Live Phone Preview) */}
        <div className="crm-editor-grid">
          {/* ========================================================= */}
          {/* LEFT: Template Form Editor */}
          {/* ========================================================= */}
          <div className="crm-editor-form-col">
            {/* Validation Alerts */}
            {validationErrors.length > 0 && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                fontSize: '0.82rem'
              }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <AlertCircle size={15} /> Please fix the following before submitting:
                </div>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Template Identity */}
            <div className="crm-editor-identity-row">
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Template Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. appointment_reminder_v1"
                  value={name}
                  onChange={e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>lowercase, numbers, underscores</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Category *
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as CrmTemplateCategory)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    backgroundColor: '#FFFFFF',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Language *
                </label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.85rem',
                    backgroundColor: '#FFFFFF',
                    boxSizing: 'border-box'
                  }}
                >
                  {languagesList.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Header Section */}
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B' }}>Header (Optional)</span>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Add title, image, or document</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'] as CrmTemplateHeaderType[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setHeaderType(type);
                      if (type === 'NONE' || type === 'TEXT') {
                        handleRemoveHeaderFile();
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: headerType === type ? '1px solid #0E7490' : '1px solid #CBD5E1',
                      backgroundColor: headerType === type ? '#0E7490' : '#FFFFFF',
                      color: headerType === type ? '#FFFFFF' : '#475569'
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {headerType === 'TEXT' && (
                <div>
                  <input
                    type="text"
                    maxLength={60}
                    placeholder="Enter header text (max 60 chars)..."
                    value={headerContent}
                    onChange={e => setHeaderContent(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#94A3B8', marginTop: '2px' }}>
                    {headerContent.length} / 60
                  </div>
                </div>
              )}

              {(headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT') && (
                <div>
                  {/* Mode switcher: Upload vs URL */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>
                      {headerType === 'IMAGE' ? 'Header Image' : headerType === 'VIDEO' ? 'Header Video' : 'Header Document'}:
                    </div>
                    <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setMediaInputMode('upload')}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: 'none',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          backgroundColor: mediaInputMode === 'upload' ? '#FFFFFF' : 'transparent',
                          color: mediaInputMode === 'upload' ? '#0E7490' : '#64748B',
                          boxShadow: mediaInputMode === 'upload' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                        }}
                      >
                        Upload from PC
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaInputMode('url')}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: 'none',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          backgroundColor: mediaInputMode === 'url' ? '#FFFFFF' : 'transparent',
                          color: mediaInputMode === 'url' ? '#0E7490' : '#64748B',
                          boxShadow: mediaInputMode === 'url' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                        }}
                      >
                        Direct URL
                      </button>
                    </div>
                  </div>

                  {mediaInputMode === 'url' ? (
                    <div>
                      <input
                        type="url"
                        placeholder={`https://example.com/sample-${headerType.toLowerCase()}.${headerType === 'IMAGE' ? 'jpg' : headerType === 'VIDEO' ? 'mp4' : 'pdf'}`}
                        value={headerSample}
                        onChange={e => {
                          setHeaderSample(e.target.value);
                          setHeaderFileDataUrl(e.target.value);
                          setHeaderFileName(`URL ${headerType}`);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px' }}>
                        Provide a publicly accessible URL to a sample {headerType.toLowerCase()} file for Meta review.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input
                        id="template-header-media-input"
                        type="file"
                        ref={fileInputRef}
                        accept={getFileAccept()}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileChange(e.target.files[0]);
                          }
                        }}
                        style={{ display: 'none' }}
                      />

                      {!headerFileDataUrl ? (
                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          style={{
                            border: isDragging ? '2px dashed #0E7490' : '1.5px dashed #CBD5E1',
                            borderRadius: '12px',
                            padding: '20px 16px',
                            backgroundColor: isDragging ? '#ECFEFF' : '#FFFFFF',
                            textAlign: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            backgroundColor: '#ECFEFF',
                            color: '#0E7490',
                            margin: '0 auto 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <UploadCloud size={22} />
                          </div>
                          <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#1E293B', marginBottom: '2px' }}>
                            Drag & drop {headerType.toLowerCase()} file here, or
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px', marginBottom: '10px' }}>
                            <label
                              htmlFor="template-header-media-input"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '7px 14px',
                                backgroundColor: '#0E7490',
                                color: '#FFFFFF',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(14, 116, 144, 0.25)'
                              }}
                            >
                              <FolderOpen size={15} />
                              Browse from PC
                            </label>
                          </div>

                          <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                            {headerType === 'IMAGE' && 'PNG, JPG, JPEG or WEBP (Max 5MB)'}
                            {headerType === 'VIDEO' && 'MP4, 3GPP (Max 16MB)'}
                            {headerType === 'DOCUMENT' && 'PDF, DOC, DOCX (Max 100MB)'}
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          padding: '12px 16px',
                          borderRadius: '12px',
                          backgroundColor: '#F0FDF4',
                          border: '1px solid #BBF7D0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                            {headerType === 'IMAGE' ? (
                              <img
                                src={headerFileDataUrl}
                                alt="Uploaded Thumbnail"
                                style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #CBD5E1', flexShrink: 0 }}
                              />
                            ) : headerType === 'VIDEO' ? (
                              <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '8px',
                                backgroundColor: '#ECFEFF',
                                color: '#0E7490',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                <VideoIcon size={24} />
                              </div>
                            ) : (
                              <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '8px',
                                backgroundColor: '#FEE2E2',
                                color: '#DC2626',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                <FileText size={24} />
                              </div>
                            )}

                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{
                                fontSize: '0.88rem',
                                fontWeight: 600,
                                color: '#1E293B',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {headerFileName || `Uploaded ${headerType}`}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.74rem', color: '#059669', marginTop: '2px' }}>
                                <span>{headerFileSize || 'Ready'}</span>
                                <span>•</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                  <CheckCircle2 size={13} /> Uploaded & Ready
                                </span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <label
                              htmlFor="template-header-media-input"
                              style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#0E7490',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Change File
                            </label>
                            <button
                              type="button"
                              onClick={handleRemoveHeaderFile}
                              title="Remove File"
                              style={{
                                padding: '6px',
                                borderRadius: '8px',
                                border: '1px solid #FEE2E2',
                                backgroundColor: '#FFFFFF',
                                color: '#EF4444',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message Body Section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B' }}>
                  Message Body *
                </label>
                <button
                  type="button"
                  onClick={handleInsertVariable}
                  style={{
                    background: 'none',
                    border: '1px solid #0E7490',
                    color: '#0E7490',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Plus size={13} />
                  <span>Add Variable</span>
                </button>
              </div>

              <textarea
                ref={textareaRef}
                rows={5}
                maxLength={1024}
                placeholder="Hello {{1}}, welcome to BUSINZ! Your appointment is scheduled for {{2}}."
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.9rem',
                  lineHeight: '1.5',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>
                <span>Use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code> for dynamic recipient personalization.</span>
                <span>{bodyText.length} / 1024</span>
              </div>
            </div>

            {/* Dynamic Variable Sample Values Inputs */}
            {bodyVariables.length > 0 && (
              <div style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: '#F0FDFA',
                border: '1px solid #99F6E4',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={16} color="#0E7490" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0F766E' }}>
                    Variable Sample Values (Required by Meta)
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {bodyVariables.map((v, idx) => {
                    const num = idx + 1;
                    return (
                      <div key={v}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#134E4A', marginBottom: '2px' }}>
                          Sample for {v}
                        </label>
                        <input
                          type="text"
                          placeholder={num === 1 ? 'e.g. Ramesh Kumar' : num === 2 ? 'e.g. ₹5,000' : 'e.g. Tomorrow'}
                          value={bodySampleValues[num] || ''}
                          onChange={e => setBodySampleValues({ ...bodySampleValues, [num]: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid #5EEAD4',
                            fontSize: '0.82rem',
                            backgroundColor: '#FFFFFF',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer Section */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                Footer Text (Optional, max 60 chars)
              </label>
              <input
                type="text"
                maxLength={60}
                placeholder="e.g. Reply STOP to opt out"
                value={footerText}
                onChange={e => setFooterText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#94A3B8', marginTop: '2px' }}>
                {footerText.length} / 60
              </div>
            </div>

            {/* Buttons Section */}
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1E293B' }}>
                  Interactive Buttons ({buttons.length}/3)
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleAddButton('QUICK_REPLY')}
                    disabled={buttons.length >= 3}
                    style={{
                      background: 'none',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: buttons.length >= 3 ? 'default' : 'pointer'
                    }}
                  >
                    + Quick Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddButton('URL')}
                    disabled={buttons.length >= 3}
                    style={{
                      background: 'none',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: buttons.length >= 3 ? 'default' : 'pointer'
                    }}
                  >
                    + Website URL
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddButton('PHONE_NUMBER')}
                    disabled={buttons.length >= 3}
                    style={{
                      background: 'none',
                      border: '1px solid #CBD5E1',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: buttons.length >= 3 ? 'default' : 'pointer'
                    }}
                  >
                    + Call Phone
                  </button>
                </div>
              </div>

              {buttons.map((btn, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0'
                  }}
                >
                  <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569', fontWeight: 600 }}>
                    {btn.type}
                  </span>

                  <input
                    type="text"
                    placeholder="Button Label"
                    value={btn.text}
                    onChange={e => {
                      const updated = [...buttons];
                      updated[idx].text = e.target.value;
                      setButtons(updated);
                    }}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem'
                    }}
                  />

                  {btn.type === 'URL' && (
                    <input
                      type="url"
                      placeholder="https://..."
                      value={btn.url || ''}
                      onChange={e => {
                        const updated = [...buttons];
                        updated[idx].url = e.target.value;
                        setButtons(updated);
                      }}
                      style={{
                        flex: 1.5,
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.82rem'
                      }}
                    />
                  )}

                  {btn.type === 'PHONE_NUMBER' && (
                    <input
                      type="tel"
                      placeholder="+91..."
                      value={btn.phoneNumber || ''}
                      onChange={e => {
                        const updated = [...buttons];
                        updated[idx].phoneNumber = e.target.value;
                        setButtons(updated);
                      }}
                      style={{
                        flex: 1.2,
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.82rem'
                      }}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveButton(idx)}
                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ========================================================= */}
          {/* RIGHT: Live WhatsApp Message Simulator */}
          {/* ========================================================= */}
          <div className="crm-editor-preview-col">
            {/* Preview Mode Switcher */}
            <div style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              display: 'flex',
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              padding: '2px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <button
                type="button"
                onClick={() => setPreviewMode('sample')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: previewMode === 'sample' ? '#0E7490' : 'transparent',
                  color: previewMode === 'sample' ? '#FFFFFF' : '#64748B'
                }}
              >
                Sample Preview
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('raw')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: previewMode === 'raw' ? '#0E7490' : 'transparent',
                  color: previewMode === 'raw' ? '#FFFFFF' : '#64748B'
                }}
              >
                Raw Placeholders
              </button>
            </div>

            {/* Phone Screen Frame */}
            <div style={{
              width: '320px',
              maxWidth: '100%',
              backgroundColor: '#FFFFFF',
              borderRadius: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              overflow: 'hidden',
              border: '6px solid #1E293B'
            }}>
              {/* Phone Speaker & Camera Notch */}
              <div style={{ height: '18px', backgroundColor: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '40px', height: '4px', backgroundColor: '#475569', borderRadius: '2px' }} />
              </div>

              {/* Chat Header Bar */}
              <div style={{
                backgroundColor: '#075E54',
                color: '#FFFFFF',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: '#25D366',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.8rem'
                }}>
                  B
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>BUSINZ Enterprise</div>
                  <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>Official Business Account</div>
                </div>
              </div>

              {/* Chat Message Bubble Canvas */}
              <div style={{
                backgroundColor: '#EFEAE2',
                padding: '16px 12px',
                minHeight: '280px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start'
              }}>
                {/* Official WhatsApp Message Bubble */}
                <div style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px 12px 12px 2px',
                  padding: '10px 12px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {/* Header Preview */}
                  {headerType === 'TEXT' && headerContent && (
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827' }}>
                      {headerContent}
                    </div>
                  )}

                  {headerType === 'IMAGE' && (
                    <div style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: '#E2E8F0',
                      minHeight: '120px',
                      maxHeight: '170px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #E2E8F0'
                    }}>
                      {(headerFileDataUrl || headerSample) ? (
                        <img
                          src={headerFileDataUrl || headerSample}
                          alt="WhatsApp Header Preview"
                          style={{ width: '100%', height: '100%', maxHeight: '170px', objectFit: 'cover', display: 'block' }}
                        />
                      ) : (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#64748B',
                          fontSize: '0.75rem',
                          padding: '24px'
                        }}>
                          <ImageIcon size={22} />
                          <span>Upload image on the left</span>
                        </div>
                      )}
                    </div>
                  )}

                  {headerType === 'VIDEO' && (
                    <div style={{
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: '#0F172A',
                      minHeight: '120px',
                      maxHeight: '170px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {(headerFileDataUrl || headerSample) ? (
                        <video
                          src={headerFileDataUrl || headerSample}
                          controls
                          style={{ width: '100%', maxHeight: '170px', display: 'block' }}
                        />
                      ) : (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#94A3B8',
                          fontSize: '0.75rem',
                          padding: '24px'
                        }}>
                          <VideoIcon size={22} />
                          <span>Upload video on the left</span>
                        </div>
                      )}
                    </div>
                  )}

                  {headerType === 'DOCUMENT' && (
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: '#FEE2E2',
                        color: '#DC2626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <FileText size={20} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          color: '#1E293B',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {headerFileName || 'sample_document.pdf'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                          {headerFileSize || 'PDF Document'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Body Preview */}
                  <div style={{
                    fontSize: '0.84rem',
                    color: '#1E293B',
                    lineHeight: '1.45',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {renderPreviewBody()}
                  </div>

                  {/* Footer & Timestamp */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '2px' }}>
                    {footerText ? (
                      <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{footerText}</span>
                    ) : (
                      <span />
                    )}
                    <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>
                      10:45 AM
                    </span>
                  </div>

                  {/* Button Pills Preview */}
                  {buttons.length > 0 && (
                    <div style={{ borderTop: '1px solid #F1F5F9', marginTop: '6px', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {buttons.map((b, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '6px',
                            textAlign: 'center',
                            color: '#0E7490',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          {b.type === 'URL' && <ExternalLink size={13} />}
                          {b.type === 'PHONE_NUMBER' && <Phone size={13} />}
                          <span>{b.text || 'Action Button'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="crm-editor-footer">
          <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
            Saving as Draft keeps it local in PostgreSQL. Submitting to Meta triggers official approval.
          </div>

          <div className="crm-editor-footer-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isSubmitting}
              style={{
                padding: '9px 16px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#64748B',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isSubmitting}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: '1px solid #0E7490',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Save size={15} />
              <span>{isSaving ? 'Saving Draft...' : 'Save Draft'}</span>
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || isSubmitting}
              style={{
                padding: '9px 20px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#0E7490',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(14,116,144,0.2)'
              }}
            >
              <Send size={15} />
              <span>{isSubmitting ? 'Submitting to Meta...' : 'Submit to Meta'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
