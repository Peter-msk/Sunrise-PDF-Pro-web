// Inactive client prototype: no UI or production route imports this module.
// A future server must enforce authentication, isolation, limits and deletion.
const SUPPORTED = new Set(['hwp', 'hwpx', 'xls', 'xlsx', 'ppt', 'pptx', 'doc', 'docx']);
const RESULT_LIMIT = 150 * 1024 * 1024;

export async function convertRemote(file, { signal, request = fetch } = {}) {
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  if (!file || !SUPPORTED.has(extension) || !Number.isFinite(file.size) || file.size < 1)
    throw new Error('지원하지 않거나 비어 있는 문서입니다.');
  if (signal?.aborted) throw new DOMException('변환이 취소되었습니다.', 'AbortError');
  const form = new FormData();
  form.append('file', file, file.name);
  const response = await request('/api/v1/conversions', {
    method: 'POST', body: form, credentials: 'same-origin', redirect: 'error', signal,
  });
  if (!response.ok) throw new Error('문서 변환을 완료하지 못했습니다. 잠시 후 다시 시도하세요.');
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/pdf') throw new Error('서버가 올바른 PDF를 반환하지 않았습니다.');
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > RESULT_LIMIT) throw new Error('변환 결과가 허용 크기를 초과했습니다.');
  if (!response.body) throw new Error('변환 결과가 비어 있습니다.');
  const reader = response.body.getReader();
  const chunks = []; let total = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('변환이 취소되었습니다.', 'AbortError');
      const {value, done} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > RESULT_LIMIT) throw new Error('변환 결과가 허용 크기를 초과했습니다.');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const pdf = new Blob(chunks, {type: 'application/pdf'});
  if (pdf.size < 8 || await pdf.slice(0, 5).text() !== '%PDF-')
    throw new Error('변환된 PDF의 내용이 올바르지 않습니다.');
  return {pdf, bytes: total};
}
