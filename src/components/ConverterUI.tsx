import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Document, Packer, Paragraph, ImageRun } from "docx";
import { 
  Upload, 
  FileText, 
  X, 
  CheckCircle2, 
  Loader2, 
  Layers, 
  Zap,
  ArrowRight,
  ShieldCheck,
  History,
  Plus,
  ArrowLeftRight,
  ChevronDown,
  Settings2,
  Lock,
  Sparkles,
  Eye,
  Send,
  Image as ImageIcon,
  FileBox,
  FileType,
  Dog,
  PawPrint
} from 'lucide-react';
import { FileItem, ProcessingState, FileFormat } from '../types';
import CompressButton from './CompressButton';
import PDFPreviewModal from './PDFPreviewModal';

const FROM_FORMATS: FileFormat[] = ['AUTO', 'JPG', 'PNG', 'PDF', 'WEBP', 'DOCX', 'HEIC'];
const TO_FORMATS: FileFormat[] = ['PDF', 'DOCX', 'JPG', 'PNG', 'WEBP'];

const FORMAT_META: Record<FileFormat, { label: string; icon: any; color: string; bg: string }> = {
  'AUTO': { label: 'AUTO', icon: Sparkles, color: '#007AFF', bg: 'rgba(0,122,255,0.1)' },
  'PDF': { label: 'PDF', icon: FileText, color: '#FF3B30', bg: 'rgba(255,59,48,0.1)' },
  'JPG': { label: 'JPG', icon: ImageIcon, color: '#FF9500', bg: 'rgba(255,149,0,0.1)' },
  'PNG': { label: 'PNG', icon: ImageIcon, color: '#34C759', bg: 'rgba(52,199,89,0.1)' },
  'WEBP': { label: 'WEBP', icon: ImageIcon, color: '#5856D6', bg: 'rgba(88,86,214,0.1)' },
  'DOCX': { label: 'DOCX', icon: FileBox, color: '#007AFF', bg: 'rgba(0,122,255,0.1)' },
  'HEIC': { label: 'HEIC', icon: ImageIcon, color: '#AF52DE', bg: 'rgba(175,82,222,0.1)' },
};

