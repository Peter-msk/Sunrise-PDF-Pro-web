/** PDFKit 0.20 browser ESM: explicit standard font registration, no Node streams. */
export async function loadBrowserPdfBackend(importModule) {
  const modules = importModule
    ? await Promise.all([
        importModule('pdfkit'), importModule('svg-to-pdfkit'),
        importModule('pdfkit/standard-fonts/Helvetica'),
      ])
    : await Promise.all([
        import('pdfkit'), import('svg-to-pdfkit'),
        import('pdfkit/standard-fonts/Helvetica'),
      ]);
  const [kitModule, svgModule, fontModule] = modules;
  const PDFDocument = kitModule.PDFDocument || kitModule.default;
  const SVGtoPDF = svgModule.default || svgModule;
  const Helvetica = fontModule.default || fontModule;
  const {registerStdFonts} = kitModule;
  if (typeof PDFDocument !== 'function' || typeof SVGtoPDF !== 'function' ||
      typeof registerStdFonts !== 'function')
    throw new Error('전문 PDF 엔진 모듈 인터페이스가 일치하지 않습니다.');
  return {
    PDFDocument, SVGtoPDF, registerStdFonts, Helvetica,
    toBlob(pdf, signal) {
      const abortError = () => new DOMException('PDF 변환이 취소되었습니다.', 'AbortError');
      return new Promise((resolve, reject) => {
        if (!pdf || typeof pdf.on !== 'function' || typeof pdf.off !== 'function') {
          reject(new Error('PDFKit 브라우저 출력 인터페이스가 유효하지 않습니다.'));
          return;
        }
        let settled = false;
        const chunks = [];
        const cleanup = error => {
          signal?.removeEventListener('abort', onAbort);
          pdf.off('data', onData);
          pdf.off('end', onEnd);
          // A cancelled writer can emit a late error during disposal.
          if (!error) pdf.off('error', onError);
          chunks.length = 0;
        };
        const settle = (error, blob) => {
          if (settled) return;
          settled = true;
          cleanup(error);
          if (error) reject(error); else resolve(blob);
        };
        const onError = error => settle(error instanceof Error ? error : new Error(String(error)));
        const onData = chunk => {
          if (signal?.aborted) { onAbort(); return; }
          if (!(chunk instanceof Uint8Array)) {
            settle(new Error('PDF 출력 바이트 형식이 올바르지 않습니다.'));
            return;
          }
          chunks.push(chunk);
        };
        const onEnd = () => {
          if (signal?.aborted) { onAbort(); return; }
          try { settle(null, new Blob(chunks, {type:'application/pdf'})); }
          catch (error) { settle(error); }
        };
        const onAbort = () => settle(abortError());
        pdf.on('error', onError);
        if (signal?.aborted) { onAbort(); return; }
        pdf.on('data', onData);
        pdf.on('end', onEnd);
        signal?.addEventListener('abort', onAbort, {once:true});
        if (signal?.aborted) onAbort();
      });
    },
  };
}
