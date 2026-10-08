from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from datetime import datetime, timezone
from app.database.engine import get_connection, row_to_dict, row_get, parse_json, dump_json
import uuid, json

router = APIRouter(prefix="/api/reports", tags=["reports"])

def _build_html_report(spill_id: str, conn) -> str:
    spill = conn.execute("SELECT * FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
    if not spill:
        return "<html><body><h1>Spill not found</h1></body></html>"
    sp = row_to_dict(spill)
    img = conn.execute("SELECT * FROM satellite_images WHERE id=?", (sp.get("satellite_image_id",""),)).fetchone()
    img_d = row_to_dict(img) if img else {}
    attrs = conn.execute("SELECT a.*, v.vessel_name, v.vessel_type FROM attributions a JOIN vessels v ON a.mmsi=v.mmsi WHERE a.spill_id=? ORDER BY a.rank", (spill_id,)).fetchall()
    hcast = conn.execute("SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1", (spill_id,"hindcast")).fetchone()
    hc = row_to_dict(hcast) if hcast else {}
    fcast = conn.execute("SELECT * FROM particle_trajectories WHERE spill_id=? AND run_type=? ORDER BY created_at DESC LIMIT 1", (spill_id,"forecast")).fetchone()
    fc = row_to_dict(fcast) if fcast else {}
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    rows_html = ""
    for r in attrs:
        d = row_to_dict(r)
        rows_html += f"""<tr>
          <td>{d.get("rank","")}</td>
          <td>{d.get("vessel_name","—")}</td>
          <td>{d.get("vessel_type","—")}</td>
          <td>{d.get("mmsi","")}</td>
          <td>{d.get("distance_km","—")} km</td>
          <td>{d.get("evidence_score","—")}</td>
          <td>{d.get("data_confidence","—")}</td>
          <td>{d.get("final_score","—")}</td>
        </tr>"""

    sev = sp.get("severity") or "—"
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>OILTRACE AI — Investigation Report {spill_id}</title>
<style>
body{{font-family:'IBM Plex Mono',monospace;background:#0B0F14;color:#E6EAEE;margin:0;padding:32px;}}
h1{{color:#3FA7D6;font-size:20px;margin-bottom:4px;}} h2{{color:#A7B0BA;font-size:14px;border-bottom:1px solid #232B34;padding-bottom:8px;margin-top:32px;}}
.badge{{display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:600;}}
.sim{{background:#2D2416;color:#C8A45D;border:1px solid #C8A45D;}}
.meta{{color:#7F8A96;font-size:12px;margin-bottom:24px;}}
table{{width:100%;border-collapse:collapse;font-size:12px;}} th{{text-align:left;padding:6px 8px;background:#151B22;color:#A7B0BA;border-bottom:1px solid #232B34;}}
td{{padding:6px 8px;border-bottom:1px solid #19212A;color:#E6EAEE;}} tr:hover td{{background:#19212A;}}
.section{{background:#151B22;border:1px solid #232B34;border-radius:4px;padding:16px;margin-bottom:16px;}}
.kv{{display:grid;grid-template-columns:220px 1fr;gap:4px 16px;}} .k{{color:#7F8A96;font-size:12px;}} .v{{color:#E6EAEE;font-size:12px;}}
.warning{{background:#1A1408;border:1px solid #C9A24E;border-radius:4px;padding:12px;color:#C9A24E;font-size:12px;margin-bottom:16px;}}
.footer{{color:#59636E;font-size:11px;margin-top:48px;border-top:1px solid #232B34;padding-top:16px;}}
</style></head>
<body>
<h1>OILTRACE AI — Maritime Investigation Report</h1>
<div class="meta">Report ID: RPT-{spill_id}-{uuid.uuid4().hex[:6].upper()} &nbsp;|&nbsp; Generated: {now_str} &nbsp;|&nbsp; <span class="badge sim">SIMULATION MODE</span></div>

<div class="warning">
  <strong>IMPORTANT LIMITATION:</strong> This report is generated from synthetic simulation data (Demo Mode).
  SAR dark regions are not necessarily oil. Look-alike phenomena include low-wind zones, ship wakes, and biogenic slicks.
  Correlation scores are investigative evidence only and do not constitute legal attribution or proof of responsibility.
  No vessel is confirmed, proven, or legally attributed as responsible for this spill.
</div>

<h2>1. Incident Identification</h2>
<div class="section"><div class="kv">
  <span class="k">Incident ID</span><span class="v">{spill_id}</span>
  <span class="k">Incident Name</span><span class="v">{sp.get("incident_name","—")}</span>
  <span class="k">Region</span><span class="v">{sp.get("region_name","—")}</span>
  <span class="k">Severity</span><span class="v">{str(sev).upper()}</span>
  <span class="k">Data Mode</span><span class="v">SIMULATION (Synthetic Data)</span>
  <span class="k">Report Version</span><span class="v">1.0</span>
</div></div>

<h2>2. Satellite Scene</h2>
<div class="section"><div class="kv">
  <span class="k">Scene ID</span><span class="v">{img_d.get("id","—")}</span>
  <span class="k">Satellite</span><span class="v">{img_d.get("satellite_name","—")}</span>
  <span class="k">Filename</span><span class="v">{img_d.get("filename","—")}</span>
  <span class="k">Acquisition Time</span><span class="v">{img_d.get("acquisition_time","—")} UTC</span>
  <span class="k">CRS</span><span class="v">{img_d.get("crs","—")}</span>
  <span class="k">Resolution</span><span class="v">{img_d.get("resolution_m","—")} m/px</span>
  <span class="k">Source</span><span class="v">{img_d.get("source","—")}</span>
</div></div>

<h2>3. Detection</h2>
<div class="section"><div class="kv">
  <span class="k">Detected Class</span><span class="v">{sp.get("detected_class","—")}</span>
  <span class="k">Detection Confidence</span><span class="v">{sp.get("detection_confidence","—")}</span>
  <span class="k">Model Version</span><span class="v">{sp.get("model_version","—")}</span>
  <span class="k">Threshold</span><span class="v">{sp.get("model_threshold","—")}</span>
  <span class="k">Preprocessing Version</span><span class="v">{sp.get("preprocessing_version","—")}</span>
</div></div>

<h2>4. Spill Geometry</h2>
<div class="section"><div class="kv">
  <span class="k">Area</span><span class="v">{sp.get("area_km2","—")} km&#178;</span>
  <span class="k">Perimeter</span><span class="v">{sp.get("perimeter_km","—")} km</span>
  <span class="k">Length</span><span class="v">{sp.get("length_km","—")} km</span>
  <span class="k">Width</span><span class="v">{sp.get("width_km","—")} km</span>
  <span class="k">Orientation</span><span class="v">{sp.get("orientation_deg","—")}°</span>
  <span class="k">Compactness</span><span class="v">{sp.get("compactness","—")}</span>
</div></div>

<h2>5. Estimated Origin (Hindcast)</h2>
<div class="section"><div class="kv">
  <span class="k">Origin Time Estimate</span><span class="v">{hc.get("origin_time_estimate","—")}</span>
  <span class="k">Temporal Uncertainty</span><span class="v">±{hc.get("origin_time_uncertainty_h","—")} h</span>
  <span class="k">Spatial Uncertainty</span><span class="v">{hc.get("spatial_uncertainty_km","—")} km</span>
  <span class="k">Particle Count</span><span class="v">{hc.get("particle_count","—")}</span>
  <span class="k">Integration Method</span><span class="v">{hc.get("integration_method","—")}</span>
  <span class="k">Windage Coefficient</span><span class="v">{hc.get("windage_coefficient","—")}</span>
  <span class="k">Hindcast Duration</span><span class="v">{hc.get("integration_hours","—")} h</span>
  <span class="k">Environmental Source</span><span class="v">{hc.get("environmental_source","—")}</span>
  <span class="k">Provenance</span><span class="v">RECONSTRUCTED / SYNTHETIC</span>
</div></div>

<h2>6. Candidate Vessel Correlation</h2>
<div class="section">
<p style="color:#7F8A96;font-size:12px;">Correlation scores represent statistical correlation between vessel presence and spill origin estimates. They are not legal attribution and do not prove responsibility.</p>
<table>
  <thead><tr><th>Rank</th><th>Vessel</th><th>Type</th><th>MMSI</th><th>Distance to Origin</th><th>Evidence Score</th><th>Data Confidence</th><th>Final Score</th></tr></thead>
  <tbody>{rows_html}</tbody>
</table></div>

<h2>7. Limitations</h2>
<div class="section">
<ul style="color:#A7B0BA;font-size:12px;line-height:1.7;">
  <li>All data in this report is synthetic simulation data. Not from real satellite acquisitions or real AIS.</li>
  <li>SAR detection is not definitive. Look-alike phenomena can resemble oil. Expert review required.</li>
  <li>Drift model accuracy depends on environmental data resolution and windage assumptions.</li>
  <li>AIS data may have gaps due to equipment, coverage, or reporting anomalies.</li>
  <li>Correlation scores are investigative, not conclusive.</li>
  <li>No vessel is confirmed as legally responsible for this spill.</li>
</ul>
</div>

<h2>8. Audit Information</h2>
<div class="section"><div class="kv">
  <span class="k">Analysis Seed</span><span class="v">26143</span>
  <span class="k">Model Version</span><span class="v">{sp.get("model_version","—")}</span>
  <span class="k">Report Generated</span><span class="v">{now_str}</span>
  <span class="k">Report Version</span><span class="v">1.0</span>
  <span class="k">Data Mode</span><span class="v">SIMULATION</span>
  <span class="k">Reproducible</span><span class="v">Yes — fixed seed 26143</span>
</div></div>

<div class="footer">
  OILTRACE AI | National Maritime Intelligence Directorate | Satellite-Based Marine Oil Spill Detection
  <br>This report is for investigative purposes only. It does not constitute legal evidence.
</div>
</body></html>"""

def _resolve_spill_id(spill_id: str, conn) -> str:
    row = conn.execute("SELECT id FROM oil_spills WHERE id=?", (spill_id,)).fetchone()
    if row:
        return row_get(row, "id", row_get(row, 0, spill_id))
    fallback = conn.execute("SELECT id FROM oil_spills ORDER BY created_at DESC LIMIT 1").fetchone()
    if fallback:
        return row_get(fallback, "id", row_get(fallback, 0, spill_id))
    return spill_id

@router.post("/{spill_id}/generate")
def generate_report(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        from app.reports.generator import generate_investigation_report
        res = generate_investigation_report(resolved_id, conn)
        report_id = res["report_id"]
        now = datetime.now(timezone.utc).isoformat()
        html = res["html"]
        sections_json = dump_json(res["sections"])
        conn.execute("""
            INSERT OR REPLACE INTO investigation_reports 
            (id, spill_id, report_version, status, report_html, sections_json, generated_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (report_id, resolved_id, "1.0", "complete", html, sections_json, now, now))
        conn.commit()
        spill_row = conn.execute("SELECT data_mode, provenance FROM oil_spills WHERE id=?", (resolved_id,)).fetchone()
        dm = dict(spill_row).get("data_mode", "simulation") if spill_row else "simulation"
        pv = dict(spill_row).get("provenance", "synthetic") if spill_row else "synthetic"
        return {
            "report_id": report_id,
            "spill_id": resolved_id,
            "status": "complete",
            "generated_at": now,
            "data_mode": dm,
            "provenance": pv,
            "sections": res["sections"],
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Error generating report: {str(e)}")
    finally:
        conn.close()

@router.get("/{spill_id}")
def get_report(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        row = conn.execute("SELECT * FROM investigation_reports WHERE spill_id=? ORDER BY created_at DESC LIMIT 1", (resolved_id,)).fetchone()
        if not row:
            from app.reports.generator import generate_investigation_report
            res = generate_investigation_report(resolved_id, conn)
            report_id = res["report_id"]
            now = datetime.now(timezone.utc).isoformat()
            html = res["html"]
            sections_json = dump_json(res["sections"])
            conn.execute("""
                INSERT OR REPLACE INTO investigation_reports 
                (id, spill_id, report_version, status, report_html, sections_json, generated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (report_id, resolved_id, "1.0", "complete", html, sections_json, now, now))
            conn.commit()
            row = conn.execute("SELECT * FROM investigation_reports WHERE id=?", (report_id,)).fetchone()

        d = row_to_dict(row)
        if d.get("sections_json"):
            d["sections"] = parse_json(d["sections_json"])
        return d
    finally:
        conn.close()

@router.get("/{spill_id}/html", response_class=HTMLResponse)
def get_report_html(spill_id: str):
    conn = get_connection()
    try:
        resolved_id = _resolve_spill_id(spill_id, conn)
        row = conn.execute("SELECT report_html FROM investigation_reports WHERE spill_id=? ORDER BY created_at DESC LIMIT 1", (resolved_id,)).fetchone()
        if not row or not dict(row)["report_html"]:
            from app.reports.generator import generate_investigation_report
            res = generate_investigation_report(resolved_id, conn)
            report_id = res["report_id"]
            now = datetime.now(timezone.utc).isoformat()
            html = res["html"]
            sections_json = dump_json(res["sections"])
            conn.execute("""
                INSERT OR REPLACE INTO investigation_reports 
                (id, spill_id, report_version, status, report_html, sections_json, generated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (report_id, resolved_id, "1.0", "complete", html, sections_json, now, now))
            conn.commit()
            return HTMLResponse(content=html)
        return HTMLResponse(content=dict(row)["report_html"])
    finally:
        conn.close()
