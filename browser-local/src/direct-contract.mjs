/** Shared Direct PDF contract helpers; no browser or PDF library dependencies. */
export const PX_TO_PT=.75;
export const isRecord=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
export const isCoordinate=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e7;
export const isRgbHex=s=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s);
export const hasOnlyKeys=(o,keys)=>isRecord(o)&&Object.keys(o).every(k=>keys.includes(k));
export const isIdentityShapeTransform=t=>hasOnlyKeys(t,['rotation','horzFlip','vertFlip'])&&t.rotation===0&&t.horzFlip===false&&t.vertFlip===false;
