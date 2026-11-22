/** Public-only presentation: conceal internal release IDs without modifying D1. */
export function publicPublicationCopy(value){
 return String(value??'')
  .replace(/\b(?:DEV|R)[-_]?\d{1,4}\b/gi,'')
  .replace(/\b(?:QA|WASM|RHWP)\b/gi,'')
  .replace(/[ \t]{2,}/g,' ')
  .trim();
}
export function publicPublicationRecord(item){
 return {...item,
  title:publicPublicationCopy(item?.title),
  body:publicPublicationCopy(item?.body)
 };
}
