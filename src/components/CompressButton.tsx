import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

interface CompressButtonProps {
  file: File;
  onSuccess: (originalSize: number, compressedSize: number, blob: Blob) => void;
}

type CompressState = 'idle' | 'compressing' | 'done' | 'error';

const CompressButton: React.FC<CompressButtonProps> = ({ file, onSuccess }) => {
  const [state, setState] = useState<CompressState>('idle');
  const [sizes, setSizes] = useState<{ original: number; compressed: number } | null>(null);

  const handleCompress = async () => {
    if (state === 'compressing') return;
    
    setState('compressing');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/compress', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Compression failed');

      const blob = await response.blob();
      const originalSize = parseInt(response.headers.get('X-Original-Size') || file.size.toString());
      const compressedSize = parseInt(response.headers.get('X-Compressed-Size') || blob.size.toString());

      setSizes({ original: originalSize, compressed: compressedSize });
      setState('done');
      onSuccess(originalSize, compressedSize, blob);
    } catch (error) {
      console.error(error);
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  const formatSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <button
        onClick={handleCompress}
        disabled={state === 'compressing'}
        className={`relative w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all active:scale-[0.98] overflow-hidden
          ${state === 'idle' ? 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white' : ''}
          ${state === 'compressing' ? 'bg-brand-primary text-white cursor-wait' : ''}
          ${state === 'done' ? 'bg-green-500/10 text-green-500' : ''}
          ${state === 'error' ? 'bg-red-500/10 text-red-500' : ''}
        `}
      >
        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2"
            >
              <Zap size={16} fill="currentColor" />
              <span>Умное сжатие (Бесплатно)</span>
            </motion.div>
          )}

          {state === 'compressing' && (
            <motion.div
              key="compressing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2"
            >
              <Loader2 size={16} className="animate-spin" />
              <span>Сжатие...</span>
            </motion.div>
          )}

          {state === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-2"
            >
              <CheckCircle2 size={16} />
              <span>Готово</span>
            </motion.div>
          )}

          {state === 'error' && (
            <motion.span key="error">Ошибка сжатия</motion.span>
          )}
        </AnimatePresence>
      </button>

      {state === 'done' && sizes && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 flex items-center justify-between"
        >
          <div className="flex flex-col">
            <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Оптимизация</span>
            <div className="flex items-center gap-2 text-xs font-bold mt-1">
              <span className="text-white/40 line-through">{formatSize(sizes.original)}</span>
              <ArrowRight size={12} className="text-brand-primary" />
              <span className="text-green-500">{formatSize(sizes.compressed)}</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-green-500/50 text-[10px] font-bold uppercase tracking-widest">
              -{Math.round((1 - sizes.compressed / sizes.original) * 100)}%
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default CompressButton;
