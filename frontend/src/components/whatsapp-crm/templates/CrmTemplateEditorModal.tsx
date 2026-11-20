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
  ExternalLink,
  Phone,
  MessageSquare,
  Sparkles,
  FileText,
  UploadCloud,
  Image as ImageIcon,
  Video as VideoIcon,
  FolderOpen,
  Eye
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
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sanitize initial body text to fix awkward dangling "at ." or double spacing before period
  useEffect(() => {
    if (initialTemplate?.bodyText) {
      const sanitized = initialTemplate.bodyText
        .replace(/Thank you for connecting with VRM Structures at \./g, 'Thank you for connecting with VRM Structures.')
        .replace(/Thank you for connecting with VRM Structures  \./g, 'Thank you for connecting with VRM Structures.');
      setBodyText(sanitized);
    }
  }, [initialTemplate]);

  // Parse variables from body text
  useEffect(() => {
    const matches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const uniqueVars = Array.from(new Set(matches)).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10);
      const numB = parseInt(b.replace(/\D/g, ''), 10);
      return numA - numB;
    });
    setBodyVariables(uniqueVars);

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
    const fErrors: Record<string, string> = {};
    const cleanName = name.toLowerCase().trim();

    if (!cleanName) {
      errors.push('Template name is required.');
      fErrors.name = 'Template name is required.';
    } else if (!/^[a-z0-9_]+$/.test(cleanName)) {
      errors.push('Template name must be lowercase alphanumeric with underscores only (e.g. order_shipped_v1).');
      fErrors.name = 'Only lowercase letters, numbers, and underscores allowed.';
    }

    if (!bodyText.trim()) {
      errors.push('Message body text cannot be empty.');
      fErrors.bodyText = 'Message body text cannot be empty.';
    } else if (bodyText.length > 1024) {
      errors.push('Body text exceeds 1,024 characters limit.');
      fErrors.bodyText = 'Body text exceeds 1,024 characters limit.';
    }

    if (footerText && footerText.length > 60) {
      errors.push('Footer text exceeds 60 characters limit.');
      fErrors.footerText = 'Max 60 characters.';
    }

    if (headerType === 'TEXT' && headerContent.length > 60) {
      errors.push('Header text exceeds 60 characters limit.');
      fErrors.headerContent = 'Max 60 characters.';
    }

    if (forSubmission && (headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT')) {
      if (!headerFileDataUrl && !headerSample) {
        const msg = `Please upload a sample ${headerType.toLowerCase()} file for Meta review verification.`;
        errors.push(msg);
        fErrors.header = msg;
      }
    }

    // Variable sequence verification: {{1}}, {{2}} must be sequential starting at 1
    const foundNums = bodyVariables.map(v => parseInt(v.replace(/\D/g, ''), 10));
    for (let i = 1; i <= foundNums.length; i++) {
      if (!foundNums.includes(i)) {
        const msg = `Variable numbers must be sequential. Missing {{${i}}}.`;
        errors.push(msg);
        fErrors.variables = msg;
        break;
      }
    }

    if (forSubmission) {
      for (let i = 1; i <= bodyVariables.length; i++) {
        if (!bodySampleValues[i] || !bodySampleValues[i].trim()) {
          const msg = `Please provide an example value for variable {{${i}}}.`;
          errors.push(msg);
          fErrors[`sample_${i}`] = 'Example value required by Meta.';
        }
      }
    }

    // Buttons validation
    buttons.forEach((btn, idx) => {
      if (!btn.text || !btn.text.trim()) {
        errors.push(`Button #${idx + 1} label is required.`);
        fErrors[`btn_${idx}_text`] = 'Label required.';
      } else if (btn.text.length > 25) {
        errors.push(`Button #${idx + 1} label exceeds 25 characters.`);
        fErrors[`btn_${idx}_text`] = 'Max 25 chars.';
      }
      if (btn.type === 'URL' && (!btn.url || !btn.url.trim().startsWith('http'))) {
        errors.push(`Button #${idx + 1} requires a valid URL (http/https).`);
        fErrors[`btn_${idx}_url`] = 'Valid URL required.';
      }
      if (btn.type === 'PHONE_NUMBER' && (!btn.phoneNumber || !btn.phoneNumber.replace(/\D/g, ''))) {
        errors.push(`Button #${idx + 1} requires a valid phone number.`);
        fErrors[`btn_${idx}_phone`] = 'Phone required.';
      }
    });

    setValidationErrors(errors);
    setFieldErrors(fErrors);
    if (errors.length > 0) {
      setMobileTab('form');
    }
    return errors.length === 0;
  };

  const getPayload = (): Partial<CrmTemplate> => {
    const sampleArr: string[] = [];
    for (let i = 1; i <= bodyVariables.length; i++) {
      sampleArr.push(bodySampleValues[i] || `Value${i}`);
    }

    // Sanitize bodyText before payload generation
    const sanitizedBody = bodyText.trim()
      .replace(/Thank you for connecting with VRM Structures at \./g, 'Thank you for connecting with VRM Structures.')
      .replace(/Thank you for connecting with VRM Structures  \./g, 'Thank you for connecting with VRM Structures.');

    return {
      ...(initialTemplate?.id ? { id: initialTemplate.id } : {}),
      name: name.toLowerCase().trim(),
      category,
      language,
      headerType,
      headerContent: headerType === 'TEXT' ? headerContent.trim() : headerFileName || (headerType !== 'NONE' ? headerType : null),
      headerExample: headerFileDataUrl ? [headerFileDataUrl] : headerSample ? [headerSample] : null,
      bodyText: sanitizedBody,
      bodyExampleValues: sampleArr,
      footerText: footerText.trim() || null,
      buttons: buttons.length > 0 ? buttons : null
    };
  };

  const handleSave = async () => {
    setSubmissionError(null);
    setSubmissionSuccess(null);
    if (!validateTemplate(false)) return;
    setIsSaving(true);
    try {
      await onSaveDraft(getPayload());
      setSubmissionSuccess('Template draft saved locally!');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setSubmissionError(`Save Draft Failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmissionError(null);
    setSubmissionSuccess(null);
    if (!validateTemplate(true)) return;

    // Clicking Cancel must preserve the form and make no submission
    const confirmed = window.confirm(
      `Submit "${name}" to Meta for official review? Meta review usually takes a few minutes.`
    );
    if (!confirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (onSubmitToMeta) {
        await onSubmitToMeta(getPayload());
      } else {
        await onSaveDraft({ ...getPayload(), status: 'PENDING' });
      }
      setSubmissionSuccess(`Template "${name}" submitted to Meta for official review successfully!`);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      // Keep modal open, preserve all form inputs & uploaded file, show readable error
      setSubmissionError(err.message || 'Meta template submission failed.');
      setMobileTab('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPreviewBody = () => {
    if (!bodyText) return 'Type your message body to preview it here...';
    if (previewMode === 'raw') return bodyText;

    let rendered = bodyText;
    bodyVariables.forEach((v, idx) => {
      const num = idx + 1;
      const sample = bodySampleValues[num] || `[Example ${num}]`;
      rendered = rendered.split(v).join(sample);
    });

    // Enforce clean sentence without dangling "at ." or double space before period
    rendered = rendered
      .replace(/Thank you for connecting with VRM Structures at \./g, 'Thank you for connecting with VRM Structures.')
      .replace(/Thank you for connecting with VRM Structures  \./g, 'Thank you for connecting with VRM Structures.');

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
    <div className="crm-editor-modal-wrapper" onClick={onClose}>
      <div className="crm-editor-modal-container" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="crm-editor-modal-header">
          <div className="crm-editor-header-left">
            <div className="crm-editor-header-icon">
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 className="crm-editor-header-title">
                {initialTemplate ? 'Edit WhatsApp Template' : 'Create Message Template'}
              </h3>
              <p className="crm-editor-header-sub">
                Meta WhatsApp Business Cloud API Template
              </p>
            </div>
          </div>

          <div className="crm-editor-header-right">
            {/* Mobile Form / Preview Toggle */}
            <div className="crm-editor-mobile-toggle">
              <button
                type="button"
                onClick={() => setMobileTab('form')}
                className={`crm-editor-mobile-tab ${mobileTab === 'form' ? 'active' : ''}`}
              >
                Form
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('preview')}
                className={`crm-editor-mobile-tab ${mobileTab === 'preview' ? 'active' : ''}`}
              >
                <Eye size={13} />
                <span>Preview</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="crm-icon-btn"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body - 2 Columns on Desktop (Editor + Live Preview) */}
        <div className={`crm-editor-grid mobile-tab-${mobileTab}`}>
          {/* LEFT: Template Form Editor */}
          <div className="crm-editor-form-col">
            {submissionError && (
              <div className="crm-editor-submission-error">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <strong>Submission Failed:</strong> {submissionError}
                </div>
                <button
                  type="button"
                  onClick={() => setSubmissionError(null)}
                  className="crm-search-clear"
                  style={{ alignSelf: 'flex-start', margin: '-4px -4px 0 0' }}
                  aria-label="Dismiss error"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {submissionSuccess && (
              <div className="crm-editor-submission-success">
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  {submissionSuccess}
                </div>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="crm-editor-validation-alert">
                <div className="crm-editor-validation-title">
                  <AlertCircle size={15} /> Please fix the following before submitting:
                </div>
                <ul>
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Template Identity */}
            <div className="crm-editor-identity-row">
              <div className="crm-form-field">
                <label className="crm-form-label">Template Name *</label>
                <input
                  type="text"
                  placeholder="e.g. appointment_reminder_v1"
                  value={name}
                  onChange={e => {
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                    if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: '' }));
                  }}
                  className="crm-form-input crm-mono-input"
                />
                <span className="crm-form-hint">lowercase, numbers, underscores</span>
                {fieldErrors.name && (
                  <span className="crm-field-inline-error">{fieldErrors.name}</span>
                )}
              </div>

              <div className="crm-form-field">
                <label className="crm-form-label">Category *</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as CrmTemplateCategory)}
                  className="crm-form-input"
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </div>

              <div className="crm-form-field">
                <label className="crm-form-label">Language *</label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="crm-form-input"
                >
                  {languagesList.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Header Section */}
            <div className="crm-editor-section-box">
              <div className="crm-editor-section-head">
                <span className="crm-editor-section-title">Header (Optional)</span>
                <span className="crm-editor-section-sub">Title, image, video, or document</span>
              </div>

              <div className="crm-filter-chips">
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
                    className={`crm-chip ${headerType === type ? 'active' : ''}`}
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
                    className="crm-form-input"
                  />
                  <div className="crm-char-counter">{headerContent.length} / 60</div>
                </div>
              )}

              {(headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT') && (
                <div className="crm-editor-media-box">
                  <div className="crm-editor-media-mode-row">
                    <span className="crm-form-label" style={{ marginBottom: 0 }}>
                      {headerType === 'IMAGE' ? 'Header Image' : headerType === 'VIDEO' ? 'Header Video' : 'Header Document'}
                    </span>
                    <div className="crm-segmented-mini">
                      <button
                        type="button"
                        onClick={() => setMediaInputMode('upload')}
                        className={mediaInputMode === 'upload' ? 'active' : ''}
                      >
                        Upload File
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaInputMode('url')}
                        className={mediaInputMode === 'url' ? 'active' : ''}
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
                          if (fieldErrors.header) setFieldErrors(prev => ({ ...prev, header: '' }));
                        }}
                        className="crm-form-input"
                      />
                      <span className="crm-form-hint">
                        Publicly accessible URL to a sample {headerType.toLowerCase()} file for Meta review.
                      </span>
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
                            if (fieldErrors.header) setFieldErrors(prev => ({ ...prev, header: '' }));
                          }
                        }}
                        style={{ display: 'none' }}
                      />

                      {!headerFileDataUrl ? (
                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          className={`crm-upload-dropzone ${isDragging ? 'dragging' : ''}`}
                        >
                          <UploadCloud size={22} className="crm-upload-icon" />
                          <div className="crm-upload-title">
                            Drag & drop {headerType.toLowerCase()} file here, or
                          </div>
                          <label htmlFor="template-header-media-input" className="crm-btn-sm-primary" style={{ cursor: 'pointer', display: 'inline-flex', margin: '8px 0' }}>
                            <FolderOpen size={14} />
                            <span>Browse File</span>
                          </label>
                          <div className="crm-form-hint">
                            {headerType === 'IMAGE' && 'PNG, JPG, JPEG or WEBP (Max 5MB)'}
                            {headerType === 'VIDEO' && 'MP4, 3GPP (Max 16MB)'}
                            {headerType === 'DOCUMENT' && 'PDF, DOC, DOCX (Max 100MB)'}
                          </div>
                        </div>
                      ) : (
                        <div className="crm-uploaded-file-card">
                          <div className="crm-uploaded-file-info">
                            {headerType === 'IMAGE' ? (
                              <img src={headerFileDataUrl} alt="Thumbnail" className="crm-uploaded-thumb" />
                            ) : headerType === 'VIDEO' ? (
                              <div className="crm-uploaded-icon-box"><VideoIcon size={20} /></div>
                            ) : (
                              <div className="crm-uploaded-icon-box doc"><FileText size={20} /></div>
                            )}

                            <div className="crm-uploaded-meta">
                              <div className="crm-uploaded-name">
                                {headerFileName || `Uploaded ${headerType}`}
                              </div>
                              <div className="crm-uploaded-sub">
                                <CheckCircle2 size={12} />
                                <span>{headerFileSize ? `${headerFileSize} • Ready` : 'Uploaded & Ready'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="crm-uploaded-actions">
                            <label htmlFor="template-header-media-input" className="crm-btn-sm-outline" style={{ cursor: 'pointer' }}>
                              Change
                            </label>
                            <button
                              type="button"
                              onClick={handleRemoveHeaderFile}
                              className="crm-row-action-btn danger"
                              title="Remove File"
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
              {fieldErrors.header && (
                <span className="crm-field-inline-error" style={{ marginTop: '8px' }}>{fieldErrors.header}</span>
              )}
            </div>

            {/* Message Body Section */}
            <div className="crm-form-field">
              <div className="crm-editor-section-head">
                <label className="crm-form-label" style={{ marginBottom: 0 }}>Message Body *</label>
                <button
                  type="button"
                  onClick={handleInsertVariable}
                  className="crm-btn-sm-outline"
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
                onChange={e => {
                  setBodyText(e.target.value);
                  if (fieldErrors.bodyText) setFieldErrors(prev => ({ ...prev, bodyText: '' }));
                }}
                className="crm-form-textarea"
              />
              <div className="crm-editor-body-hint-row">
                <span>Use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code> for dynamic personalization.</span>
                <span>{bodyText.length} / 1024</span>
              </div>
              {fieldErrors.bodyText && (
                <span className="crm-field-inline-error">{fieldErrors.bodyText}</span>
              )}
              {fieldErrors.variables && (
                <span className="crm-field-inline-error">{fieldErrors.variables}</span>
              )}
            </div>

            {/* Dynamic Variable Sample Values Inputs */}
            {bodyVariables.length > 0 && (
              <div className="crm-editor-samples-box">
                <div className="crm-editor-samples-head">
                  <Sparkles size={15} />
                  <span>Variable Sample Values (Required by Meta)</span>
                </div>
                <div className="crm-editor-samples-grid">
                  {bodyVariables.map((v, idx) => {
                    const num = idx + 1;
                    return (
                      <div key={v}>
                        <label className="crm-form-label">Sample for {v} *</label>
                        <input
                          type="text"
                          placeholder={num === 1 ? 'e.g. Ramesh Kumar' : num === 2 ? 'e.g. ₹5,000' : 'e.g. Tomorrow'}
                          value={bodySampleValues[num] || ''}
                          onChange={e => {
                            setBodySampleValues({ ...bodySampleValues, [num]: e.target.value });
                            if (fieldErrors[`sample_${num}`]) {
                              setFieldErrors(prev => ({ ...prev, [`sample_${num}`]: '' }));
                            }
                          }}
                          className="crm-form-input"
                        />
                        {fieldErrors[`sample_${num}`] && (
                          <span className="crm-field-inline-error">{fieldErrors[`sample_${num}`]}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer Section */}
            <div className="crm-form-field">
              <label className="crm-form-label">Footer Text (Optional, max 60 chars)</label>
              <input
                type="text"
                maxLength={60}
                placeholder="e.g. Reply STOP to opt out"
                value={footerText}
                onChange={e => setFooterText(e.target.value)}
                className="crm-form-input"
              />
              <div className="crm-char-counter">{footerText.length} / 60</div>
            </div>

            {/* Interactive Buttons Section */}
            <div className="crm-editor-section-box">
              <div className="crm-editor-section-head" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <span className="crm-editor-section-title">
                  Interactive Buttons ({buttons.length}/3)
                </span>
                <div className="crm-editor-btn-adders">
                  <button
                    type="button"
                    onClick={() => handleAddButton('QUICK_REPLY')}
                    disabled={buttons.length >= 3}
                    className="crm-btn-sm-outline"
                  >
                    + Quick Reply
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddButton('URL')}
                    disabled={buttons.length >= 3}
                    className="crm-btn-sm-outline"
                  >
                    + Website URL
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddButton('PHONE_NUMBER')}
                    disabled={buttons.length >= 3}
                    className="crm-btn-sm-outline"
                  >
                    + Call Phone
                  </button>
                </div>
              </div>

              {buttons.map((btn, idx) => (
                <div key={idx} style={{ marginBottom: '8px' }}>
                  <div className="crm-editor-button-row">
                    <span className="crm-editor-button-type">{btn.type}</span>

                    <input
                      type="text"
                      placeholder="Button Label"
                      value={btn.text}
                      onChange={e => {
                        const updated = [...buttons];
                        updated[idx].text = e.target.value;
                        setButtons(updated);
                        if (fieldErrors[`btn_${idx}_text`]) {
                          setFieldErrors(prev => ({ ...prev, [`btn_${idx}_text`]: '' }));
                        }
                      }}
                      className="crm-form-input"
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
                          if (fieldErrors[`btn_${idx}_url`]) {
                            setFieldErrors(prev => ({ ...prev, [`btn_${idx}_url`]: '' }));
                          }
                        }}
                        className="crm-form-input"
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
                          if (fieldErrors[`btn_${idx}_phone`]) {
                            setFieldErrors(prev => ({ ...prev, [`btn_${idx}_phone`]: '' }));
                          }
                        }}
                        className="crm-form-input"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveButton(idx)}
                      className="crm-row-action-btn danger"
                      title="Remove Button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {fieldErrors[`btn_${idx}_text`] && (
                    <span className="crm-field-inline-error">{fieldErrors[`btn_${idx}_text`]}</span>
                  )}
                  {fieldErrors[`btn_${idx}_url`] && (
                    <span className="crm-field-inline-error">{fieldErrors[`btn_${idx}_url`]}</span>
                  )}
                  {fieldErrors[`btn_${idx}_phone`] && (
                    <span className="crm-field-inline-error">{fieldErrors[`btn_${idx}_phone`]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Clean WhatsApp Message Preview */}
          <div className="crm-editor-preview-col">
            <div className="crm-editor-preview-toolbar">
              <span className="crm-editor-preview-label">WhatsApp Message Preview</span>
              <div className="crm-segmented-mini">
                <button
                  type="button"
                  onClick={() => setPreviewMode('sample')}
                  className={previewMode === 'sample' ? 'active' : ''}
                >
                  Sample
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('raw')}
                  className={previewMode === 'raw' ? 'active' : ''}
                >
                  Raw
                </button>
              </div>
            </div>

            <div className="crm-preview-device-card">
              <div className="crm-preview-chat-header">
                <div className="crm-preview-chat-avatar">B</div>
                <div>
                  <div className="crm-preview-chat-title">BUSINZ Enterprise</div>
                  <div className="crm-preview-chat-sub">Official Business Account</div>
                </div>
              </div>

              <div className="crm-preview-chat-surface">
                <div className="crm-preview-message-bubble">
                  {headerType === 'TEXT' && headerContent && (
                    <div className="crm-preview-msg-header">{headerContent}</div>
                  )}

                  {headerType === 'IMAGE' && (
                    <div className="crm-preview-msg-media">
                      {(headerFileDataUrl || headerSample) ? (
                        <img
                          src={headerFileDataUrl || headerSample}
                          alt="WhatsApp Header Preview"
                        />
                      ) : (
                        <div className="crm-preview-media-empty">
                          <ImageIcon size={20} />
                          <span>Image Header Preview</span>
                        </div>
                      )}
                    </div>
                  )}

                  {headerType === 'VIDEO' && (
                    <div className="crm-preview-msg-media dark">
                      {(headerFileDataUrl || headerSample) ? (
                        <video src={headerFileDataUrl || headerSample} controls />
                      ) : (
                        <div className="crm-preview-media-empty">
                          <VideoIcon size={20} />
                          <span>Video Header Preview</span>
                        </div>
                      )}
                    </div>
                  )}

                  {headerType === 'DOCUMENT' && (
                    <div className="crm-preview-msg-doc">
                      <FileText size={18} className="crm-preview-doc-icon" />
                      <div className="crm-preview-doc-meta">
                        <div className="crm-preview-doc-name">{headerFileName || 'sample_document.pdf'}</div>
                        <div className="crm-preview-doc-sub">{headerFileSize || 'PDF Document'}</div>
                      </div>
                    </div>
                  )}

                  <div className="crm-preview-msg-body">
                    {renderPreviewBody()}
                  </div>

                  <div className="crm-preview-msg-meta">
                    <span>{footerText || ''}</span>
                    <span>10:45 AM</span>
                  </div>

                  {buttons.length > 0 && (
                    <div className="crm-preview-msg-buttons">
                      {buttons.map((b, idx) => (
                        <div key={idx} className="crm-preview-msg-btn">
                          {b.type === 'URL' && <ExternalLink size={12} />}
                          {b.type === 'PHONE_NUMBER' && <Phone size={12} />}
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
          <div className="crm-editor-footer-note">
            Save as Draft locally or submit directly to Meta Cloud API for review.
          </div>

          <div className="crm-editor-footer-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isSubmitting}
              className="crm-btn-secondary"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isSubmitting}
              className="crm-btn-outline-teal"
            >
              <Save size={15} />
              <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving || isSubmitting}
              className="crm-btn-primary"
            >
              {isSubmitting ? (
                <>
                  <span className="crm-spinner-sm" />
                  <span>Submitting to Meta...</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>Submit to Meta</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
