import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Upload,
  RefreshCw,
  RotateCw,
  RotateCcw,
  Crop,
  Check,
  X,
  AlertTriangle,
  Zap,
  Maximize2,
  ZoomIn,
  Sliders,
  ShieldCheck,
  Info
} from 'lucide-react';
import {
  CardCorners,
  Point,
  detectCardCorners,
  warpPerspective,
  rotateCanvas,
  analyzeImageQuality,
  ImageQualityReport,
  loadImage
} from '../../utils/cardImageProcessor';

export interface ScanResult {
  originalImageBase64: string;
  croppedImageBase64: string;
  mimeType: string;
  qualityReport: ImageQualityReport;
}

interface VisitingCardScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (result: ScanResult) => void;
  initialMode?: 'camera' | 'upload';
  existingImage?: string | null;
  initialStep?: ScanStep;
}

type ScanStep = 'capture' | 'crop' | 'preview';

export const VisitingCardScannerModal: React.FC<VisitingCardScannerModalProps> = ({
  isOpen,
  onClose,
  onScanComplete,
  initialMode = 'camera',
  existingImage,
  initialStep = 'capture'
}) => {
  const [step, setStep] = useState<ScanStep>(initialStep);
  const [captureTab, setCaptureTab] = useState<'camera' | 'upload'>(initialMode);

  // Sync mode and step whenever modal opens or initialMode prop changes
  useEffect(() => {
    if (isOpen) {
      setCaptureTab(initialMode);
      setStep(initialStep);
      setCameraError(null);
    }
  }, [isOpen, initialMode, initialStep]);

  // Camera states (Detect if device is truly mobile - on desktop/laptop default to 'user' webcam)
  const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>(isMobile ? 'environment' : 'user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Stable refs to prevent re-creation of startCamera and eliminate camera blinking loops
  const cameraFacingRef = useRef<'environment' | 'user'>(isMobile ? 'environment' : 'user');
  const selectedDeviceIdRef = useRef<string>('');
  const videoDevicesRef = useRef<MediaDeviceInfo[]>([]);
  const isStartingCameraRef = useRef<boolean>(false);

  useEffect(() => {
    cameraFacingRef.current = cameraFacing;
  }, [cameraFacing]);

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  useEffect(() => {
    videoDevicesRef.current = videoDevices;
  }, [videoDevices]);

  // Enumerate video devices once when modal opens, sorting physical cameras before virtual drivers (e.g. NVIDIA Broadcast)
  useEffect(() => {
    if (isOpen && typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devs => {
        const vDevs = devs.filter(d => d.kind === 'videoinput');
        const sorted = [...vDevs].sort((a, b) => {
          const aVirt = /nvidia|broadcast|virtual|obs|snap|droidcam|iriun|manycam|vmix/i.test(a.label || '');
          const bVirt = /nvidia|broadcast|virtual|obs|snap|droidcam|iriun|manycam|vmix/i.test(b.label || '');
          if (aVirt && !bVirt) return 1;
          if (!aVirt && bVirt) return -1;
          return 0;
        });
        videoDevicesRef.current = sorted;
        setVideoDevices(sorted);
        if (sorted.length > 0 && !selectedDeviceIdRef.current) {
          selectedDeviceIdRef.current = sorted[0].deviceId;
          setSelectedDeviceId(sorted[0].deviceId);
        }
      }).catch(() => {});
    }
  }, [isOpen]);

  // Raw Image states
  const [originalImageBase64, setOriginalImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Crop & Perspective states
  const [corners, setCorners] = useState<CardCorners | null>(null);
  const [activeCorner, setActiveCorner] = useState<keyof CardCorners | null>(null);
  const [loupePoint, setLoupePoint] = useState<Point | null>(null);
  const [loupeVisible, setLoupeVisible] = useState<boolean>(false);

  // Cropped Preview states
  const [croppedCanvas, setCroppedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [croppedBase64, setCroppedBase64] = useState<string | null>(null);
  const [qualityReport, setQualityReport] = useState<ImageQualityReport | null>(null);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  // 1. Camera Lifecycle Management with Progressive Constraints Fallback
  const startCamera = useCallback(async (forcedDeviceId?: string, forcedFacing?: 'environment' | 'user') => {
    if (isStartingCameraRef.current) return;
    isStartingCameraRef.current = true;
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.');
      }

      // Stop previous stream tracks cleanly
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach(t => {
            try {
              t.stop();
              t.enabled = false;
            } catch {}
          });
        } catch {}
        streamRef.current = null;
      }
      if (videoRef.current && videoRef.current.srcObject) {
        try {
          const s = videoRef.current.srcObject as MediaStream;
          s.getTracks?.().forEach(t => {
            try {
              t.stop();
              t.enabled = false;
            } catch {}
          });
        } catch {}
        videoRef.current.srcObject = null;
      }

      // Small delay on Windows to ensure hardware driver releases exclusive lock
      await new Promise(r => setTimeout(r, 60));

      const activeDevId = forcedDeviceId || selectedDeviceIdRef.current;
      const facing = forcedFacing || cameraFacingRef.current;
      const devices = videoDevicesRef.current;

      let stream: MediaStream | null = null;
      let lastErr: any = null;

      // 1. Try selected device first if specified
      if (activeDevId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: activeDevId } }
          });
        } catch (devErr) {
          console.warn('Selected camera device failed, trying alternatives:', devErr);
          lastErr = devErr;
        }
      }

      // 2. If primary failed or not set, try every available enumerated device
      if (!stream && devices.length > 0) {
        for (const dev of devices) {
          if (dev.deviceId === activeDevId) continue;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: dev.deviceId } }
            });
            if (stream) {
              selectedDeviceIdRef.current = dev.deviceId;
              setSelectedDeviceId(dev.deviceId);
              break;
            }
          } catch (altErr) {
            console.warn(`Camera ${dev.label} failed:`, altErr);
            lastErr = altErr;
          }
        }
      }

      // 3. If still no stream, try progressive constraint candidates
      if (!stream) {
        const constraintCandidates: MediaStreamConstraints[] = isMobile
          ? [
              { video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
              { video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } },
              { video: { facingMode: facing } },
              { video: true }
            ]
          : [
              { video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
              { video: { facingMode: 'user' } },
              { video: true }
            ];

        for (const candidate of constraintCandidates) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(candidate);
            if (stream) break;
          } catch (candErr: any) {
            lastErr = candErr;
          }
        }
      }

      if (!stream) {
        throw lastErr || new Error('Could not start video source');
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.warn('Play error:', e));
        };
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Video play warning:', playErr);
        }
        setCameraActive(true);
        setCameraError(null);
      }

      // Check torch support
      const track = stream.getVideoTracks()[0];
      const capabilities: any = track?.getCapabilities?.() || {};
      setHasTorch(Boolean(capabilities.torch));
    } catch (err: any) {
      console.warn('Camera access error:', err);
      const isNotAllowed = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      const isNotFound = err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('No camera detected');
      const isNotReadable = err.name === 'NotReadableError' || err.name === 'TrackStartError';

      let errMsg = 'Could not start video source. Camera may be busy or permissions not granted.';
      if (isNotAllowed) {
        errMsg = 'Camera permission was denied. Please allow camera access in your browser address bar.';
      } else if (isNotFound) {
        errMsg = 'No camera found on your computer or device. Please attach a camera or use "Upload Image" instead.';
      } else if (isNotReadable) {
        errMsg = 'Camera is currently locked by another application (Microsoft Teams, Windows Camera, or another browser window). Close other camera apps, select another camera in the dropdown, or choose a photo file.';
      } else if (err.message) {
        errMsg = err.message;
      }

      setCameraError(errMsg);
      setCameraActive(false);
    } finally {
      isStartingCameraRef.current = false;
    }
  }, [isMobile]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => {
          try {
            t.stop();
            t.enabled = false;
          } catch (e) {
            console.warn('Track stop error', e);
          }
        });
      } catch (err) {
        console.warn('Error stopping stream tracks:', err);
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        if (videoRef.current.srcObject) {
          const s = videoRef.current.srcObject as MediaStream;
          s.getTracks?.().forEach(t => {
            try {
              t.stop();
              t.enabled = false;
            } catch (e) {
              console.warn('Video srcObject track stop error', e);
            }
          });
          videoRef.current.srcObject = null;
        }
        videoRef.current.pause();
      } catch (err) {
        console.warn('Error pausing video:', err);
      }
    }
    setTorchOn(false);
    setCameraActive(false);
  }, []);

  const handleModalClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  // Close modal and terminate camera on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleModalClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleModalClose]);

  useEffect(() => {
    if (isOpen && step === 'capture' && captureTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, step, captureTab, startCamera, stopCamera]);

  // Handle re-opening directly into crop mode with an existing card image
  useEffect(() => {
    if (isOpen && existingImage && initialStep === 'crop') {
      loadImage(existingImage).then(img => {
        setOriginalImageBase64(existingImage);
        setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        const detected = detectCardCorners(img, img.naturalWidth, img.naturalHeight);
        setCorners(detected);
        setStep('crop');
      }).catch(err => {
        console.warn('Failed to load existing image for crop adjustment:', err);
      });
    } else if (isOpen && !existingImage) {
      setStep('capture');
    }
  }, [isOpen, existingImage, initialStep]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && hasTorch) {
      try {
        const next = !torchOn;
        await (track as any).applyConstraints({ advanced: [{ torch: next }] });
        setTorchOn(next);
      } catch (e) {
        console.warn('Torch constraint error:', e);
      }
    }
  };

  const toggleCameraFacing = () => {
    if (isMobile) {
      const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
      setCameraFacing(nextFacing);
      cameraFacingRef.current = nextFacing;
      startCamera(undefined, nextFacing);
    } else if (videoDevices.length > 1) {
      const currentIdx = videoDevices.findIndex(d => d.deviceId === selectedDeviceIdRef.current);
      const nextIdx = (currentIdx + 1) % videoDevices.length;
      const nextDevId = videoDevices[nextIdx].deviceId;
      setSelectedDeviceId(nextDevId);
      selectedDeviceIdRef.current = nextDevId;
      startCamera(nextDevId);
    } else {
      const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
      setCameraFacing(nextFacing);
      cameraFacingRef.current = nextFacing;
      startCamera(undefined, nextFacing);
    }
  };

  // 2. Shutter Capture
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    setImageMime('image/jpeg');
    setOriginalImageBase64(dataUrl);
    setImageNaturalSize({ width: canvas.width, height: canvas.height });

    // Initialize auto corners
    const detected = detectCardCorners(canvas, canvas.width, canvas.height);
    setCorners(detected);
    stopCamera();
    setStep('crop');
  };

  // 3. File Upload Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
      alert('Please upload a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const img = await loadImage(dataUrl);

      setImageMime(file.type);
      setOriginalImageBase64(dataUrl);
      setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });

      const detected = detectCardCorners(img, img.naturalWidth, img.naturalHeight);
      setCorners(detected);
      setStep('crop');
    };
    reader.readAsDataURL(file);
  };

  // 4. Interactive Corner Dragging with Magnifying Loupe
  const handlePointerDown = (cornerKey: keyof CardCorners, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCorner(cornerKey);
    setLoupeVisible(true);
    updateCornerPosition(cornerKey, e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeCorner || !corners) return;
    updateCornerPosition(activeCorner, e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    setActiveCorner(null);
    setLoupeVisible(false);
  };

  const updateCornerPosition = (cornerKey: keyof CardCorners, clientX: number, clientY: number) => {
    if (!cropImageRef.current || !corners) return;
    const imgEl = cropImageRef.current;
    const rect = imgEl.getBoundingClientRect();

    // Clamp pointer to image bounds on screen
    const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const clampedY = Math.max(0, Math.min(rect.height, clientY - rect.top));

    // Convert screen coordinates to natural image pixel coordinates
    const scaleX = imageNaturalSize.width / rect.width;
    const scaleY = imageNaturalSize.height / rect.height;

    const natX = Math.round(clampedX * scaleX);
    const natY = Math.round(clampedY * scaleY);

    setCorners(prev => (prev ? { ...prev, [cornerKey]: { x: natX, y: natY } } : null));
    setLoupePoint({ x: clampedX, y: clampedY });

    // Render 2.2x Magnifying Loupe
    if (loupeCanvasRef.current && cropImageRef.current) {
      const lCanvas = loupeCanvasRef.current;
      const lCtx = lCanvas.getContext('2d');
      if (lCtx) {
        lCtx.clearRect(0, 0, lCanvas.width, lCanvas.height);
        const zoom = 2.2;
        const cropBox = 60; // Natural pixels around handle

        lCtx.save();
        // Circular clipping
        lCtx.beginPath();
        lCtx.arc(lCanvas.width / 2, lCanvas.height / 2, lCanvas.width / 2, 0, Math.PI * 2);
        lCtx.clip();

        // Draw zoomed region from source image
        lCtx.drawImage(
          cropImageRef.current,
          natX - cropBox / 2,
          natY - cropBox / 2,
          cropBox,
          cropBox,
          0,
          0,
          lCanvas.width,
          lCanvas.height
        );

        // Reticle / Crosshair in brand teal
        lCtx.strokeStyle = '#0E7490';
        lCtx.lineWidth = 2;
        lCtx.beginPath();
        lCtx.moveTo(lCanvas.width / 2 - 12, lCanvas.height / 2);
        lCtx.lineTo(lCanvas.width / 2 + 12, lCanvas.height / 2);
        lCtx.moveTo(lCanvas.width / 2, lCanvas.height / 2 - 12);
        lCtx.lineTo(lCanvas.width / 2, lCanvas.height / 2 + 12);
        lCtx.stroke();

        lCtx.restore();
      }
    }
  };

  // Rotate raw image
  const handleRotateImage = async (deg: 90 | -90) => {
    if (!originalImageBase64) return;
    const img = await loadImage(originalImageBase64);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    const rotated = rotateCanvas(c, deg);
    const newBase64 = rotated.toDataURL(imageMime, 0.95);
    setOriginalImageBase64(newBase64);
    setImageNaturalSize({ width: rotated.width, height: rotated.height });

    // Reset corners to new bounds
    const detected = detectCardCorners(rotated, rotated.width, rotated.height);
    setCorners(detected);
  };

  const handleResetCorners = () => {
    if (!cropImageRef.current) return;
    const detected = detectCardCorners(
      cropImageRef.current,
      imageNaturalSize.width,
      imageNaturalSize.height
    );
    setCorners(detected);
  };

  const handleFullImageCorners = () => {
    setCorners({
      topLeft: { x: 0, y: 0 },
      topRight: { x: imageNaturalSize.width, y: 0 },
      bottomRight: { x: imageNaturalSize.width, y: imageNaturalSize.height },
      bottomLeft: { x: 0, y: imageNaturalSize.height }
    });
  };

  // 5. Apply Perspective Warp and Analyze Quality
  const handleApplyCrop = async () => {
    if (!originalImageBase64 || !corners) return;
    const img = await loadImage(originalImageBase64);

    // Unwarp perspective
    const warped = warpPerspective(img, corners);
    setCroppedCanvas(warped);

    // High quality JPEG compressed to ~150KB for fast 1-2s Gemini OCR transfer
    const dataUrl = warped.toDataURL('image/jpeg', 0.85);
    setCroppedBase64(dataUrl);

    // Run quality analyzer
    const report = analyzeImageQuality(warped);
    setQualityReport(report);

    setStep('preview');
  };

  // 6. Complete and return to form
  const handleProceedToExtraction = () => {
    if (!originalImageBase64 || !croppedBase64 || !qualityReport) return;
    stopCamera();
    onScanComplete({
      originalImageBase64,
      croppedImageBase64: croppedBase64,
      mimeType: 'image/jpeg',
      qualityReport
    });
    onClose();
  };

  const handleRetake = () => {
    setStep('capture');
    setOriginalImageBase64(null);
    setCroppedBase64(null);
    setCroppedCanvas(null);
    setCorners(null);
    setQualityReport(null);
    if (captureTab === 'camera') {
      startCamera();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #E2E8F0'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#ECFEFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0E7490'
              }}
            >
              <Camera size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {step === 'capture' && 'Capture Visiting Card'}
                {step === 'crop' && 'Adjust Card Boundaries & Perspective'}
                {step === 'preview' && 'Review Cropped Card Before AI Scan'}
              </h2>
              <p style={{ fontSize: '13px', color: '#64748B', margin: '2px 0 0 0' }}>
                {step === 'capture' && 'High-resolution document capture with automatic boundary detection'}
                {step === 'crop' && 'Drag corner pins to align edges and correct optical skew'}
                {step === 'preview' && 'Inspect straightened card and image quality assessment'}
              </p>
            </div>
          </div>

          <button
            onClick={handleModalClose}
            style={{
              padding: '8px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#F1F5F9',
              color: '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s'
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#F8FAFC' }}>
          {/* STEP 1: CAPTURE / UPLOAD */}
          {step === 'capture' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Tab Selector */}
              <div
                style={{
                  display: 'flex',
                  alignSelf: 'center',
                  backgroundColor: '#E2E8F0',
                  padding: '4px',
                  borderRadius: '12px',
                  gap: '4px'
                }}
              >
                <button
                  type="button"
                  onClick={() => setCaptureTab('camera')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: captureTab === 'camera' ? '#FFFFFF' : 'transparent',
                    color: captureTab === 'camera' ? '#0E7490' : '#64748B',
                    boxShadow: captureTab === 'camera' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  <Camera size={16} /> Live Camera
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureTab('upload')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: captureTab === 'upload' ? '#FFFFFF' : 'transparent',
                    color: captureTab === 'upload' ? '#0E7490' : '#64748B',
                    boxShadow: captureTab === 'upload' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s'
                  }}
                >
                  <Upload size={16} /> Upload Image
                </button>
              </div>

              {/* Camera View */}
              {captureTab === 'camera' && (
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '460px',
                    backgroundColor: '#0F172A',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                  }}
                >
                  {cameraError ? (
                    <div style={{ textAlign: 'center', padding: '24px 20px', color: '#F87171', maxWidth: '540px', margin: '0 auto' }}>
                      <AlertTriangle size={44} style={{ margin: '0 auto 10px auto' }} />
                      <p style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px', color: '#FCA5A5' }}>
                        Camera Inaccessible
                      </p>
                      <p style={{ fontSize: '13px', color: '#E2E8F0', marginBottom: '14px', lineHeight: '1.5' }}>
                        {cameraError}
                      </p>

                      {videoDevices.length > 1 && (
                        <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#94A3B8' }}>Select Camera:</span>
                          <select
                            value={selectedDeviceId}
                            onChange={(e) => {
                              const newDevId = e.target.value;
                              setSelectedDeviceId(newDevId);
                              selectedDeviceIdRef.current = newDevId;
                              startCamera(newDevId);
                            }}
                            style={{
                              backgroundColor: '#1E293B',
                              color: '#F8FAFC',
                              border: '1px solid #475569',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                          >
                            {videoDevices.map((d, i) => (
                              <option key={d.deviceId || i} value={d.deviceId}>
                                {d.label || `Camera ${i + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
                        <button
                          type="button"
                          onClick={() => startCamera()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '9px 18px',
                            backgroundColor: '#0E7490',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '13px',
                            boxShadow: '0 2px 4px rgba(14, 116, 144, 0.3)'
                          }}
                        >
                          <RefreshCw size={15} /> Retry Camera
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCaptureTab('upload');
                            setTimeout(() => {
                              fileInputRef.current?.click();
                            }, 60);
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '9px 18px',
                            backgroundColor: '#334155',
                            color: '#F1F5F9',
                            border: '1px solid #475569',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '13px'
                          }}
                        >
                          <Upload size={15} /> Choose Photo File
                        </button>
                      </div>

                      {/* Quick Windows Troubleshooting Card */}
                      <div style={{
                        backgroundColor: 'rgba(30, 41, 59, 0.85)',
                        border: '1px solid rgba(71, 85, 105, 0.5)',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        textAlign: 'left',
                        fontSize: '12px',
                        color: '#CBD5E1',
                        lineHeight: 1.6
                      }}>
                        <div style={{ fontWeight: 600, color: '#38BDF8', marginBottom: '4px' }}>
                          🔧 How to fix on Windows:
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px' }}>
                          <li><strong>Windows Settings:</strong> Open <em>Settings &gt; Privacy &amp; security &gt; Camera</em> &rarr; Turn <strong>ON</strong> "Let desktop apps access your camera".</li>
                          <li><strong>Close other apps:</strong> Ensure Teams, Zoom, Skype, or Windows Camera app aren't using the webcam.</li>
                          <li><strong>Camera slider:</strong> Check if your laptop has a physical privacy slider closed over the lens.</li>
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />

                      {/* Apple Document Scanner Card Viewfinder Guide */}
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          pointerEvents: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {/* Shaded backdrop cutout */}
                        <div
                          style={{
                            width: '84%',
                            maxWidth: '540px',
                            height: '310px',
                            borderRadius: '16px',
                            border: '2px solid rgba(14, 116, 144, 0.8)',
                            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
                            position: 'relative'
                          }}
                        >
                          {/* Corner brackets */}
                          <div
                            style={{
                              position: 'absolute',
                              top: '-2px',
                              left: '-2px',
                              width: '24px',
                              height: '24px',
                              borderTop: '4px solid #06B6D4',
                              borderLeft: '4px solid #06B6D4',
                              borderTopLeftRadius: '16px'
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: '-2px',
                              right: '-2px',
                              width: '24px',
                              height: '24px',
                              borderTop: '4px solid #06B6D4',
                              borderRight: '4px solid #06B6D4',
                              borderTopRightRadius: '16px'
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '-2px',
                              left: '-2px',
                              width: '24px',
                              height: '24px',
                              borderBottom: '4px solid #06B6D4',
                              borderLeft: '4px solid #06B6D4',
                              borderBottomLeftRadius: '16px'
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '-2px',
                              right: '-2px',
                              width: '24px',
                              height: '24px',
                              borderBottom: '4px solid #06B6D4',
                              borderRight: '4px solid #06B6D4',
                              borderBottomRightRadius: '16px'
                            }}
                          />


                        </div>
                      </div>

                      {/* Top Camera Controls */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '16px',
                          right: '16px',
                          display: 'flex',
                          gap: '10px'
                        }}
                      >
                        {hasTorch && (
                          <button
                            type="button"
                            onClick={toggleTorch}
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '9999px',
                              backgroundColor: torchOn ? '#F59E0B' : 'rgba(15, 23, 42, 0.75)',
                              color: '#FFFFFF',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backdropFilter: 'blur(4px)'
                            }}
                            title="Toggle Torch"
                          >
                            <Zap size={18} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={toggleCameraFacing}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '9999px',
                            backgroundColor: 'rgba(15, 23, 42, 0.75)',
                            color: '#FFFFFF',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backdropFilter: 'blur(4px)'
                          }}
                          title="Flip Camera"
                        >
                          <RefreshCw size={18} />
                        </button>
                      </div>

                      {/* Bottom Shutter Button (iPhone Document Scanner Style) */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '24px',
                          left: '50%',
                          transform: 'translateX(-50%)'
                        }}
                      >
                        <button
                          type="button"
                          onClick={handleCapturePhoto}
                          style={{
                            width: '72px',
                            height: '72px',
                            borderRadius: '9999px',
                            backgroundColor: '#FFFFFF',
                            border: '4px solid #0E7490',
                            padding: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                            transition: 'transform 0.1s ease-in-out'
                          }}
                          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
                          onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                          title="Capture Document Photo"
                        >
                          <div
                            style={{
                              width: '54px',
                              height: '54px',
                              borderRadius: '9999px',
                              backgroundColor: '#0E7490'
                            }}
                          />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* File Upload View */}
              {captureTab === 'upload' && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: '100%',
                    height: '380px',
                    borderRadius: '16px',
                    border: '2px dashed #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                    gap: '14px',
                    padding: '24px',
                    textAlign: 'center'
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.[0]) {
                      const input = fileInputRef.current;
                      if (input) {
                        input.files = e.dataTransfer.files;
                        handleFileChange({ target: input } as any);
                      }
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      backgroundColor: '#ECFEFF',
                      color: '#0E7490',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Upload size={30} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0' }}>
                      Choose or Drag Visiting Card Image
                    </h3>
                    <p style={{ fontSize: '13px', color: '#64748B', margin: 0, maxWidth: '340px' }}>
                      Supports high-resolution JPG, PNG, and WEBP. Original character clarity is preserved without destructive compression.
                    </p>
                  </div>
                  <button
                    type="button"
                    style={{
                      marginTop: '8px',
                      padding: '8px 20px',
                      borderRadius: '10px',
                      backgroundColor: '#0E7490',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Browse Files
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: ADJUST CORNERS & PERSPECTIVE */}
          {step === 'crop' && originalImageBase64 && corners && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Instructions & Toolset */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                  backgroundColor: '#FFFFFF',
                  padding: '12px 18px',
                  borderRadius: '14px',
                  border: '1px solid #E2E8F0'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '13px', fontWeight: 600 }}>
                  <Crop size={16} style={{ color: '#0E7490' }} />
                  Drag the 4 corner pins onto the card edges. The magnifying loupe shows pixel alignment.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleRotateImage(-90)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Rotate Counter-Clockwise"
                  >
                    <RotateCcw size={14} /> 90°
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRotateImage(90)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Rotate Clockwise"
                  >
                    <RotateCw size={14} /> 90°
                  </button>
                  <button
                    type="button"
                    onClick={handleResetCorners}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Reset to Auto Detected"
                  >
                    Auto Detect
                  </button>
                  <button
                    type="button"
                    onClick={handleFullImageCorners}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                    title="Select Full Image"
                  >
                    <Maximize2 size={14} /> Full Image
                  </button>
                </div>
              </div>

              {/* Interactive Crop Canvas Area */}
              <div
                ref={cropContainerRef}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '460px',
                  backgroundColor: '#0F172A',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  userSelect: 'none',
                  touchAction: 'none'
                }}
              >
                {/* Image */}
                <img
                  ref={cropImageRef}
                  src={originalImageBase64}
                  alt="Visiting Card Crop"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                />

                {/* SVG Overlay for Quad Boundary Lines & Translucent Mask */}
                {cropImageRef.current && (
                  <svg
                    style={{
                      position: 'absolute',
                      top: cropImageRef.current.offsetTop,
                      left: cropImageRef.current.offsetLeft,
                      width: cropImageRef.current.clientWidth,
                      height: cropImageRef.current.clientHeight,
                      pointerEvents: 'none'
                    }}
                  >
                    {(() => {
                      const img = cropImageRef.current;
                      if (!img) return null;
                      const sX = img.clientWidth / imageNaturalSize.width;
                      const sY = img.clientHeight / imageNaturalSize.height;

                      const pTL = { x: corners.topLeft.x * sX, y: corners.topLeft.y * sY };
                      const pTR = { x: corners.topRight.x * sX, y: corners.topRight.y * sY };
                      const pBR = { x: corners.bottomRight.x * sX, y: corners.bottomRight.y * sY };
                      const pBL = { x: corners.bottomLeft.x * sX, y: corners.bottomLeft.y * sY };

                      const pointsStr = `${pTL.x},${pTL.y} ${pTR.x},${pTR.y} ${pBR.x},${pBR.y} ${pBL.x},${pBL.y}`;

                      return (
                        <>
                          {/* Inner Quad Highlight */}
                          <polygon
                            points={pointsStr}
                            fill="rgba(14, 116, 144, 0.16)"
                            stroke="#0E7490"
                            strokeWidth="2.5"
                            strokeDasharray="4 2"
                          />
                        </>
                      );
                    })()}
                  </svg>
                )}

                {/* 4 Interactive Draggable Corner Pins */}
                {cropImageRef.current &&
                  (['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as (keyof CardCorners)[]).map(key => {
                    const img = cropImageRef.current;
                    if (!img) return null;
                    const sX = img.clientWidth / imageNaturalSize.width;
                    const sY = img.clientHeight / imageNaturalSize.height;
                    const pt = corners[key];
                    const left = img.offsetLeft + pt.x * sX;
                    const top = img.offsetTop + pt.y * sY;

                    return (
                      <div
                        key={key}
                        onPointerDown={e => handlePointerDown(key, e)}
                        style={{
                          position: 'absolute',
                          left: `${left}px`,
                          top: `${top}px`,
                          width: '32px',
                          height: '32px',
                          transform: 'translate(-50%, -50%)',
                          cursor: 'grab',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 20
                        }}
                      >
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '9999px',
                            backgroundColor: activeCorner === key ? '#06B6D4' : '#0E7490',
                            border: '3px solid #FFFFFF',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                            transition: 'transform 0.1s, background-color 0.1s'
                          }}
                        />
                      </div>
                    );
                  })}

                {/* Apple Document Scanner Magnifying Loupe Lens */}
                {loupeVisible && loupePoint && cropImageRef.current && (
                  <div
                    style={{
                      position: 'absolute',
                      left: `${cropImageRef.current.offsetLeft + loupePoint.x}px`,
                      top: `${cropImageRef.current.offsetTop + loupePoint.y - 75}px`,
                      transform: 'translate(-50%, -50%)',
                      width: '84px',
                      height: '84px',
                      borderRadius: '9999px',
                      border: '3px solid #FFFFFF',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                      overflow: 'hidden',
                      pointerEvents: 'none',
                      zIndex: 100,
                      backgroundColor: '#0F172A'
                    }}
                  >
                    <canvas
                      ref={loupeCanvasRef}
                      width={84}
                      height={84}
                      style={{ width: '100%', height: '100%', display: 'block' }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW BEFORE EXTRACTION */}
          {step === 'preview' && croppedBase64 && qualityReport && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Quality Assessment Alerts */}
              {qualityReport.warnings.length > 0 ? (
                <div
                  style={{
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #F59E0B',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    color: '#92400E'
                  }}
                >
                  <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700 }}>
                      Image Quality Notice ({qualityReport.warnings.length} warning{qualityReport.warnings.length > 1 ? 's' : ''})
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
                      {qualityReport.warnings.map((w, idx) => (
                        <li key={idx} style={{ marginTop: '2px' }}>
                          {w}
                        </li>
                      ))}
                    </ul>
                    <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#B45309' }}>
                      For maximum extraction accuracy, you can retake the photo under even lighting, or proceed to scan anyway.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: '#DCFCE7',
                    border: '1px solid #22C55E',
                    borderRadius: '12px',
                    padding: '12px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#166534',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  <ShieldCheck size={18} />
                  Image quality verified: Sharp contrast, clear text, and glare-free ({qualityReport.width}×{qualityReport.height}px).
                </div>
              )}

              {/* Preview Card Display */}
              <div
                style={{
                  width: '100%',
                  height: '400px',
                  backgroundColor: '#0F172A',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  overflow: 'hidden'
                }}
              >
                <img
                  src={croppedBase64}
                  alt="Straightened Visiting Card"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF'
          }}
        >
          {step === 'capture' && (
            <>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                {captureTab === 'camera' && (
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    disabled={!cameraActive}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 24px',
                      borderRadius: '12px',
                      backgroundColor: cameraActive ? '#0E7490' : '#94A3B8',
                      color: '#FFFFFF',
                      fontSize: '14px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: cameraActive ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <Camera size={16} /> Snap Photo
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'crop' && (
            <>
              <button
                type="button"
                onClick={handleRetake}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={15} /> Retake
              </button>

              <button
                type="button"
                onClick={handleApplyCrop}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 26px',
                  borderRadius: '12px',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(14, 116, 144, 0.2)'
                }}
              >
                Crop & Straighten Card <Check size={16} />
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setStep('crop')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 18px',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Crop size={15} /> Adjust Corners
                </button>
                <button
                  type="button"
                  onClick={handleRetake}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 18px',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={15} /> Retake
                </button>
              </div>

              <button
                type="button"
                onClick={handleProceedToExtraction}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 28px',
                  borderRadius: '12px',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(14, 116, 144, 0.3)'
                }}
              >
                <Check size={16} /> Extract Contact Details
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
