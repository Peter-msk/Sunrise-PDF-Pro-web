// Shared retention rules. Scheduled mode deliberately preserves inquiry records.
// No production data is mutated until a caller executes the batch.
export const RETENTION_DAYS=Object.freeze({telemetry:30,progress:30,trace:14,traceAudit:90,loginLimits:1,resolvedInquiry:90});
const DAY=86400;
export function retentionStatements(db,now,mode){
 if(!Number.isSafeInteger(now)||now<=0||!['scheduled','manual'].includes(mode))throw new Error('INVALID_RETENTION_ARGUMENT');
 const stmt=(sql,cutoff)=>db.prepare(sql).bind(cutoff);
 const shared=[
  stmt('DELETE FROM pro_telemetry WHERE happened_at<?',now-RETENTION_DAYS.telemetry*DAY),
  stmt('DELETE FROM pro_telemetry_progress WHERE happened_at<?',now-RETENTION_DAYS.progress*DAY),
  stmt('DELETE FROM pro_admin_sessions WHERE expires_at<=?',now),
  db.prepare('DELETE FROM pro_admin_login_limits WHERE window_start<? AND locked_until<=?').bind(now-RETENTION_DAYS.loginLimits*DAY,now)
 ];
 if(mode==='scheduled')return [...shared,
  stmt('DELETE FROM pro_trace_dev4 WHERE happened_at<?',now-RETENTION_DAYS.trace*DAY),
  stmt('DELETE FROM pro_trace_dev4_audit WHERE happened_at<?',now-RETENTION_DAYS.traceAudit*DAY)];
 return [...shared,stmt("DELETE FROM pro_inquiries WHERE status='resolved' AND updated_at<?",now-RETENTION_DAYS.resolvedInquiry*DAY)];
}
export async function purgeRetention(db,now,mode){return await db.batch(retentionStatements(db,now,mode));}
