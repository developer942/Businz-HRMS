import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
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
  ShieldCheck,
  Image as ImageIcon,
  ChevronLeft
} from 'lucide-react';
import {
  CardCorners,
  Point,
  detectCardCorners,
  warpPerspective,
  rotateCanvas,
  analyzeImageQuality,
  ImageQualityReport,
  loadImage,
  prepareImageForOcr
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

  // Lock browser body scroll while full-screen scanner is open; restore on close
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isOpen]);

  // Camera states (Detect if device is truly mobile - on desktop/laptop default to 'user' webcam)
  const isMobile = typeof navigator !== 'undefined' && (
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '') ||
    (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 2)
  );
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
        // Only pre-select a specific device ID on non-mobile desktop devices.
        // On mobile/smartphones, deviceId pinning overrides facingMode and blocks switching to back camera.
        if (!isMobile && sorted.length > 0 && !selectedDeviceIdRef.current) {
          selectedDeviceIdRef.current = sorted[0].deviceId;
          setSelectedDeviceId(sorted[0].deviceId);
        }
      }).catch(() => {});
    }
  }, [isOpen, isMobile]);

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
  const [, setCroppedCanvas] = useState<HTMLCanvasElement | null>(null);
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

      // Small delay on Windows/iOS to ensure hardware driver releases exclusive lock
      await new Promise(r => setTimeout(r, 80));

      const facing = forcedFacing || cameraFacingRef.current;
      const isFacingSwitch = Boolean(forcedFacing) || isMobile;
      const activeDevId = forcedDeviceId || (!isFacingSwitch ? selectedDeviceIdRef.current : '');
      const devices = videoDevicesRef.current;

      let stream: MediaStream | null = null;
      let lastErr: any = null;

      // 1. Mobile or Explicit Facing Request: prioritize facingMode ('environment' = Back, 'user' = Front)
      if (isFacingSwitch) {
        const mobileCandidates: MediaStreamConstraints[] = [
          // 1. Exact facing mode with the highest resolution the camera offers (sharper small print = better OCR)
          { video: { facingMode: { exact: facing }, width: { ideal: 3840 }, height: { ideal: 2160 } } },
          // 2. Exact facing mode with full HD
          { video: { facingMode: { exact: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          // 3. Ideal facing mode with high resolution
          { video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          // 4. Ideal facing mode with standard resolution
          { video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          // 5. Loose facing
          { video: { facingMode: facing } },
          // 6. Basic video fallback
          { video: true }
        ];

        for (const candidate of mobileCandidates) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(candidate);
            if (stream) break;
          } catch (candErr: any) {
            lastErr = candErr;
          }
        }
      } else {
        // 2. Desktop Path: device ID selection
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
              lastErr = altErr;
            }
          }
        }

        if (!stream) {
          const desktopCandidates: MediaStreamConstraints[] = [
            { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } },
            { video: { facingMode: 'user' } },
            { video: true }
          ];

          for (const candidate of desktopCandidates) {
            try {
              stream = await navigator.mediaDevices.getUserMedia(candidate);
              if (stream) break;
            } catch (candErr: any) {
              lastErr = candErr;
            }
          }
        }
      }

      if (!stream) {
        throw lastErr || new Error('Could not start video source');
      }

      streamRef.current = stream;

      // Extract active track settings
      const track = stream.getVideoTracks()[0];
      const settings: any = track?.getSettings?.() || {};
      if (settings.facingMode) {
        setCameraFacing(settings.facingMode as 'environment' | 'user');
        cameraFacingRef.current = settings.facingMode as 'environment' | 'user';
      } else if (forcedFacing) {
        setCameraFacing(forcedFacing);
        cameraFacingRef.current = forcedFacing;
      }
      if (settings.deviceId) {
        selectedDeviceIdRef.current = settings.deviceId;
        setSelectedDeviceId(settings.deviceId);
      }

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
      const capabilities: any = track?.getCapabilities?.() || {};
      setHasTorch(Boolean(capabilities.torch));
    } catch (err: any) {
      console.warn('Camera access error:', err);
      const isNotAllowed = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      const isNotFound = err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError' || err.message?.includes('No camera detected');
      const isNotReadable = err.name === 'NotReadableError' || err.name === 'TrackStartError';

      let errMsg = 'Could not start video source. Camera may be busy or permissions not granted.';
      if (isNotAllowed) {
        errMsg = 'Camera permission was denied. Please allow camera access in your browser address bar or upload an image from your gallery.';
      } else if (isNotFound) {
        errMsg = 'No camera found on your device. Please attach a camera or choose a photo from your gallery.';
      } else if (isNotReadable) {
        errMsg = 'Camera is currently in use by another application. Close other camera apps or choose a photo from your gallery.';
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

  const toggleCameraFacing = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const settings: any = track?.getSettings?.() || {};
    const currentTrackFacing = settings.facingMode as 'environment' | 'user' | undefined;
    const currentFacing = currentTrackFacing || cameraFacingRef.current;
    const nextFacing: 'environment' | 'user' = currentFacing === 'environment' ? 'user' : 'environment';

    selectedDeviceIdRef.current = '';
    setSelectedDeviceId('');
    setCameraFacing(nextFacing);
    cameraFacingRef.current = nextFacing;

    stopCamera();
    await new Promise(r => setTimeout(r, 120));
    await startCamera(undefined, nextFacing);
  };

  // 2. Shutter Capture (iPhone-style: capture -> scan immediately, no manual crop step)
  const isFinishingRef = useRef(false);

  const finishWithFullFrame = async (source: string | HTMLImageElement | HTMLCanvasElement) => {
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;
    try {
      const prepared = await prepareImageForOcr(source);
      const report = analyzeImageQuality(prepared.canvas);
      stopCamera();
      onScanComplete({
        originalImageBase64: prepared.dataUrl,
        croppedImageBase64: prepared.dataUrl,
        mimeType: 'image/jpeg',
        qualityReport: report
      });
      onClose();
    } catch (err) {
      console.warn('Fast scan preparation failed, falling back to manual crop:', err);
      if (typeof source === 'string') {
        const img = await loadImage(source);
        setImageMime('image/jpeg');
        setOriginalImageBase64(source);
        setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setCorners(detectCardCorners(img, img.naturalWidth, img.naturalHeight));
        stopCamera();
        setStep('crop');
      }
    } finally {
      isFinishingRef.current = false;
    }
  };

  const handleCapturePhoto = async () => {
    if (!videoRef.current || isFinishingRef.current) return;
    const video = videoRef.current;

    // Prefer the camera's full-resolution, auto-focused still photo (Chrome/Android); fall back to the video frame
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      const ImageCaptureCtor = (window as any).ImageCapture;
      if (track && ImageCaptureCtor) {
        const capture = new ImageCaptureCtor(track);
        const blob: Blob = await Promise.race([
          capture.takePhoto(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('takePhoto timeout')), 2500))
        ]);
        if (blob && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          try {
            const img = await loadImage(url);
            await finishWithFullFrame(img);
            return;
          } finally {
            URL.revokeObjectURL(url);
          }
        }
      }
    } catch (e) {
      console.warn('takePhoto unavailable, using video frame:', e);
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    await finishWithFullFrame(canvas);
  };

  // 3. File Upload Handler (scan immediately after choosing the photo)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
      alert('Please upload a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    const url = URL.createObjectURL(file);
    loadImage(url)
      .then(img => finishWithFullFrame(img))
      .catch(err => {
        console.warn('Could not read selected image:', err);
        alert('Could not read this image. Please try another photo.');
      })
      .finally(() => {
        URL.revokeObjectURL(url);
        e.target.value = '';
      });
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

    const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const clampedY = Math.max(0, Math.min(rect.height, clientY - rect.top));

    const scaleX = imageNaturalSize.width / rect.width;
    const scaleY = imageNaturalSize.height / rect.height;

    const natX = Math.round(clampedX * scaleX);
    const natY = Math.round(clampedY * scaleY);

    setCorners(prev => (prev ? { ...prev, [cornerKey]: { x: natX, y: natY } } : null));
    setLoupePoint({ x: clampedX, y: clampedY });

    if (loupeCanvasRef.current && cropImageRef.current) {
      const lCanvas = loupeCanvasRef.current;
      const lCtx = lCanvas.getContext('2d');
      if (lCtx) {
        lCtx.clearRect(0, 0, lCanvas.width, lCanvas.height);
        const cropBox = 60;

        lCtx.save();
        lCtx.beginPath();
        lCtx.arc(lCanvas.width / 2, lCanvas.height / 2, lCanvas.width / 2, 0, Math.PI * 2);
        lCtx.clip();

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

    const warped = warpPerspective(img, corners);
    setCroppedCanvas(warped);

    const dataUrl = warped.toDataURL('image/jpeg', 0.85);
    setCroppedBase64(dataUrl);

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

  const isLiveCameraFullscreen = step === 'capture' && captureTab === 'camera';

  const scannerContent = (
    <div
      className="visiting-card-scanner-fullscreen-root"
      role="dialog"
      aria-modal="true"
      aria-label="Scan Visiting Card"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '-webkit-fill-available',
        zIndex: 999999,
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none'
      }}
    >
      {/* Shared Hidden File Input for Gallery / File Selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ====================================================================
          MODE A: FULL-VIEWPORT NATIVE CAMERA SCANNER
          ==================================================================== */}
      {isLiveCameraFullscreen ? (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
            backgroundColor: '#000000'
          }}
        >
          {/* Full-Bleed Live Camera Feed */}
          {!cameraError && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                zIndex: 1,
                backgroundColor: '#000000'
              }}
            />
          )}

          {/* Subtle Business Card Alignment Frame Overlay */}
          {!cameraError && (
            <div
              className="scanner-viewfinder-layer"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '76px 20px 136px 20px',
                boxSizing: 'border-box'
              }}
            >
              <div
                className="scanner-card-guide-frame"
                style={{
                  width: 'min(86vw, 460px)',
                  aspectRatio: '1.586 / 1',
                  maxHeight: '46dvh',
                  borderRadius: '18px',
                  border: '1.5px solid rgba(255, 255, 255, 0.38)',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.48)',
                  position: 'relative',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Top-Left Corner Bracket */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    left: '-2px',
                    width: '28px',
                    height: '28px',
                    borderTop: '3.5px solid #22D3EE',
                    borderLeft: '3.5px solid #22D3EE',
                    borderTopLeftRadius: '18px'
                  }}
                />
                {/* Top-Right Corner Bracket */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    width: '28px',
                    height: '28px',
                    borderTop: '3.5px solid #22D3EE',
                    borderRight: '3.5px solid #22D3EE',
                    borderTopRightRadius: '18px'
                  }}
                />
                {/* Bottom-Left Corner Bracket */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-2px',
                    left: '-2px',
                    width: '28px',
                    height: '28px',
                    borderBottom: '3.5px solid #22D3EE',
                    borderLeft: '3.5px solid #22D3EE',
                    borderBottomLeftRadius: '18px'
                  }}
                />
                {/* Bottom-Right Corner Bracket */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '-2px',
                    right: '-2px',
                    width: '28px',
                    height: '28px',
                    borderBottom: '3.5px solid #22D3EE',
                    borderRight: '3.5px solid #22D3EE',
                    borderBottomRightRadius: '18px'
                  }}
                />
              </div>

              {/* Instruction Pill */}
              <div
                style={{
                  marginTop: '20px',
                  padding: '8px 18px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(15, 23, 42, 0.76)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  color: '#F8FAFC',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  letterSpacing: '0.01em',
                  textAlign: 'center',
                  maxWidth: '90vw'
                }}
              >
                Place the visiting card within the frame
              </div>
            </div>
          )}

          {/* Top Overlay Bar: Close (Left), Title & Desktop Camera Selector (Center), Flip Camera (Right) */}
          <div
            style={{
              position: 'relative',
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
              paddingBottom: '16px',
              paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
              background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0) 100%)'
            }}
          >
            <button
              type="button"
              onClick={handleModalClose}
              aria-label="Close scanner"
              title="Close"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(255, 255, 255, 0.14)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <span
                style={{
                  color: '#FFFFFF',
                  fontSize: '1rem',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  textShadow: '0 1px 3px rgba(0, 0, 0, 0.4)'
                }}
              >
                Scan Visiting Card
              </span>

              {!isMobile && videoDevices.length > 1 && (
                <select
                  value={selectedDeviceId}
                  onChange={e => {
                    const newDevId = e.target.value;
                    setSelectedDeviceId(newDevId);
                    selectedDeviceIdRef.current = newDevId;
                    startCamera(newDevId);
                  }}
                  aria-label="Select camera device"
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    color: '#F8FAFC',
                    border: '1px solid rgba(255, 255, 255, 0.22)',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    maxWidth: '220px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {videoDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="button"
              onClick={toggleCameraFacing}
              aria-label="Switch camera"
              title="Switch Camera"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(255, 255, 255, 0.14)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <RefreshCw size={19} />
            </button>
          </div>

          {/* Camera Error / Permission Denied Fallback inside Fullscreen Layer */}
          {cameraError && (
            <div
              style={{
                position: 'relative',
                zIndex: 15,
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                overflowY: 'auto'
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '420px',
                  backgroundColor: 'rgba(15, 23, 42, 0.92)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '20px',
                  padding: '24px 20px',
                  textAlign: 'center',
                  color: '#F8FAFC'
                }}
              >
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(239, 68, 68, 0.16)',
                    color: '#F87171',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px auto'
                  }}
                >
                  <AlertTriangle size={26} />
                </div>

                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF' }}>
                  Camera Unavailable
                </h3>
                <p style={{ margin: '0 0 18px 0', fontSize: '0.84rem', color: '#CBD5E1', lineHeight: 1.5 }}>
                  {cameraError}
                </p>

                {videoDevices.length > 1 && (
                  <div style={{ marginBottom: '16px' }}>
                    <select
                      value={selectedDeviceId}
                      onChange={e => {
                        const newDevId = e.target.value;
                        setSelectedDeviceId(newDevId);
                        selectedDeviceIdRef.current = newDevId;
                        startCamera(newDevId);
                      }}
                      style={{
                        width: '100%',
                        minHeight: '42px',
                        backgroundColor: '#1E293B',
                        color: '#F8FAFC',
                        border: '1px solid #475569',
                        padding: '8px 12px',
                        borderRadius: '10px',
                        fontSize: '0.84rem',
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '100%',
                      minHeight: '46px',
                      borderRadius: '12px',
                      backgroundColor: '#0E7490',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <Upload size={17} /> Upload Photo from Gallery
                  </button>

                  <button
                    type="button"
                    onClick={() => startCamera()}
                    style={{
                      width: '100%',
                      minHeight: '44px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      color: '#F8FAFC',
                      border: '1px solid rgba(255, 255, 255, 0.18)',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={15} /> Retry Camera
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Controls Bar: Gallery (Left), Large Shutter Button (Center), Flash / Cancel (Right) */}
          <div
            style={{
              position: 'relative',
              zIndex: 20,
              paddingTop: '18px',
              paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
              paddingLeft: 'max(24px, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(24px, env(safe-area-inset-right, 0px))',
              background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0) 100%)'
            }}
          >
            <div
              style={{
                maxWidth: '420px',
                margin: '0 auto',
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                justifyItems: 'center'
              }}
            >
              {/* Left: Gallery / Upload Image */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  padding: '4px 10px'
                }}
                title="Choose Photo from Gallery"
              >
                <span
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.22)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <ImageIcon size={20} />
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#E2E8F0' }}>
                  Gallery
                </span>
              </button>

              {/* Center: Large Native Shutter Control */}
              <button
                type="button"
                onClick={handleCapturePhoto}
                disabled={!cameraActive}
                aria-label="Capture visiting card photo"
                title="Capture Photo"
                style={{
                  width: '76px',
                  height: '76px',
                  borderRadius: '9999px',
                  border: '4px solid #FFFFFF',
                  backgroundColor: 'transparent',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: cameraActive ? 'pointer' : 'not-allowed',
                  opacity: cameraActive ? 1 : 0.45,
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
                  transition: 'transform 0.12s ease, opacity 0.15s ease'
                }}
              >
                <span
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '9999px',
                    backgroundColor: '#FFFFFF',
                    display: 'block'
                  }}
                />
              </button>

              {/* Right: Flash / Torch (when supported) or Cancel / Upload Fallback */}
              {hasTorch ? (
                <button
                  type="button"
                  onClick={toggleTorch}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    padding: '4px 10px'
                  }}
                  title="Toggle Flash"
                >
                  <span
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '9999px',
                      backgroundColor: torchOn ? '#F59E0B' : 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.22)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Zap size={20} />
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#E2E8F0' }}>
                    {torchOn ? 'Flash On' : 'Flash'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleModalClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    padding: '4px 10px'
                  }}
                  title="Cancel"
                >
                  <span
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.22)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <X size={20} />
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#E2E8F0' }}>
                    Cancel
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ====================================================================
           MODE B: UPLOAD / CROP / PREVIEW FULL-VIEWPORT SHEET
           ==================================================================== */
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#F8FAFC',
            color: '#0F172A',
            overflow: 'hidden'
          }}
        >
          {/* Clean Top App Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
              paddingBottom: '12px',
              paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
              backgroundColor: '#FFFFFF',
              borderBottom: '1px solid #E2E8F0',
              flexShrink: 0
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (step === 'preview') {
                  setStep('crop');
                } else if (step === 'crop') {
                  handleRetake();
                } else {
                  handleModalClose();
                }
              }}
              style={{
                minHeight: '40px',
                padding: '0 10px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '0.84rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
            >
              <ChevronLeft size={17} />
              <span>{step === 'capture' ? 'Close' : 'Back'}</span>
            </button>

            <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
              <h2 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {step === 'capture' && 'Upload Visiting Card'}
                {step === 'crop' && 'Adjust Card Boundaries'}
                {step === 'preview' && 'Review Cropped Card'}
              </h2>
            </div>

            <button
              type="button"
              onClick={handleModalClose}
              aria-label="Close"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
                color: '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px max(16px, env(safe-area-inset-right, 0px)) 20px max(16px, env(safe-area-inset-left, 0px))',
              maxWidth: '880px',
              width: '100%',
              margin: '0 auto',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
          >
            {/* STEP 1 (UPLOAD TAB): FILE DROPZONE OR SWITCH TO CAMERA */}
            {step === 'capture' && captureTab === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, justifyContent: 'center' }}>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: '100%',
                    minHeight: '320px',
                    borderRadius: '18px',
                    border: '1.5px dashed #94A3B8',
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    gap: '14px',
                    padding: '28px 20px',
                    textAlign: 'center',
                    boxSizing: 'border-box'
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
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '16px',
                      backgroundColor: '#ECFEFF',
                      color: '#0E7490',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Upload size={28} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0' }}>
                      Choose or Drag Visiting Card Photo
                    </h3>
                    <p style={{ fontSize: '0.84rem', color: '#64748B', margin: 0, maxWidth: '340px', lineHeight: 1.45 }}>
                      Supports JPG, PNG, and WEBP. AI OCR automatically extracts contact details.
                    </p>
                  </div>
                  <button
                    type="button"
                    style={{
                      marginTop: '6px',
                      minHeight: '44px',
                      padding: '0 22px',
                      borderRadius: '12px',
                      backgroundColor: '#0E7490',
                      color: '#FFFFFF',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Select Photo
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setCaptureTab('camera')}
                  style={{
                    minHeight: '46px',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <Camera size={17} color="#0E7490" /> Switch to Live Camera
                </button>
              </div>
            )}

            {/* STEP 2: ADJUST CORNERS & PERSPECTIVE */}
            {step === 'crop' && originalImageBase64 && corners && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    backgroundColor: '#FFFFFF',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', fontSize: '0.82rem', fontWeight: 600 }}>
                    <Crop size={16} style={{ color: '#0E7490', flexShrink: 0 }} />
                    <span>Drag the 4 corner pins to align card edges</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleRotateImage(-90)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        minHeight: '36px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#475569',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <RotateCcw size={14} /> 90°
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRotateImage(90)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        minHeight: '36px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#475569',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <RotateCw size={14} /> 90°
                    </button>
                    <button
                      type="button"
                      onClick={handleResetCorners}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        minHeight: '36px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#475569',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Auto Detect
                    </button>
                    <button
                      type="button"
                      onClick={handleFullImageCorners}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        minHeight: '36px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#475569',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Maximize2 size={14} /> Full Image
                    </button>
                  </div>
                </div>

                <div
                  ref={cropContainerRef}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  style={{
                    position: 'relative',
                    width: '100%',
                    flex: 1,
                    minHeight: '340px',
                    maxHeight: '62dvh',
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
                          <polygon
                            points={pointsStr}
                            fill="rgba(14, 116, 144, 0.16)"
                            stroke="#0E7490"
                            strokeWidth="2.5"
                            strokeDasharray="4 2"
                          />
                        );
                      })()}
                    </svg>
                  )}

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
                            width: '36px',
                            height: '36px',
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
                              boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                            }}
                          />
                        </div>
                      );
                    })}

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                {qualityReport.warnings.length > 0 ? (
                  <div
                    style={{
                      backgroundColor: '#FEF3C7',
                      border: '1px solid #F59E0B',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      color: '#92400E'
                    }}
                  >
                    <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.86rem', fontWeight: 700 }}>
                        Image Quality Notice
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem' }}>
                        {qualityReport.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      backgroundColor: '#DCFCE7',
                      border: '1px solid #BBF7D0',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      color: '#166534',
                      fontSize: '0.84rem',
                      fontWeight: 600
                    }}
                  >
                    <ShieldCheck size={18} />
                    <span>Image quality verified ({qualityReport.width}×{qualityReport.height}px)</span>
                  </div>
                )}

                <div
                  style={{
                    width: '100%',
                    flex: 1,
                    minHeight: '300px',
                    maxHeight: '60dvh',
                    backgroundColor: '#0F172A',
                    borderRadius: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    overflow: 'hidden',
                    boxSizing: 'border-box'
                  }}
                >
                  <img
                    src={croppedBase64}
                    alt="Straightened Visiting Card"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: '8px'
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Action Bar for Upload / Crop / Preview */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              paddingTop: '14px',
              paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
              paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
              paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
              borderTop: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              flexShrink: 0
            }}
          >
            {step === 'capture' && (
              <button
                type="button"
                onClick={handleModalClose}
                style={{
                  minHeight: '44px',
                  padding: '0 20px',
                  borderRadius: '12px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            )}

            {step === 'crop' && (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    minHeight: '46px',
                    padding: '0 18px',
                    borderRadius: '12px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    fontSize: '0.88rem',
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    minHeight: '46px',
                    padding: '0 24px',
                    borderRadius: '12px',
                    backgroundColor: '#0E7490',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    flex: 1,
                    maxWidth: '280px'
                  }}
                >
                  <span>Crop &amp; Straighten</span>
                  <Check size={16} />
                </button>
              </>
            )}

            {step === 'preview' && (
              <>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setStep('crop')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      minHeight: '46px',
                      padding: '0 14px',
                      borderRadius: '12px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Crop size={15} /> Adjust
                  </button>
                  <button
                    type="button"
                    onClick={handleRetake}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      minHeight: '46px',
                      padding: '0 14px',
                      borderRadius: '12px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '0.84rem',
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    minHeight: '46px',
                    padding: '0 22px',
                    borderRadius: '12px',
                    backgroundColor: '#0E7490',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    flex: 1,
                    maxWidth: '260px'
                  }}
                >
                  <Check size={16} />
                  <span>Use Card</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return ReactDOM.createPortal(scannerContent, document.body);
  }
  return scannerContent;
};
