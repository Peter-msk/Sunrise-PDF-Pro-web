/** Only fixed diagnostic codes may leave the local filter normalizer. */
const REASONS=new Set([
 'resource-context','ancestor-filter','ancestor-style','filter-declaration',
 'effect-definition','opacity','image-attributes','image-source','wrapper-shape',
 'nesting-limit','recognized-target','rhwp-definition-mismatch','unsupported-definition'
]);
export const safeFilterReason=value=>REASONS.has(value)?value:null;
export function localQaFilterReason(error){
 const value=String(error||'');
 if(!/\bSVG_FILTER_EFFECT_UNSUPPORTED\b/.test(value))return null;
 const m=/\[filter_reason=([a-z-]+)\]/.exec(value);
 return m?safeFilterReason(m[1]):null;
}
