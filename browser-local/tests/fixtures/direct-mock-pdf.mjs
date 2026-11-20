/** Structural envelope for mocked PDF backends only; not a renderable PDF fixture. */
export function mockPdfBytes(){
 const prefix='%PDF-1.7\n',offset=prefix.length;
 return Uint8Array.from(prefix+'xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>\nstartxref\n'+offset+'\n%%EOF\n',c=>c.charCodeAt(0));
}
