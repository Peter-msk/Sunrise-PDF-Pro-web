// Anonymous per-attempt telemetry. A missing terminal event is not a failure.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const kinds=new Set(['convert_start','convert_progress','convert_success','convert_failure','convert_cancel']);
const outcomes={convert_success:'success',convert_failure:'failure',convert_cancel:'cancel'};
export const operationEventValid=b=>!!b&&typeof b.operation_id==='string'&&uuid.test(b.operation_id)&&kinds.has(b.kind);
export const UPSERT_SQL=`INSERT INTO pro_conversion_operations
 (operation_id,session_id,feature,started_at,ended_at,outcome,stage,error_code,duration_ms,updated_at)
 SELECT ?,?,?,?,?,?,?,?,?,?
 WHERE EXISTS(SELECT 1 FROM pro_conversion_operations WHERE operation_id=?)
 OR (?=1 AND (SELECT COUNT(*) FROM pro_conversion_operations WHERE session_id=? AND updated_at>=?)<300)
 ON CONFLICT(operation_id) DO UPDATE SET
 started_at=COALESCE(pro_conversion_operations.started_at,excluded.started_at),
 ended_at=COALESCE(pro_conversion_operations.ended_at,excluded.ended_at),
 outcome=COALESCE(pro_conversion_operations.outcome,excluded.outcome),
 stage=CASE WHEN pro_conversion_operations.outcome IS NOT NULL THEN pro_conversion_operations.stage WHEN excluded.outcome IS NOT NULL OR excluded.duration_ms>=pro_conversion_operations.duration_ms THEN excluded.stage ELSE pro_conversion_operations.stage END,
 error_code=CASE WHEN pro_conversion_operations.outcome IS NOT NULL THEN pro_conversion_operations.error_code WHEN excluded.outcome IS NOT NULL THEN excluded.error_code ELSE pro_conversion_operations.error_code END,
 duration_ms=CASE WHEN pro_conversion_operations.outcome IS NOT NULL THEN pro_conversion_operations.duration_ms WHEN excluded.outcome IS NOT NULL THEN excluded.duration_ms ELSE MAX(pro_conversion_operations.duration_ms,excluded.duration_ms) END,
 updated_at=MAX(pro_conversion_operations.updated_at,excluded.updated_at)
 WHERE pro_conversion_operations.session_id=excluded.session_id AND pro_conversion_operations.feature=excluded.feature
 AND ((excluded.started_at IS NOT NULL AND pro_conversion_operations.started_at IS NULL)
 OR (pro_conversion_operations.outcome IS NULL AND (excluded.outcome IS NOT NULL OR (excluded.started_at IS NULL AND excluded.duration_ms>pro_conversion_operations.duration_ms))))`;
export function operationStatement(db,b,t,{allowNew=true}={}){
 const outcome=outcomes[b.kind]||null;
 return db.prepare(UPSERT_SQL).bind(b.operation_id,b.session_id,b.feature,b.kind==='convert_start'?t:null,outcome?t:null,outcome,b.stage,b.error_code,b.duration_ms,t,b.operation_id,allowNew?1:0,b.session_id,t-3600);
}
export const SUMMARY_SQL=`SELECT feature,COUNT(*) AS started,
 SUM(CASE WHEN outcome='success' THEN 1 ELSE 0 END) AS successes,
 SUM(CASE WHEN outcome='failure' THEN 1 ELSE 0 END) AS failures,
 SUM(CASE WHEN outcome='cancel' THEN 1 ELSE 0 END) AS cancels,
 SUM(CASE WHEN outcome IS NULL THEN 1 ELSE 0 END) AS unconfirmed,
 ROUND(AVG(CASE WHEN outcome IS NOT NULL THEN duration_ms END)) AS avg_terminal_ms
 FROM pro_conversion_operations WHERE started_at>=? AND started_at<=? GROUP BY feature ORDER BY started DESC,feature`;
export async function operationSummary(db,t){
 const since=t-7*86400;
 const [summary,orphans]=await Promise.all([
  db.prepare(SUMMARY_SQL).bind(since,t).all(),
  db.prepare('SELECT COUNT(*) AS n FROM pro_conversion_operations WHERE started_at IS NULL AND ended_at>=? AND ended_at<=?').bind(since,t).first()
 ]);
 return {period:'rolling_7d',rows:summary.results||[],terminal_without_start:orphans?.n||0,source:'anonymous_client_attempts',unconfirmed_definition:'terminal event not observed; not a confirmed failure'};
}