const ConverterUI: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [fromFormat, setFromFormat] = useState<FileFormat>('AUTO');
  const [toFormat, setToFormat] = useState<FileFormat>('PDF');
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [metadataEnabled, setMetadataEnabled] = useState(false);
  const [metadata, setMetadata] = useState({ title: '', author: '', subject: '' });
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setShowFromDropdown(false);
        setShowToDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const detectFormat = (file: File): FileFormat => {
    const ext = file.name.split('.').pop()?.toUpperCase();
    if (ext === 'JPG' || ext === 'JPEG') return 'JPG';
    if (ext === 'PNG') return 'PNG';
    if (ext === 'PDF') return 'PDF';
    if (ext === 'WEBP') return 'WEBP';
    if (ext === 'DOCX') return 'DOCX';
    if (ext === 'HEIC') return 'HEIC';
    return 'AUTO';
  };

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles || newFiles.length === 0) return;

    const firstDetected = detectFormat(newFiles[0]);
    if (fromFormat === 'AUTO') {
      setFromFormat(firstDetected);
    }

    const fileList = Array.from(newFiles).map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      format: detectFormat(file),
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));

    setFiles((prev) => [...prev, ...fileList]);
    setProcessingState('idle');
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
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const filtered = prev.filter((f) => f.id !== id);
      const removed = prev.find(f => f.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return filtered;
    });
  };

  const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);
  const [sentToTelegram, setSentToTelegram] = useState(false);
  const [customFileName, setCustomFileName] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (processingState === 'completed' || sentToTelegram) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 150);
    }
  }, [processingState, sentToTelegram]);

  const convertToDocxOnClient = async (fileItems: FileItem[]) => {
    const children: any[] = [];
    
    for (let i = 0; i < fileItems.length; i++) {
      const fileItem = fileItems[i];
      // Update progress
      setProgress(Math.round(((i + 1) / fileItems.length) * 100));

      if (fileItem.file.type.startsWith('image/')) {
        try {
          const arrayBuffer = await fileItem.file.arrayBuffer();
          
          // Get image dimensions to maintain aspect ratio
          const img = new Image();
          const url = URL.createObjectURL(fileItem.file);
          await new Promise((resolve) => {
            img.onload = resolve;
            img.src = url;
          });
          
          const width = img.width;
          const height = img.height;
          URL.revokeObjectURL(url);

          // Standard A4 width is ~450-500 points with margins
          const maxWidth = 500;
          const scale = Math.min(1, maxWidth / width);

          children.push(
            new Paragraph({
              pageBreakBefore: i > 0,
              children: [
                new ImageRun({
                  data: new Uint8Array(arrayBuffer),
                  transformation: {
                    width: width * scale,
                    height: height * scale,
                  },
                } as any),
              ],
            })
          );
        } catch (err) {
          console.error('Error processing image for DOCX:', err);
        }
      } else {
        children.push(
          new Paragraph({
            pageBreakBefore: i > 0,
            text: `File: ${fileItem.name} (Non-image files are not supported in client-side DOCX conversion yet)`
          })
        );
      }
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: {
              width: 11906, // A4
              height: 16838,
            },
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: children,
      }],
    });

    return await Packer.toBlob(doc);
  };

  const handleConvert = async () => {
    if (files.length === 0) return;
    
    // Get Telegram WebApp info
    const tg = (window as any).Telegram?.WebApp;
    const telegramUserId = tg?.initDataUnsafe?.user?.id || tg?.initData?.user?.id;

    const isAllImages = files.every(f => f.file.type.startsWith('image/'));
    
    // Block PDF to DOCX as requested - strictly only allow JPG/PNG for phone DOCX conversion
    if (toFormat === 'DOCX' && !isAllImages) {
      const msg = "PDF нельзя конвертировать в DOCX на телефоне. Используйте только JPG/PNG.";
      if (tg?.showAlert) tg.showAlert(msg);
      else alert(msg);
      return; 
    }

    setProcessingState('processing');
    setProgress(0);
    setSentToTelegram(false);

    const extension = toFormat.toLowerCase();
    const filename = customFileName.trim() 
      ? (customFileName.toLowerCase().endsWith(`.${extension}`) ? customFileName : `${customFileName}.${extension}`)
      : (mergeMode ? `merged.${extension}` : `converted.${extension}`);

    try {
      let finalBlob: Blob;

      if (toFormat === 'DOCX' && isAllImages) {
        // CLIENT-SIDE CONVERSION for DOCX (Images only)
        console.log('Client: Starting client-side DOCX conversion');
        finalBlob = await convertToDocxOnClient(files);
      } else {
        // SERVER-SIDE CONVERSION (PDF, complex cases, etc.)
        const formData = new FormData();
        files.forEach(f => formData.append('files', f.file));
        formData.append('toFormat', toFormat);
        formData.append('mergeMode', mergeMode.toString());
        formData.append('filename', filename);

        if (telegramUserId) {
          formData.append('telegramUserId', telegramUserId.toString());
        }

        if (metadataEnabled && toFormat === 'PDF') {
          formData.append('metadata', JSON.stringify(metadata));
        }

        // Simulate progress for UI feel during server request
        const interval = setInterval(() => {
          setProgress((prev) => {
            if (prev >= 90) {
              clearInterval(interval);
              return 90;
            }
            return prev + Math.random() * 5;
          });
        }, 150);

        const response = await fetch('/api/convert', {
          method: 'POST',
          body: formData,
        });

        clearInterval(interval);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Ошибка сервера (${response.status}): ${text.substring(0, 50)}`);
        }

        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('application/json')) {
          const result = await response.json();
          if (result.success) {
            setSentToTelegram(true);
            if (tg) {
              if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
              if (tg.MainButton) {
                tg.MainButton.setText('Файл отправлен в чат');
                tg.MainButton.show();
                tg.MainButton.onClick(() => tg.close());
              }
            }
            setProgress(100);
            setTimeout(() => setProcessingState('completed'), 600);
            return;
          } else {
            throw new Error(result.error || 'Бот не смог отправить файл');
          }
        } else {
          finalBlob = await response.blob();
          setConvertedBlob(finalBlob);
          setProgress(100);
          setTimeout(() => setProcessingState('completed'), 600);
          return;
        }
      }

      // If we are here, we have a finalBlob from client-side that needs to be delivered
      if (telegramUserId) {
        const deliveryFormData = new FormData();
        deliveryFormData.append('files', finalBlob, filename);
        deliveryFormData.append('toFormat', toFormat);
        deliveryFormData.append('filename', filename);
        deliveryFormData.append('telegramUserId', telegramUserId.toString());

        const deliveryResponse = await fetch('/api/convert', {
          method: 'POST',
          body: deliveryFormData,
        });

        if (!deliveryResponse.ok) {
          throw new Error('Не удалось доставить готовый файл через сервер');
        }

        const deliveryResult = await deliveryResponse.json();
        if (deliveryResult.success) {
          setSentToTelegram(true);
          if (tg) {
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            if (tg.MainButton) {
              tg.MainButton.setText('Файл отправлен в чат');
              tg.MainButton.show();
              tg.MainButton.onClick(() => tg.close());
            }
          }
        } else {
          throw new Error(deliveryResult.error || 'Ошибка при отправке в Telegram');
        }
      } else {
        // Fallback or browser mode: we have the blob, just set it
        setConvertedBlob(finalBlob);
      }

      setProgress(100);
      setTimeout(() => setProcessingState('completed'), 600);

    } catch (error: any) {
      console.error(error);
      setProcessingState('idle');
      if (tg?.showAlert) tg.showAlert(`Ошибка: ${error.message || 'Something went wrong'}`);
    }
  };

  const handleDownload = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.close();
      return;
    }

    if (!convertedBlob) return;
    
    const url = URL.createObjectURL(convertedBlob);
    const a = document.createElement('a');
    a.href = url;
    const extension = toFormat.toLowerCase();
    a.download = customFileName.trim() 
      ? (customFileName.toLowerCase().endsWith(`.${extension}`) ? customFileName : `${customFileName}.${extension}`)
      : (mergeMode ? `merged.${extension}` : `converted.${extension}`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const swapFormats = () => {
    const temp = fromFormat;
    setFromFormat(toFormat);
    setToFormat(temp);
  };

  const reset = () => {
    setFiles([]);
    setProcessingState('idle');
    setProgress(0);
    setConvertedBlob(null);
    setSentToTelegram(false);
    setCustomFileName('');

    // Hide Telegram MainButton if it was shown
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.MainButton) {
      tg.MainButton.hide();
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-brand-obsidian text-white/90 font-sans selection:bg-brand-primary/30 premium-gradient-bg">
      <div className="mx-auto max-w-xl px-6 py-8 md:py-12 flex flex-col min-h-screen">
        
        {/* Universal Header */}
        <header className="relative flex flex-col items-center mb-12">
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="p-4 rounded-[2rem] bg-brand-primary text-white shadow-2xl shadow-brand-primary/20 relative group">
              <Dog size={32} strokeWidth={2.5} className="group-hover:scale-110 transition-transform" />
              <div className="absolute -bottom-1 -right-1 bg-brand-obsidian p-1 rounded-full border border-white/10">
                <PawPrint size={14} className="text-brand-primary" fill="currentColor" />
              </div>
            </div>
            <div className="text-center">
              <h1 className="text-4xl font-display font-black tracking-tightest leading-none mb-1">DocDog</h1>
              <div className="flex items-center justify-center gap-2">
                <div className="h-px w-3 bg-white/10" />
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-[0.5em]">Smart Converter</span>
                <div className="h-px w-3 bg-white/10" />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6 px-6 py-2.5 bg-brand-slate/50 border border-white/5 rounded-2xl backdrop-blur-md shadow-xl">
             <button className="flex items-center gap-2 text-[10px] font-bold text-white/40 hover:text-white transition-colors uppercase tracking-widest group">
               <History size={14} className="group-hover:text-brand-primary transition-colors" /> История
             </button>
             <div className="w-px h-3 bg-white/10" />
             <button className="flex items-center gap-2 text-[10px] font-bold text-white/40 hover:text-white transition-colors uppercase tracking-widest group">
               <Settings2 size={14} className="group-hover:text-brand-primary transition-colors" /> Опции
             </button>
          </div>
        </header>

        {/* Translator Style Format Selector */}
        <div 
          ref={selectorRef}
          className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2rem] flex items-center p-1.5 mb-10 relative z-[110]"
        >
          {/* From Segment */}
          <div className="relative flex-1 min-w-0">
            <button 
              type="button"
              onClick={(e) => { 
                e.stopPropagation(); 
                setShowFromDropdown(!showFromDropdown); 
                setShowToDropdown(false); 
              }}
              className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-2xl hover:bg-white/[0.05] transition-all group"
            >
              <div 
                className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center shadow-lg"
                style={{ backgroundColor: FORMAT_META[fromFormat].bg, color: FORMAT_META[fromFormat].color }}
              >
                {React.createElement(FORMAT_META[fromFormat].icon, { size: 16, strokeWidth: 2.5 })}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <span className="block text-[8px] font-bold text-white/20 uppercase tracking-[0.2em] leading-none mb-1">Источник</span>
                <span className="text-base font-display font-black tracking-tight leading-none block line-clamp-1">
                  {FORMAT_META[fromFormat].label}
                </span>
              </div>
              <ChevronDown size={14} className={`text-white/20 group-hover:text-white/40 transition-transform shrink-0 ${showFromDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            <AnimatePresence>
              {showFromDropdown && (
                <motion.div 
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  className="absolute top-full left-0 mt-3 w-52 bg-brand-slate border border-white/10 rounded-[1.8rem] p-1.5 z-[200] shadow-[0_25px_60px_rgba(0,0,0,0.6)]"
                >
                  <div className="grid gap-0.5">
                    {FROM_FORMATS.map(f => {
                      const Meta = FORMAT_META[f];
                      return (
                        <button 
                          type="button"
                          key={f}
                          onClick={(e) => { e.stopPropagation(); setFromFormat(f); setShowFromDropdown(false); }}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all ${fromFormat === f ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'hover:bg-white/5 text-white/50'}`}
                        >
                          <div className={`p-1.5 rounded-lg shrink-0 ${fromFormat === f ? 'bg-white/20' : ''}`} style={{ color: fromFormat === f ? '#fff' : Meta.color, backgroundColor: fromFormat === f ? 'transparent' : Meta.bg }}>
                            <Meta.icon size={12} strokeWidth={2.5} />
                          </div>
                          <span className="flex-1 text-left truncate">{Meta.label}</span>
                          {fromFormat === f && <PawPrint size={10} className="opacity-50 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
 
          {/* Centered Swap Button */}
          <div className="flex-none px-1 relative z-[1]">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); swapFormats(); }}
              className="h-10 w-10 flex items-center justify-center rounded-full bg-white/[0.03] border border-white/10 text-white/40 hover:bg-brand-primary hover:text-white hover:border-brand-primary hover:shadow-xl hover:shadow-brand-primary/20 transition-all active:scale-90"
            >
              <ArrowLeftRight size={16} strokeWidth={2.5} />
            </button>
          </div>
 
          {/* To Segment */}
          <div className="relative flex-1 min-w-0">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowToDropdown(!showToDropdown); setShowFromDropdown(false); }}
              className="w-full flex items-center gap-2.5 py-2.5 px-3 rounded-2xl hover:bg-white/[0.05] transition-all group"
            >
              <div 
                className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center shadow-lg"
                style={{ backgroundColor: FORMAT_META[toFormat].bg, color: FORMAT_META[toFormat].color }}
              >
                {React.createElement(FORMAT_META[toFormat].icon, { size: 16, strokeWidth: 2.5 })}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <span className="block text-[8px] font-bold text-white/20 uppercase tracking-[0.2em] leading-none mb-1">Цель</span>
                <span className="text-base font-display font-black tracking-tight leading-none block line-clamp-1">
                  {FORMAT_META[toFormat].label}
                </span>
              </div>
              <ChevronDown size={14} className={`text-white/20 group-hover:text-white/40 transition-transform shrink-0 ${showToDropdown ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showToDropdown && (
                <motion.div 
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  className="absolute top-full right-0 mt-3 w-52 bg-brand-slate border border-white/10 rounded-[1.8rem] p-1.5 z-[200] shadow-[0_25px_60px_rgba(0,0,0,0.6)]"
                >
                  <div className="grid gap-0.5">
                    {TO_FORMATS.map(f => {
                      const Meta = FORMAT_META[f];
                      return (
                        <button 
                          type="button"
                          key={f}
                          onClick={(e) => { e.stopPropagation(); setToFormat(f); setShowToDropdown(false); }}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all ${toFormat === f ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/20' : 'hover:bg-white/5 text-white/50'}`}
                        >
                          <div className={`p-1.5 rounded-lg shrink-0 ${toFormat === f ? 'bg-white/20' : ''}`} style={{ color: toFormat === f ? '#fff' : Meta.color, backgroundColor: toFormat === f ? 'transparent' : Meta.bg }}>
                            <Meta.icon size={12} strokeWidth={2.5} />
                          </div>
                          <span className="flex-1 text-left truncate">{Meta.label}</span>
                          {toFormat === f && <PawPrint size={10} className="opacity-50 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Global Options / Mode Switch */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="bg-white/5 rounded-3xl p-4 mb-2">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none mb-3">Имя выходного файла</p>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Название (например: Документ_2024)"
                value={customFileName}
                onChange={(e) => setCustomFileName(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-brand-primary/50 text-white placeholder:text-white/10 transition-all"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 italic text-[10px] pointer-events-none">
                .{toFormat.toLowerCase()}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl transition-colors ${mergeMode ? 'bg-brand-primary/10 text-brand-primary' : 'bg-white/5 text-white/20'}`}>
                <Layers size={16} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none mb-1">Режим обработки</p>
                <p className="text-xs font-bold">{mergeMode ? 'Слияние в один PDF' : 'Раздельная обработка'}</p>
              </div>
            </div>
            
            <button 
              onClick={() => {
                if (!mergeMode) setToFormat('PDF');
                setMergeMode(!mergeMode);
              }}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${mergeMode ? 'bg-brand-primary' : 'bg-white/10'}`}
            >
              <motion.div 
                animate={{ x: mergeMode ? 26 : 4 }}
                className="absolute top-1 left-0 h-4 w-4 bg-white rounded-full shadow-lg"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>

          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl transition-colors ${metadataEnabled ? 'bg-brand-primary/10 text-brand-primary' : 'bg-white/5 text-white/20'}`}>
                <Settings2 size={16} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none mb-1">Метаданные</p>
                <p className="text-xs font-bold">{metadataEnabled ? 'Включены' : 'Выключены'}</p>
              </div>
            </div>
            
            <button 
              onClick={() => setMetadataEnabled(!metadataEnabled)}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${metadataEnabled ? 'bg-brand-primary' : 'bg-white/10'}`}
            >
              <motion.div 
                animate={{ x: metadataEnabled ? 26 : 4 }}
                className="absolute top-1 left-0 h-4 w-4 bg-white rounded-full shadow-lg"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>

          <AnimatePresence>
            {metadataEnabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white/5 rounded-3xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                  <input 
                    type="text" 
                    placeholder="Заголовок"
                    value={metadata.title}
                    onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                    className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand-primary/50 text-white placeholder:text-white/20"
                  />
                  <input 
                    type="text" 
                    placeholder="Автор"
                    value={metadata.author}
                    onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                    className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand-primary/50 text-white placeholder:text-white/20"
                  />
                  <input 
                    type="text" 
                    placeholder="Тема"
                    value={metadata.subject}
                    onChange={(e) => setMetadata({ ...metadata, subject: e.target.value })}
                    className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-brand-primary/50 text-white placeholder:text-white/20"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Main Workspace Area */}
        <div className="flex-1 flex flex-col min-h-0">
          <input
            type="file" multiple ref={fileInputRef}
            onChange={(e) => addFiles(e.target.files)}
            className="absolute opacity-0 pointer-events-none w-0 h-0"
            accept="image/*,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
          <AnimatePresence mode="wait">
            {files.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -20 }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex-1 flex flex-col items-center justify-center p-10 rounded-[2.5rem] border border-white/[0.05] transition-all duration-700 cursor-pointer overflow-hidden
                  ${isDragging ? 'bg-brand-primary/[0.05] border-brand-primary ring-4 ring-brand-primary/10' : 'bg-white/[0.02] hover:bg-white/[0.04]'}
                `}
              >
                {/* Decorative particles for depth */}
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500 blur-[60px] rounded-full" />
                  <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-purple-500 blur-[60px] rounded-full" />
                </div>

                <div className="relative mb-6">
                  <motion.div 
                    animate={isDragging ? { scale: 1.1, rotate: 180 } : { scale: 1, rotate: 0 }}
                    className="h-24 w-24 rounded-[2rem] bg-white text-black shadow-2xl flex items-center justify-center"
                  >
                    <Plus size={44} strokeWidth={1.5} />
                  </motion.div>
                  <motion.div 
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-brand-primary flex items-center justify-center shadow-lg"
                  >
                    <Upload size={16} className="text-white" strokeWidth={3} />
                  </motion.div>
                </div>

                <h3 className="text-2xl font-display font-extrabold mb-3">Загрузите файлы</h3>
                <p className="text-white/40 text-sm font-medium tracking-wide max-w-[240px] text-center uppercase">
                  Нажмите на кнопку или просто перетащите файлы в окно
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col h-full gap-4"
              >
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-brand-primary" />
                    <span className="text-[11px] font-bold text-white/40 uppercase tracking-[0.2em]">Выбрано объектов: {files.length}</span>
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] font-bold text-brand-primary uppercase tracking-[0.2em] hover:opacity-80"
                  >
                    + Добавить еще
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pt-2 px-2 pb-10 space-y-4">
                  <AnimatePresence initial={false}>
                    {files.map((fileItem, idx) => (
                      <motion.div
                        key={fileItem.id}
                        initial={{ opacity: 0, x: -10, y: 10 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: idx * 0.04 }}
                        className="p-4 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-4 group hover:bg-white/[0.05] transition-all relative"
                      >
                        <div className="h-14 w-14 shrink-0 rounded-2xl bg-white/[0.05] flex items-center justify-center overflow-hidden border border-white/[0.08]">
                          {fileItem.previewUrl ? (
                            <img src={fileItem.previewUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <FileText className="text-white/20" size={24} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-bold truncate pr-8 group-hover:text-brand-primary transition-colors">{fileItem.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono font-bold text-white/20 uppercase bg-white/5 px-1.5 py-0.5 rounded-md">{formatSize(fileItem.size)}</span>
                            <div className="h-1 w-1 rounded-full bg-white/10" />
                            <div 
                              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                              style={{ backgroundColor: FORMAT_META[fileItem.format].bg, color: FORMAT_META[fileItem.format].color }}
                            >
                              {React.createElement(FORMAT_META[fileItem.format].icon, { size: 10, strokeWidth: 3 })}
                              {fileItem.format}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {(fileItem.file.type === 'application/pdf' || fileItem.name.toLowerCase().endsWith('.pdf')) && (
                            <button 
                              onClick={() => setPreviewFile(fileItem.file)}
                              className="h-10 w-10 flex items-center justify-center rounded-full text-white/20 hover:bg-white/10 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                              title="Просмотр PDF"
                            >
                              <Eye size={20} />
                            </button>
                          )}
                        </div>
                        
                        {/* Red X button at top-right - always visible for clarity */}
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeFile(fileItem.id); }}
                          className="absolute -top-1.5 -right-1.5 h-8 w-8 flex items-center justify-center rounded-full bg-red-500 text-white shadow-xl shadow-red-500/40 hover:bg-red-600 hover:scale-110 active:scale-95 transition-all z-20 border-2 border-brand-obsidian"
                          title="Удалить файл"
                        >
                          <X size={16} strokeWidth={3} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {previewFile && (
                    <PDFPreviewModal 
                      file={previewFile} 
                      onClose={() => setPreviewFile(null)} 
                    />
                  )}
                </AnimatePresence>

                {/* Bottom Action Hub */}
                <div className="pt-4 border-t border-white/[0.06]">
                  <AnimatePresence mode="wait">
                    {processingState === 'idle' ? (
                      <motion.button
                        key="convert"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={handleConvert}
                        className="w-full py-5 rounded-3xl bg-brand-primary text-white font-extrabold text-lg shadow-[0_20px_50px_rgba(0,122,255,0.3)] flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                      >
                        <Zap size={22} fill="currentColor" />
                        Конвертировать
                        <ArrowRight size={22} />
                      </motion.button>
                    ) : processingState === 'processing' ? (
                      <motion.div
                        key="progress"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full relative h-[68px] rounded-3xl bg-white/[0.03] border border-white/[0.08] overflow-hidden"
                      >
                        <motion.div 
                          className="absolute inset-x-0 bottom-0 h-full bg-brand-primary shadow-[0_0_30px_rgba(0,122,255,0.5)]"
                          initial={{ width: '0%' }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.2 }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center gap-3">
                          <Loader2 size={24} className="animate-spin text-white" />
                          <span className="text-[13px] font-extrabold uppercase tracking-[0.2em]">{Math.round(progress)}% Сборка PDF</span>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col gap-4"
                      >
                        <div className="flex flex-col gap-4">
                          <CompressButton 
                            file={files[0].file}
                            onSuccess={(original, compressed, blob) => {
                              // We can update the file item or just show the result
                              console.log('Compressed:', compressed);
                            }}
                          />
                        </div>

                        <div className="text-center space-y-2 mb-2">
                          <h4 className="text-xl font-display font-black text-white">Готово!</h4>
                          <p className="text-sm text-white/40 font-medium tracking-wide">
                            {sentToTelegram 
                              ? 'Файл успешно отправлен в ваш чат с ботом. Закройте приложение, чтобы увидеть его.' 
                              : 'Ваш файл готов к загрузке.'}
                          </p>
                        </div>

                        <button 
                          onClick={handleDownload}
                          className={`w-full py-5 rounded-3xl font-extrabold text-lg shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all ${
                            sentToTelegram 
                            ? 'bg-blue-500 text-white hover:bg-blue-600' 
                            : 'bg-white text-black hover:bg-white/90'
                          }`}
                        >
                          {sentToTelegram ? (
                            <>
                              <Send size={24} />
                              Перейти в чат
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={24} className="text-green-500" />
                              Скачать {mergeMode ? 'Общий PDF' : (files.length > 1 ? 'Файлы' : 'Файл')}
                            </>
                          )}
                        </button>
                        <button 
                          onClick={reset}
                          className="w-full py-2 text-[11px] font-bold text-white/20 uppercase tracking-[0.4em] hover:text-brand-primary transition-colors"
                        >
                          Новая сессия
                        </button>
                        <div ref={bottomRef} className="h-4" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Premium Modal */}
        <AnimatePresence>
          {showPremiumModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPremiumModal(false)}
              className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm glass-morphism rounded-[3rem] p-8 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary via-purple-500 to-brand-primary" />
                
                <button 
                  onClick={() => setShowPremiumModal(false)}
                  className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/5 text-white/20"
                >
                  <X size={20} />
                </button>

                <div className="mb-8 h-20 w-20 rounded-[2rem] bg-brand-primary text-white flex items-center justify-center shadow-2xl shadow-brand-primary/40 mx-auto relative group">
                  <Dog size={40} className="group-hover:scale-110 transition-transform" />
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }} 
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -top-1 -right-1"
                  >
                    <Sparkles size={24} className="text-white" />
                  </motion.div>
                </div>

                <h2 className="text-3xl font-display font-black text-center mb-4">DocDog <span className="text-brand-primary">Elite</span></h2>
                
                <ul className="space-y-4 mb-8">
                  {[
                    'Ультра-сжатие файлов без потери качества',
                    'Размер файлов до 2 ГБ',
                    'Нет ограничений на кол-во файлов',
                    'Мгновенная конвертация (без очереди)',
                    'Приоритетная поддержка 24/7'
                  ].map((text, i) => (
                    <li key={i} className="flex gap-3 text-sm font-medium text-white/60">
                      <CheckCircle2 size={18} className="text-brand-primary shrink-0" />
                      {text}
                    </li>
                  ))}
                </ul>

                <button className="w-full py-4 rounded-2xl bg-white text-black font-extrabold text-sm shadow-xl hover:bg-white/90 active:scale-95 transition-all mb-4">
                  Приобрести подписку
                </button>
                <p className="text-[10px] text-center text-white/20 uppercase tracking-widest font-bold">14 дней бесплатно • Затем $4.99/мес</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Security / Footer */}
        <footer className="mt-8 pt-8 flex items-center justify-center gap-6 border-t border-white/[0.03]">
          <div className="flex items-center gap-2 text-white/20">
            <Lock size={12} />
            <span className="text-[10px] font-bold uppercase tracking-widest">TLS 1.3</span>
          </div>
          <div className="flex items-center gap-2 text-white/20">
            <ShieldCheck size={12} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Zero-Trust Cloud</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ConverterUI;
