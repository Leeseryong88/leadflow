"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  callFunction,
  changePassword,
  clearSession,
  createDocument,
  deleteReport,
  deleteUserAccount,
  firebaseReady,
  getOrBootstrapProfile,
  listDocuments,
  deleteSavedSummary,
  listSavedSummaries,
  queryDocumentsByField,
  Profile,
  restoreSession,
  saveSession,
  Session,
  signIn,
} from "./firebase-rest";
import { ReportWriter } from "./ReportWriter";

const PAGE_PATHS: Record<string, string> = {
  reports: "/reports",
  write: "/reports/write",
  users: "/users",
  ai: "/ai",
};

function pageFromPath(pathname: string) {
  if (pathname.startsWith("/reports/write")) return "write";
  if (pathname.startsWith("/users")) return "users";
  if (pathname.startsWith("/ai")) return "ai";
  return "reports";
}

type Travel = { type: string; name: string; start: string; end: string; destination: string; purpose?: string; notes: string };
type EventItem = { date: string; type: string; description: string; location: string; notes: string };
type Issue = { category: string; details: string; deadline: string };
type Report = {
  id: string; department: string; authorId: string; authorName: string; employeeNumber: string;
  weekLabel: string; createdAt: string; submittedAt: string; travel: Travel[]; events: EventItem[];
  issues: Issue[]; ceoRequests: string; keyQuestion: string;
};
type PeriodSummary = { title: string; from: string; to: string; html: string; empty?: boolean };
type SavedSummary = PeriodSummary & { id: string; createdAt: string; createdBy?: string };

const today = new Date().toISOString().slice(0, 10);
function weekLabelFromReportDate(value = today) {
  const reportDate = new Date(`${value}T12:00:00`);
  const target = new Date(reportDate);
  target.setDate(reportDate.getDate() + 7);
  return `${target.getFullYear()}년 ${target.getMonth() + 1}월 ${Math.ceil(target.getDate() / 7)}주차`;
}
const emptyDraft = () => ({
  weekLabel: weekLabelFromReportDate(),
  travel: [] as Travel[], events: [] as EventItem[], issues: [] as Issue[], ceoRequests: "", keyQuestion: "",
});
const navAdmin = [["reports", "Schedule", "▤"], ["users", "사용자 관리", "◎"], ["ai", "Leader Schedule AI", "✦"]];
const navLeader = [["reports", "Schedule", "▤"]];
const REPORTS_PAGE_SIZE = 8;

function fmtDate(value: string) {
  if (!value) return "-";
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function Login({ onLogin }: { onLogin: (session: Session, profile: Profile) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!firebaseReady) return setError("Firebase 연결 정보를 설정하면 로그인이 활성화됩니다.");
    setLoading(true); setError("");
    try {
      const session = await signIn(identifier, password);
      const profile = await getOrBootstrapProfile(session);
      if (!profile || !profile.active) throw new Error("사용할 수 없는 계정입니다. 관리자에게 문의해 주세요.");
      saveSession(session);
      onLogin(session, profile);
    } catch (err) { setError(err instanceof Error ? err.message : "로그인을 완료하지 못했습니다."); }
    finally { setLoading(false); }
  }

  return <main className="login-page">
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-brand"><span className="brand-mark">L</span> Leader Schedule</div>
        <h2>로그인</h2>
        <label>사번<input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="사번입력" autoComplete="username" required/></label>
        <label>비밀번호<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 입력" autoComplete="current-password" required/></label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary wide" disabled={loading}>{loading ? "확인 중..." : "로그인"}</button>
        {!firebaseReady && <div className="error-box">Firebase 연결 정보가 없습니다.</div>}
      </form>
    </section>
  </main>;
}

function PasswordGate({ session, onDone }: { session: Session; profile: Profile; onDone: (s: Session) => void }) {
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("비밀번호는 8자 이상으로 설정해 주세요.");
    if (password !== confirm) return setError("비밀번호가 서로 다릅니다.");
    setLoading(true); setError("");
    try { const next = await changePassword(session, password); saveSession(next); onDone(next); }
    catch (err) { setError(err instanceof Error ? err.message : "변경하지 못했습니다."); } finally { setLoading(false); }
  }
  return <div className="gate"><form className="gate-card" onSubmit={submit}><h2>비밀번호 변경</h2><p className="muted">새로 사용할 비밀번호를 입력해 주세요.</p><label>새 비밀번호<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="8자 이상" required/></label><label>새 비밀번호 확인<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="한 번 더 입력" required/></label>{error&&<div className="error-box">{error}</div>}<button className="primary wide" disabled={loading}>{loading?"변경 중...":"비밀번호 변경"}</button></form></div>;
}

function Header({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return <header className="topbar"><div><p className="top-title">Leader Schedule</p></div><div className="profile-wrap"><button className="profile" onClick={()=>setOpen(!open)}><span className="avatar">{profile.name.slice(0,1)}</span><span><b>{profile.name}</b><small>{profile.department} · {profile.role === "admin" ? "관리자" : "리더"}</small></span><i>⌄</i></button>{open&&<div className="profile-menu"><span>{profile.employeeNumber}</span><button onClick={onLogout}>로그아웃</button></div>}</div></header>;
}

function Sidebar({ profile, page, setPage }: { profile: Profile; page: string; setPage: (p:string)=>void }) {
  const nav = profile.role === "admin" ? navAdmin : navLeader;
  return <aside className="sidebar"><div className="brand"><span className="brand-mark">L</span><span>Leader Schedule</span></div><div className="side-label">MENU</div><nav>{nav.map(([id,label,icon])=><button key={id} className={page===id?"active":""} onClick={()=>setPage(id)}><span>{icon}</span>{label}{id==="ai"&&<i>AI</i>}</button>)}</nav></aside>;
}

function SectionTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow&&<p className="eyebrow blue">{eyebrow}</p>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>;
}

function ReportTable({ reports, onSelect, onDelete, empty }: { reports: Report[]; onSelect?:(r:Report)=>void; onDelete?:(r:Report)=>void; empty:string }) {
  if (!reports.length) return <div className="empty"><span>▤</span><p>{empty}</p></div>;
  return <div className="table-wrap"><table><thead><tr><th>주차</th><th>부서</th><th>작성자</th><th>제출일</th><th>핵심 이슈</th><th></th></tr></thead><tbody>{reports.map(r=><tr key={r.id} onClick={()=>onSelect?.(r)}><td><b>{r.weekLabel}</b></td><td><span className="dept-tag">{r.department}</span></td><td>{r.authorName}</td><td>{fmtDate(r.submittedAt)}</td><td>{(r.issues||[]).length}건</td><td className="row-actions" onClick={(e)=>e.stopPropagation()}>{onDelete&&<button type="button" className="danger-text" onClick={()=>onDelete(r)}>삭제</button>}<button type="button" className="row-open" aria-label="Schedule 열기" onClick={()=>onSelect?.(r)}>→</button></td></tr>)}</tbody></table></div>;
}

type DayTravelItem = Travel & { department: string; name: string; key: string };
type WeekSegment = { item: DayTravelItem; startCol: number; endCol: number; continuesLeft: boolean; continuesRight: boolean; lane: number };

function TravelCalendar({ reports, compact = false, onSelectDay }: { reports: Report[]; compact?: boolean; onSelectDay?: (date: string, items: DayTravelItem[]) => void }) {
  const [cursor, setCursor] = useState(new Date());
  const items = reports.flatMap((r) => (r.travel || []).map((t, travelIndex) => ({
    ...t,
    department: r.department,
    name: t.name || r.authorName,
    key: `${r.id}-${travelIndex}`,
  })));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const dateKey = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const inDay = (d: number) => items.filter((t) => t.start <= dateKey(d) && t.end >= dateKey(d));
  const laneLimit = compact ? 2 : 3;
  function openDay(d: number) {
    const dayItems = inDay(d);
    if (!dayItems.length) return;
    onSelectDay?.(dateKey(d), dayItems);
  }

  /** 한 주 안에서 각 출장·휴가를 연속 구간(바)으로 계산하고 겹치지 않게 줄(lane)을 배정한다. */
  function weekSegments(week: (number | null)[]): WeekSegment[] {
    const segments: Omit<WeekSegment, "lane">[] = [];
    for (const item of items) {
      let startCol = -1, endCol = -1;
      week.forEach((d, col) => {
        if (!d) return;
        const key = dateKey(d);
        if (item.start <= key && item.end >= key) {
          if (startCol === -1) startCol = col;
          endCol = col;
        }
      });
      if (startCol === -1) continue;
      segments.push({
        item,
        startCol,
        endCol,
        continuesLeft: item.start < dateKey(week[startCol] as number),
        continuesRight: item.end > dateKey(week[endCol] as number),
      });
    }
    segments.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));
    const laneEnds: number[] = [];
    return segments.map((segment) => {
      let lane = laneEnds.findIndex((end) => end < segment.startCol);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(segment.endCol); }
      else laneEnds[lane] = segment.endCol;
      return { ...segment, lane };
    });
  }

  return <section className={`calendar panel${compact ? " compact" : ""}`}>
    <div className="calendar-head">
      <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))}>←</button>
      <h2>{year}년 {month + 1}월</h2>
      <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}>→</button>
    </div>
    <div className="weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((d) => <span key={d}>{d}</span>)}</div>
    <div className="calendar-grid">{weeks.map((week, weekIndex) => {
      const segments = weekSegments(week);
      const visible = segments.filter((segment) => segment.lane < laneLimit);
      const hiddenCount = (col: number) => segments.filter((segment) => segment.lane >= laneLimit && segment.startCol <= col && segment.endCol >= col).length;
      return <div className="cal-week" key={weekIndex}>
        <div className="cal-week-days">
          {week.map((d, i) => {
            const dayItems = d ? inDay(d) : [];
            const clickable = Boolean(d && dayItems.length);
            const hidden = d ? hiddenCount(i) : 0;
            return <div
              className={`day ${d && dateKey(d) === today ? "today" : ""}${clickable ? " has-travel" : ""}`}
              key={i}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => d && openDay(d)}
              onKeyDown={(e) => { if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDay(d); } }}
            >{d && <>
              <b>{d}</b>
              {hidden > 0 && <small className="day-more">+{hidden}건</small>}
            </>}</div>;
          })}
        </div>
        <div className="cal-week-bars">
          {visible.map((segment) => {
            const isLeave = segment.item.type.includes("휴가");
            return <span
              key={segment.item.key}
              className={`cal-bar ${isLeave ? "leave" : "travel"}${segment.continuesLeft ? " cont-l" : ""}${segment.continuesRight ? " cont-r" : ""}`}
              style={{ gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`, gridRow: segment.lane + 1 }}
              title={`${segment.item.name} · ${segment.item.type}${segment.item.destination ? ` · ${segment.item.destination}` : ""}`}
            >
              <em>{isLeave ? "휴가" : "출장"}</em>
              <span>{segment.item.name}</span>
            </span>;
          })}
        </div>
      </div>;
    })}</div>
    <div className="legend"><span><i className="dot travel"></i>출장</span><span><i className="dot leave"></i>휴가</span></div>
  </section>;
}

function Reports({ reports, profile, session, onCreate, onDeleted }: { reports: Report[]; profile: Profile; session?: Session; onCreate?: () => void; onDeleted?: (id: string) => void }) {
  const [department, setDepartment] = useState("전체");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Report | null>(null);
  const [dayTravel, setDayTravel] = useState<{ date: string; items: DayTravelItem[] } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listMessage, setListMessage] = useState("");
  const departments = ["전체", ...Array.from(new Set(reports.map((r) => r.department)))];
  const filtered = reports.filter((r) => (department === "전체" || r.department === department) && (`${r.authorName} ${r.weekLabel} ${r.department}`.toLowerCase().includes(query.toLowerCase())));
  const totalPages = Math.max(1, Math.ceil(filtered.length / REPORTS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * REPORTS_PAGE_SIZE, currentPage * REPORTS_PAGE_SIZE);

  function updateQuery(value: string) { setQuery(value); setPage(1); }
  function updateDepartment(value: string) { setDepartment(value); setPage(1); }

  async function confirmDeleteReport() {
    if (!pendingDelete || !session) return;
    setDeleting(true); setListMessage("");
    try {
      const result = await deleteReport(pendingDelete.id, session.idToken);
      onDeleted?.(pendingDelete.id);
      if (selected?.id === pendingDelete.id) setSelected(null);
      setListMessage(result.message);
      setPendingDelete(null);
    } catch (err) {
      setListMessage(err instanceof Error ? err.message : "Schedule을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  if (profile.role === "admin") {
    return <div className="content admin-board">
      <SectionTitle title="Schedule" />
      <div className="admin-board-grid">
        <TravelCalendar reports={reports} compact onSelectDay={(date, items) => setDayTravel({ date, items })} />
        <section className="panel admin-reports-panel">
          <div className="panel-head"><div><h3>전체 Schedule</h3></div><span className="result-count">{filtered.length}건</span></div>
          <div className="filters compact">
            <div className="search"><span>⌕</span><input placeholder="작성자, 부서, 주차 검색" value={query} onChange={(e) => updateQuery(e.target.value)} /></div>
            <select value={department} onChange={(e) => updateDepartment(e.target.value)}>{departments.map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          {listMessage && <div className={/삭제했습니다/.test(listMessage) ? "success-box" : "error-box"} style={{ margin: "0 18px 12px" }}>{listMessage}</div>}
          <div className="admin-reports-body">
            <ReportTable
              reports={paged}
              onSelect={setSelected}
              onDelete={(report) => { setListMessage(""); setPendingDelete(report); }}
              empty="조건에 맞는 Schedule이 없습니다."
            />
          </div>
          <div className="pagination">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>←</button>
            <span>{currentPage} / {totalPages}</span>
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>→</button>
          </div>
        </section>
      </div>
      {selected && <ReportViewer report={selected} onClose={() => setSelected(null)} />}
      {dayTravel && <DayTravelViewer date={dayTravel.date} items={dayTravel.items} onClose={() => setDayTravel(null)} />}
      {pendingDelete && (
        <div className="modal-backdrop" onMouseDown={() => !deleting && setPendingDelete(null)}>
          <div className="modal confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2>Schedule 삭제</h2>
            <p className="muted"><b>{pendingDelete.authorName}</b> · {pendingDelete.weekLabel} Schedule을 삭제할까요?<br />삭제 후 복구할 수 없습니다.</p>
            <div className="confirm-actions">
              <button type="button" className="secondary" disabled={deleting} onClick={() => setPendingDelete(null)}>취소</button>
              <button type="button" className="danger" disabled={deleting} onClick={confirmDeleteReport}>{deleting ? "삭제 중..." : "삭제"}</button>
            </div>
          </div>
        </div>
      )}
    </div>;
  }

  return <div className="content">
    <SectionTitle title="내 Schedule 이력" action={onCreate ? <button type="button" className="primary report-create-desktop" onClick={onCreate}>+ 새 Schedule 작성</button> : undefined} />
    <div className="filters">
      <div className="search"><span>⌕</span><input placeholder="작성자, 부서, 주차 검색" value={query} onChange={(e) => updateQuery(e.target.value)} /></div>
      <span className="result-count">{filtered.length}건</span>
    </div>
    <section className="panel">
      <ReportTable reports={paged} onSelect={setSelected} empty="조건에 맞는 Schedule이 없습니다." />
      {onCreate && <button type="button" className="mobile-report-create" onClick={onCreate} aria-label="새 Schedule 작성"><span>+</span><b>새 Schedule 작성</b></button>}
      <div className="pagination">
        <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>←</button>
        <span>{currentPage} / {totalPages}</span>
        <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>→</button>
      </div>
    </section>
    {selected && <ReportViewer report={selected} onClose={() => setSelected(null)} />}
  </div>;
}

function formatDayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function DayTravelViewer({ date, items, onClose }: { date: string; items: DayTravelItem[]; onClose: () => void }) {
  const trips = items.filter((t) => !t.type.includes("휴가"));
  const leaves = items.filter((t) => t.type.includes("휴가"));
  const rows = items.map((t) => {
    const isLeave = t.type.includes("휴가");
    const period = t.end && t.end !== t.start ? `${t.start} ~ ${t.end}` : t.start;
    return [isLeave ? "휴가" : "출장", t.department, t.name, period, isLeave ? "-" : (t.destination || "-"), isLeave ? "-" : (t.purpose || "-")];
  });
  return <div className="report-view-backdrop" onMouseDown={onClose}>
    <article className="report-view-modal day-travel-modal" role="dialog" aria-modal="true" aria-label="출장·휴가 목록" onMouseDown={(e) => e.stopPropagation()}>
      <button className="drawer-close" onClick={onClose}>×</button>
      <div className="paper-head">
        <p>출장 · 휴가</p>
        <div>
          <span><b>날짜</b> {formatDayLabel(date)}</span>
          <span><b>전체</b> {items.length}건</span>
          <span><b>출장</b> {trips.length}건</span>
          <span><b>휴가</b> {leaves.length}건</span>
        </div>
      </div>
      <PaperSection no="01" title="해당일 출장·휴가 목록">
        <MiniTable heads={["구분", "부서", "이름", "기간", "목적지", "목적"]} rows={rows} />
      </PaperSection>
    </article>
  </div>;
}

function ReportViewer({report,onClose}:{report:Report;onClose:()=>void}) {
  const travelRows=(report.travel||[]).map((t)=>{
    const isLeave=t.type.includes("휴가");
    const period=t.end&&t.end!==t.start?`${t.start} ~ ${t.end}`:t.start;
    return [t.type,t.name||report.authorName,period,isLeave?"-":(t.destination||"-"),isLeave?"-":(t.purpose||"-")];
  });
  return <div className="report-view-backdrop" onMouseDown={onClose}><article className="report-view-modal" role="dialog" aria-modal="true" aria-label="Schedule 상세" onMouseDown={e=>e.stopPropagation()}><button className="drawer-close" onClick={onClose}>×</button><div className="paper-head"><p>Weekly Leadership Update</p><div><span><b>부서</b> {report.department}</span><span><b>작성자</b> {report.authorName}</span><span><b>주차</b> {report.weekLabel}</span></div></div><PaperSection no="01" title="출장 및 휴가" en="Travel & Time Off"><MiniTable heads={["TYPE","NAME","PERIOD","DESTINATION","PURPOSE"]} rows={travelRows}/></PaperSection><PaperSection no="02" title="부서의 주요 일정" en="Key Dates & Events"><MiniTable heads={["DATE","TYPE","DESCRIPTION","LOCATION"]} rows={(report.events||[]).map(t=>[t.date,t.type,t.description,t.location])}/></PaperSection><PaperSection no="03" title="부서의 핵심 이슈 · CEO 보고사항" en="Key Issues & Asks"><MiniTable heads={["CATEGORY","DETAILS","DEADLINE"]} rows={(report.issues||[]).map(t=>[t.category,t.details,t.deadline])}/></PaperSection><PaperSection no="04" title="CEO 요청사항"><p className="paper-text">{report.ceoRequests||"해당 없음"}</p></PaperSection><PaperSection no="05" title="Key Question"><p className="paper-text">{report.keyQuestion||"해당 없음"}</p></PaperSection></article></div>;
}
function PaperSection({no,title,en,children}:{no:string;title:string;en?:string;children:React.ReactNode}){return <section className="paper-section"><h3><span>{no}</span>{title}{en&&<em>· {en}</em>}</h3>{children}</section>}
function MiniTable({heads,rows}:{heads:string[];rows:string[][]}){return <div className="mini-table"><div className="mini-row head" style={{gridTemplateColumns:`repeat(${heads.length}, minmax(80px,1fr))`}}>{heads.map(h=><span key={h}>{h}</span>)}</div>{rows.length?rows.map((row,i)=><div className="mini-row" key={i} style={{gridTemplateColumns:`repeat(${heads.length}, minmax(80px,1fr))`}}>{row.map((c,j)=><span key={j}>{c||"-"}</span>)}</div>):<p className="paper-empty">해당 없음</p>}</div>}

export function LegacyReportWriter({session,profile,onSaved}:{session:Session;profile:Profile;onSaved:(r:Report)=>void}) {
  const [draft,setDraft]=useState(emptyDraft); const [step,setStep]=useState(1); const [saving,setSaving]=useState(false); const [message,setMessage]=useState("");
  const update=(key:string,value:unknown)=>setDraft(d=>({...d,[key]:value}));
  const addTravel=()=>update("travel",[...draft.travel,{type:"출장",name:profile.name,start:today,end:today,destination:"",notes:""}]);
  const addEvent=()=>update("events",[...draft.events,{date:today,type:"회의",description:"",location:"",notes:""}]);
  const addIssue=()=>update("issues",[...draft.issues,{category:"핵심이슈",details:"",deadline:""}]);
  function rowUpdate<T extends Record<string,string>>(key:"travel"|"events"|"issues",index:number,field:keyof T,value:string){const rows=[...(draft[key] as unknown as T[])];rows[index]={...rows[index],[field]:value};update(key,rows)}
  async function submit(){setSaving(true);setMessage("");try{const report={...draft,id:crypto.randomUUID(),department:profile.department,authorId:profile.uid,authorName:profile.name,employeeNumber:profile.employeeNumber,createdAt:new Date().toISOString(),submittedAt:new Date().toISOString()};await createDocument("reports",report.id,report,session.idToken);onSaved(report);setDraft(emptyDraft());setStep(1);setMessage("Schedule이 성공적으로 제출되었습니다.");}catch(err){setMessage(err instanceof Error?err.message:"제출하지 못했습니다.");}finally{setSaving(false)}}
  const titles=[["01","출장 및 휴가","Travel & Time Off"],["02","부서의 주요 일정","Key Dates & Events"],["03","부서의 핵심 이슈","Key Issues & Asks"],["04","CEO 요청사항","결정·협조 요청"],["05","Key Question","핵심 질문"]];
  return <div className="content writer"><SectionTitle eyebrow="NEW WEEKLY UPDATE" title="주간 리더십 Schedule 작성" description="필요한 항목만 작성하세요. 해당 없는 섹션은 비워두어도 됩니다." action={<label className="week-select">보고 주차<input value={draft.weekLabel} onChange={e=>update("weekLabel",e.target.value)}/></label>}/><div className="stepper">{titles.map((t,i)=><button className={step===i+1?"active":step>i+1?"done":""} onClick={()=>setStep(i+1)} key={t[0]}><span>{step>i+1?"✓":t[0]}</span><div><b>{t[1]}</b><small>{t[2]}</small></div></button>)}</div><section className="form-card"><div className="form-head"><span>{titles[step-1][0]}</span><div><h2>{titles[step-1][1]}</h2><p>{titles[step-1][2]}</p></div></div>{step===1&&<><p className="form-guide">출장, 외부 일정, 휴가 계획을 추가해 주세요.</p>{draft.travel.map((r,i)=><div className="entry-grid six" key={i}><label>구분<select value={r.type} onChange={e=>rowUpdate<Travel>("travel",i,"type",e.target.value)}><option>출장</option><option>휴가(연차)</option><option>외부일정</option></select></label><label>이름<input value={r.name} onChange={e=>rowUpdate<Travel>("travel",i,"name",e.target.value)}/></label><label>시작<input type="date" value={r.start} onChange={e=>rowUpdate<Travel>("travel",i,"start",e.target.value)}/></label><label>종료<input type="date" value={r.end} onChange={e=>rowUpdate<Travel>("travel",i,"end",e.target.value)}/></label><label>목적지<input value={r.destination} onChange={e=>rowUpdate<Travel>("travel",i,"destination",e.target.value)} placeholder="도시/장소"/></label><label>메모<input value={r.notes} onChange={e=>rowUpdate<Travel>("travel",i,"notes",e.target.value)} placeholder="인수인계 등"/></label><button className="remove" onClick={()=>update("travel",draft.travel.filter((_,x)=>x!==i))}>×</button></div>)}<button className="add-row" onClick={addTravel}>+ 출장·휴가 일정 추가</button></>}{step===2&&<><p className="form-guide">회의·워크샵·행사·Store Open·촬영·계약·제품 출시·외부방문·언론대응 등 주요 일정을 적어 주세요.</p>{draft.events.map((r,i)=><div className="entry-grid five" key={i}><label>날짜<input type="date" value={r.date} onChange={e=>rowUpdate<EventItem>("events",i,"date",e.target.value)}/></label><label>유형<input value={r.type} onChange={e=>rowUpdate<EventItem>("events",i,"type",e.target.value)}/></label><label>일정 설명<input value={r.description} onChange={e=>rowUpdate<EventItem>("events",i,"description",e.target.value)} placeholder="핵심 일정"/></label><label>장소<input value={r.location} onChange={e=>rowUpdate<EventItem>("events",i,"location",e.target.value)}/></label><label>메모<input value={r.notes} onChange={e=>rowUpdate<EventItem>("events",i,"notes",e.target.value)}/></label><button className="remove" onClick={()=>update("events",draft.events.filter((_,x)=>x!==i))}>×</button></div>)}<button className="add-row" onClick={addEvent}>+ 주요 일정 추가</button></>}{step===3&&<><p className="form-guide">대표님이 알아야 할 핵심 이슈, 과제, 판단이 필요한 사항을 작성해 주세요.</p>{draft.issues.map((r,i)=><div className="entry-grid three" key={i}><label>카테고리<select value={r.category} onChange={e=>rowUpdate<Issue>("issues",i,"category",e.target.value)}><option>핵심이슈</option><option>과제</option><option>의사결정</option><option>리스크</option></select></label><label>상세 내용<input value={r.details} onChange={e=>rowUpdate<Issue>("issues",i,"details",e.target.value)} placeholder="배경과 필요한 액션을 명확히 작성"/></label><label>일정·마감<input value={r.deadline} onChange={e=>rowUpdate<Issue>("issues",i,"deadline",e.target.value)} placeholder="예: 8월 말"/></label><button className="remove" onClick={()=>update("issues",draft.issues.filter((_,x)=>x!==i))}>×</button></div>)}<button className="add-row" onClick={addIssue}>+ 핵심 이슈 추가</button></>}{step===4&&<div className="large-field"><label>CEO 요청사항<textarea value={draft.ceoRequests} onChange={e=>update("ceoRequests",e.target.value)} placeholder="대표님의 확인, 결정, 지원이 필요한 사항을 작성해 주세요."/></label></div>}{step===5&&<div className="large-field"><label>Key Question<textarea value={draft.keyQuestion} onChange={e=>update("keyQuestion",e.target.value)} placeholder="부서장이 하고있는 가장 중요한 질문 (한 주에만 해당되는 것은 아님)"/></label></div>}<div className="form-actions"><button className="secondary" onClick={()=>setStep(Math.max(1,step-1))} disabled={step===1}>← 이전</button>{step<5?<button className="primary" onClick={()=>setStep(step+1)}>다음 항목 →</button>:<button className="primary" onClick={submit} disabled={saving}>{saving?"제출 중...":"Schedule 제출"}</button>}</div>{message&&<div className={message.includes("성공")?"success-box":"error-box"}>{message}</div>}</section></div>;
}

function weekLabelSortKey(label: string) {
  const match = label.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})주차/);
  if (!match) return label;
  return `${match[1].padStart(4, "0")}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

/** Week columns for submission matrix: most recent N week labels only. */
function recentWeekLabels(limit = 8) {
  const labels: string[] = [];
  const seen = new Set<string>();
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  // Walk back day-by-day until we collect enough distinct week labels.
  for (let i = 0; i < 400 && labels.length < limit; i += 1) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const label = weekLabelFromReportDate(iso);
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return labels.sort((a, b) => weekLabelSortKey(b).localeCompare(weekLabelSortKey(a)));
}

function Users({ session, profile, reports }: { session: Session; profile: Profile; reports: Report[] }) {
  const [tab, setTab] = useState<"submissions" | "accounts">("submissions");
  const [users, setUsers] = useState<Profile[]>([]);
  const [form, setForm] = useState({ department: "", name: "", employeeNumber: "", password: "", role: "leader" });
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [listMessage, setListMessage] = useState("");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [weekFilter, setWeekFilter] = useState("전체");
  const [query, setQuery] = useState("");

  useEffect(() => {
    listDocuments<Profile>("users", session.idToken).then(setUsers).catch(() => setUsers([]));
  }, [session]);

  const weekLabels = recentWeekLabels(8);
  const recentWeekSet = new Set(weekLabels);
  const visibleWeeks = weekFilter === "전체" ? weekLabels : weekLabels.filter((week) => week === weekFilter);

  const leaders = users
    .filter((user) => user.role === "leader")
    .filter((user) => `${user.name} ${user.department} ${user.employeeNumber}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name));

  const reportByUserWeek = new Map<string, Report>();
  for (const report of reports) {
    if (!recentWeekSet.has(report.weekLabel)) continue;
    const key = `${report.authorId}::${report.weekLabel}`;
    const prev = reportByUserWeek.get(key);
    if (!prev || String(report.submittedAt) > String(prev.submittedAt)) reportByUserWeek.set(key, report);
  }

  async function create(e: FormEvent) {
    e.preventDefault(); setMessage("");
    try {
      const result = await callFunction<{ user: Profile }>("createUserAccount", form, session.idToken);
      setUsers((v) => [result.user, ...v]);
      setOpen(false);
      setForm({ department: "", name: "", employeeNumber: "", password: "", role: "leader" });
    } catch (err) { setMessage(err instanceof Error ? err.message : "계정을 만들지 못했습니다."); }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true); setListMessage("");
    try {
      const result = await deleteUserAccount(pendingDelete.uid, session.idToken);
      setUsers((current) => current.filter((user) => user.uid !== pendingDelete.uid));
      setListMessage(result.message);
      setPendingDelete(null);
    } catch (err) { setListMessage(err instanceof Error ? err.message : "사용자를 삭제하지 못했습니다."); }
    finally { setDeleting(false); }
  }

  const submittedCount = leaders.reduce((count, user) => (
    count + visibleWeeks.filter((week) => reportByUserWeek.has(`${user.uid}::${week}`)).length
  ), 0);
  const totalCells = leaders.length * visibleWeeks.length;

  return <div className="content">
    <SectionTitle
      title="사용자 관리"
      action={tab === "accounts" ? <button className="primary" onClick={() => setOpen(true)}>+ 새 계정 만들기</button> : undefined}
    />
    <div className="subtabs" role="tablist" aria-label="사용자 관리 세부 탭">
      <button type="button" role="tab" aria-selected={tab === "submissions"} className={tab === "submissions" ? "active" : ""} onClick={() => setTab("submissions")}>제출내역</button>
      <button type="button" role="tab" aria-selected={tab === "accounts"} className={tab === "accounts" ? "active" : ""} onClick={() => setTab("accounts")}>계정 관리</button>
    </div>

    {tab === "submissions" && (
      <>
        <div className="filters compact submission-filters">
          <div className="search"><span>⌕</span><input placeholder="이름, 부서, 사번 검색" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <select value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)}>
            <option value="전체">최근 8주</option>
            {weekLabels.map((week) => <option key={week} value={week}>{week}</option>)}
          </select>
          <span className="result-count">제출 {submittedCount}/{totalCells || 0}</span>
        </div>
        <section className="panel">
          <div className="table-wrap submission-matrix-wrap">
            <table className="submission-matrix">
              <thead>
                <tr>
                  <th className="sticky-col">이름</th>
                  <th className="sticky-col dept">부서</th>
                  {visibleWeeks.map((week) => <th key={week}>{week}</th>)}
                </tr>
              </thead>
              <tbody>
                {leaders.map((user) => (
                  <tr key={user.uid}>
                    <td className="sticky-col"><b>{user.name}</b></td>
                    <td className="sticky-col dept"><span className="dept-tag">{user.department || "-"}</span></td>
                    {visibleWeeks.map((week) => {
                      const report = reportByUserWeek.get(`${user.uid}::${week}`);
                      return <td key={week} className={report ? "submitted" : "missing"}>
                        {report ? (
                          <button type="button" className="submit-chip ok" onClick={() => setSelectedReport(report)} title={`${fmtDate(report.submittedAt)} 제출`}>제출</button>
                        ) : (
                          <span className="submit-chip no">미제출</span>
                        )}
                      </td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!leaders.length && <div className="empty"><span>◎</span><p>표시할 사용자가 없습니다.</p></div>}
          {!visibleWeeks.length && leaders.length > 0 && <div className="empty"><span>▤</span><p>표시할 주차가 없습니다.</p></div>}
        </section>
        <div className="legend submission-legend">
          <span><i className="dot submit-ok"></i>제출</span>
          <span><i className="dot submit-no"></i>미제출</span>
        </div>
      </>
    )}

    {tab === "accounts" && (
      <>
        {listMessage && <div className={/삭제했습니다/.test(listMessage) ? "success-box" : "error-box"} style={{ marginBottom: 14 }}>{listMessage}</div>}
        <section className="panel">
          <div className="table-wrap">
            <table>
              <thead><tr><th>이름</th><th>부서</th><th>사번</th><th>권한</th><th>보안 상태</th><th>계정</th><th></th></tr></thead>
              <tbody>{users.map((u) => <tr key={u.uid}>
                <td><b>{u.name}</b></td>
                <td>{u.department}</td>
                <td>{u.employeeNumber}</td>
                <td><span className="dept-tag">{u.role === "admin" ? "관리자" : "리더"}</span></td>
                <td>{u.mustChangePassword ? <span className="status-warn">첫 로그인 대기</span> : <span className="status-ok">변경 완료</span>}</td>
                <td>{u.active ? "활성" : "중지"}</td>
                <td>{u.uid !== profile.uid && u.uid !== process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_UID && <button type="button" className="danger-text" onClick={() => { setListMessage(""); setPendingDelete(u); }}>삭제</button>}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {!users.length && <div className="empty"><span>◎</span><p>생성된 사용자가 없습니다.</p></div>}
        </section>
      </>
    )}

    {open && <div className="modal-backdrop"><form className="modal" onSubmit={create}><button type="button" className="drawer-close" onClick={() => setOpen(false)}>×</button><h2>새 계정 만들기</h2><div className="modal-grid"><label>부서<input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="예: 기획팀" required /></label><label>이름<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="홍길동" required /></label><label>사번<input value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} placeholder="예: LF24001" required /></label><label>최초 비밀번호<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} placeholder="8자 이상" required /></label><label>권한<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="leader">리더</option><option value="admin">관리자</option></select></label></div>{message && <div className="error-box">{message}</div>}<button className="primary wide">계정 발급하기</button></form></div>}
    {pendingDelete && <div className="modal-backdrop" onMouseDown={() => !deleting && setPendingDelete(null)}><div className="modal confirm-modal" onMouseDown={(e) => e.stopPropagation()}><h2>사용자 삭제</h2><p className="muted"><b>{pendingDelete.name}</b>({pendingDelete.employeeNumber}) 계정을 삭제할까요?<br />삭제 후 해당 계정으로 로그인할 수 없습니다.</p><div className="confirm-actions"><button type="button" className="secondary" disabled={deleting} onClick={() => setPendingDelete(null)}>취소</button><button type="button" className="danger" disabled={deleting} onClick={confirmDelete}>{deleting ? "삭제 중..." : "삭제"}</button></div></div></div>}
    {selectedReport && <ReportViewer report={selectedReport} onClose={() => setSelectedReport(null)} />}
  </div>;
}

function escapePrintText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printSummaryHtml(title: string, html: string) {
  if (!html?.trim() || typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "print-frame");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><title>${escapePrintText(title || "요약")}</title>
<style>
  @page{margin:18mm}
  html,body{margin:0;padding:0;background:#fff}
  body{padding:28px;color:#111f39;font:14px/1.65 "Noto Sans KR",Manrope,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ceo-brief header{margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #1f5eff}
  .ceo-brief .eyebrow{margin:0 0 8px;color:#1f5eff;font:500 12px "DM Mono",monospace;letter-spacing:.12em}
  .ceo-brief h1{margin:0 0 8px;font-size:28px;letter-spacing:-.03em}
  .ceo-brief .period{margin:0;color:#6d7788;font:500 12px "DM Mono",monospace}
  .ceo-brief section{margin:22px 0;break-inside:avoid}
  .ceo-brief h2{margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #dfe5ef;font-size:16px}
  .ceo-brief p,.ceo-brief li{font-size:13px;color:#24324a}
  .ceo-brief ul{margin:0;padding-left:18px}
  .ceo-brief li{margin:6px 0}
</style></head><body>${html}</body></html>`);
  doc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    win.removeEventListener("afterprint", cleanup);
    iframe.remove();
  };

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
      return;
    }
    window.setTimeout(cleanup, 60_000);
  };

  win.addEventListener("afterprint", cleanup);
  if (doc.readyState === "complete") window.setTimeout(triggerPrint, 50);
  else iframe.onload = () => window.setTimeout(triggerPrint, 50);
}

function fmtDateTime(value: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function AIWorkspace({ session }: { session: Session }) {
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [extraFocus, setExtraFocus] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [saved, setSaved] = useState<SavedSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SavedSummary | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshSaved() {
    try {
      setSaved(await listSavedSummaries<SavedSummary>(session.idToken));
    } catch {
      setSaved([]);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshSaved(); }, 0);
    return () => window.clearTimeout(timer);
  }, [session.idToken]);

  function openPrompt() {
    setError("");
    setNotice("");
    setPromptOpen(true);
  }

  async function summarize(e: FormEvent) {
    e.preventDefault();
    setPromptOpen(false);
    setLoading(true);
    setError("");
    setNotice("");
    setSelectedId(null);
    try {
      const result = await callFunction<PeriodSummary>("generatePeriodSummary", {
        from,
        to,
        extraFocus: extraFocus.trim(),
      }, session.idToken);
      setSummary(result);
      setPreviewOpen(true);
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "요약을 생성하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSummary() {
    if (!summary?.html) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await callFunction<{ item: SavedSummary }>("savePeriodSummary", {
        title: summary.title,
        from: summary.from,
        to: summary.to,
        html: summary.html,
      }, session.idToken);
      setSaved((current) => [result.item, ...current.filter((item) => item.id !== result.item.id)]);
      setSelectedId(result.item.id);
      setNotice("요약을 저장했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "요약을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function openSaved(item: SavedSummary) {
    setSelectedId(item.id);
    setSummary({ title: item.title, from: item.from, to: item.to, html: item.html });
    setNotice("");
    setError("");
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
  }

  async function confirmDeleteSummary() {
    if (!pendingDelete) return;
    setDeleting(true); setError(""); setNotice("");
    try {
      const result = await deleteSavedSummary(pendingDelete.id, session.idToken);
      setSaved((current) => current.filter((item) => item.id !== pendingDelete.id));
      if (selectedId === pendingDelete.id) {
        setSelectedId(null);
        setPreviewOpen(false);
        setSummary(null);
      }
      setNotice(result.message);
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요약을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  const canSave = Boolean(summary?.html) && !summary?.empty;

  return <div className="content ai-page">
    <SectionTitle
      title="Leader Schedule AI"
      action={
        <div className="ai-toolbar date-range">
          <label>시작일<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <span>—</span>
          <label>종료일<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="primary" onClick={openPrompt} disabled={loading}>{loading ? "취합 중..." : "AI 요약 생성"}</button>
        </div>
      }
    />
    {error && <div className="error-box" style={{ marginBottom: 14 }}>{error}</div>}
    {notice && <div className="success-box" style={{ marginBottom: 14 }}>{notice}</div>}
    <section className="panel saved-summaries">
      <div className="panel-head"><div><h3>저장된 요약</h3></div><span className="result-count">{saved.length}건</span></div>
      <div className="saved-summary-list">
        {!saved.length && <div className="empty compact"><p>저장된 요약이 없습니다.</p></div>}
        {saved.map((item) => (
          <div key={item.id} className={`saved-summary-item${selectedId === item.id ? " active" : ""}`}>
            <button type="button" className="saved-summary-open" onClick={() => openSaved(item)}>
              <b>{item.title}</b>
              <span>{item.from} — {item.to}</span>
              <small>{fmtDateTime(item.createdAt)}</small>
            </button>
            <button
              type="button"
              className="danger-text saved-summary-delete"
              onClick={() => { setError(""); setNotice(""); setPendingDelete(item); }}
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    </section>

    {pendingDelete && (
      <div className="modal-backdrop" onMouseDown={() => !deleting && setPendingDelete(null)}>
        <div className="modal confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
          <h2>요약 삭제</h2>
          <p className="muted"><b>{pendingDelete.title}</b> 요약을 삭제할까요?<br/>삭제 후 복구할 수 없습니다.</p>
          <div className="confirm-actions">
            <button type="button" className="secondary" disabled={deleting} onClick={() => setPendingDelete(null)}>취소</button>
            <button type="button" className="danger" disabled={deleting} onClick={confirmDeleteSummary}>{deleting ? "삭제 중..." : "삭제"}</button>
          </div>
        </div>
      </div>
    )}

    {promptOpen && (
      <div className="modal-backdrop" onMouseDown={() => !loading && setPromptOpen(false)}>
        <form className="modal summary-prompt-modal" onSubmit={summarize} onMouseDown={(e) => e.stopPropagation()}>
          <button type="button" className="drawer-close" onClick={() => setPromptOpen(false)}>×</button>
          <h2>추가 요약 요청</h2>
          <p className="muted">기간 {from} — {to} Schedule에서 특히 요약하고 싶은 내용을 적어 주세요. 입력한 내용은 HTML 마지막 &lsquo;추가 요청사항&rsquo; 섹션에 반영됩니다.</p>
          <label>요약하고 싶은 내용
            <textarea
              value={extraFocus}
              onChange={(e) => setExtraFocus(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="예: 해외 출장 일정과 CEO 의사결정이 필요한 이슈만 자세히 정리해 주세요."
            />
          </label>
          <div className="confirm-actions">
            <button type="button" className="secondary" onClick={() => setPromptOpen(false)}>취소</button>
            <button type="submit" className="primary" disabled={loading}>{loading ? "취합 중..." : "요약 생성"}</button>
          </div>
        </form>
      </div>
    )}

    {previewOpen && summary && (
      <div className="report-view-backdrop" onMouseDown={closePreview}>
        <article className="report-view-modal summary-preview-modal" role="dialog" aria-modal="true" aria-label="요약 미리보기" onMouseDown={(e) => e.stopPropagation()}>
          <button type="button" className="drawer-close" onClick={closePreview}>×</button>
          <div className="summary-html-toolbar modal-toolbar">
            <div>
              <b>{summary.title}</b>
              <span>{summary.from} — {summary.to}</span>
            </div>
            <div className="summary-html-actions">
              <button type="button" className="secondary" onClick={() => printSummaryHtml(summary.title, summary.html)}>인쇄</button>
              <button type="button" className="primary" onClick={saveSummary} disabled={saving || !canSave}>{saving ? "저장 중..." : "저장"}</button>
            </div>
          </div>
          {notice && <div className="success-box" style={{ margin: "0 0 14px" }}>{notice}</div>}
          {error && <div className="error-box" style={{ margin: "0 0 14px" }}>{error}</div>}
          <div className="summary-html-view modal-view" dangerouslySetInnerHTML={{ __html: summary.html }} />
        </article>
      </div>
    )}
  </div>;
}

function AskChatbot({session}:{session:Session}){
  const [open,setOpen]=useState(false);
  const [question,setQuestion]=useState("");
  const [messages,setMessages]=useState<{role:string;text:string}[]>([]);
  const [asking,setAsking]=useState(false);
  const bodyRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const el=bodyRef.current;
    if(el)el.scrollTop=el.scrollHeight;
  },[messages,open]);
  useEffect(()=>{
    if(!open)return;
    const timer=window.setTimeout(()=>inputRef.current?.focus(),0);
    return()=>window.clearTimeout(timer);
  },[open,asking]);
  async function ask(e:FormEvent){
    e.preventDefault();
    if(!question.trim()||asking)return;
    const q=question.trim();
    setQuestion("");
    setMessages(m=>[...m,{role:"user",text:q}]);
    setAsking(true);
    requestAnimationFrame(()=>inputRef.current?.focus());
    try{
      const result=await callFunction<{answer:string}>("askLeadFlow",{question:q,history:messages.slice(-6)},session.idToken);
      setMessages(m=>[...m,{role:"ai",text:result.answer}]);
    }catch(err){
      setMessages(m=>[...m,{role:"ai",text:err instanceof Error?err.message:"답변을 생성하지 못했습니다."}]);
    }finally{
      setAsking(false);
      requestAnimationFrame(()=>inputRef.current?.focus());
    }
  }
  return <div className={`ask-fab${open?" open":""}`}>
    {open&&<div className="ask-fab-panel" role="dialog" aria-label="Leader Schedule 질문">
      <div className="ask-fab-head">
        <div><b>Leader Schedule AI</b><span>Schedule에 대해 질문하세요</span></div>
        <button type="button" className="ask-fab-close" onClick={()=>setOpen(false)} aria-label="닫기">×</button>
      </div>
      <div className="ask-fab-body" ref={bodyRef}>
        {!messages.length&&<div className="chat-welcome"><p>Schedule에 대해 질문하세요.</p></div>}
        {messages.map((m,i)=><div className={`bubble ${m.role}`} key={i}>{m.text}</div>)}
        {asking&&<div className="bubble ai asking">답변 작성 중…</div>}
      </div>
      <form className="chat-input ask-fab-input" onSubmit={ask}>
        <input ref={inputRef} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="질문 입력" autoFocus/>
        <button type="submit" disabled={asking||!question.trim()} aria-label="전송">↑</button>
      </form>
    </div>}
    <button type="button" className="ask-fab-btn" onClick={()=>setOpen(v=>!v)} aria-label={open?"질문 창 닫기":"질문하기"} aria-expanded={open}>
      <span>{open?"×":"✦"}</span>
    </button>
  </div>;
}

export function LeadFlowApp(){
  const pathname = usePathname();
  const router = useRouter();
  const page = pageFromPath(pathname);
  const [session,setSession]=useState<Session|null>(null);const [profile,setProfile]=useState<Profile|null>(null);const [reports,setReports]=useState<Report[]>([]);const [loading,setLoading]=useState(true);
  useEffect(()=>{void (async()=>{
    try{
      const saved=await restoreSession();
      if(!saved)return;
      const p=await getOrBootstrapProfile(saved);
      if(p?.active){setSession(saved);setProfile(p)}
      else clearSession();
    }catch{clearSession()}
    finally{setLoading(false)}
  })()},[]);
  useEffect(()=>{
    if(!session||!profile||profile.mustChangePassword)return;
    const load=profile.role==="admin"
      ? listDocuments<Report>("reports",session.idToken)
      : queryDocumentsByField<Report>("reports","authorId",profile.uid,session.idToken);
    load
      .then((all)=>setReports(all.sort((a,b)=>String(b.submittedAt||"").localeCompare(String(a.submittedAt||"")))))
      .catch(()=>setReports([]));
  },[session,profile]);
  useEffect(()=>{
    if(!profile)return;
    if(profile.role!=="admin"&&(page==="users"||page==="ai"))router.replace("/reports");
    if(profile.role==="admin"&&page==="write")router.replace("/reports");
  },[profile,page,router]);
  if(loading)return <div className="loading-screen"><span className="brand-mark">L</span><p>Leader Schedule을 열고 있습니다</p></div>;
  if(!session||!profile)return <Login onLogin={(s,p)=>{setSession(s);setProfile(p);if(pathname==="/")router.replace("/reports")}}/>;
  if(profile.mustChangePassword)return <PasswordGate session={session} profile={profile} onDone={s=>{setSession(s);setProfile({...profile,mustChangePassword:false})}}/>;
  const setPage=(next:string)=>{const target=next==="calendar"?"reports":next;router.push(PAGE_PATHS[target]||"/reports")};
  const logout=()=>{clearSession();setSession(null);setProfile(null);router.replace("/reports")};
  const openReportWriter=()=>router.push("/reports/write");
  const closeReportWriter=()=>router.push("/reports");
  const body=page==="write"?<div className="content writer-page"><ReportWriter session={session} profile={profile} onClose={closeReportWriter} onSaved={report=>{setReports(current=>[report,...current]);router.push("/reports")}}/></div>:page==="reports"?<Reports reports={reports} profile={profile} session={session} onCreate={profile.role!=="admin"?openReportWriter:undefined} onDeleted={(id)=>setReports((current)=>current.filter((report)=>report.id!==id))}/>:page==="users"?<Users session={session} profile={profile} reports={reports}/>:page==="ai"?<AIWorkspace session={session}/>:null;
  return <div className="app-shell">
    <Sidebar profile={profile} page={page==="write"?"reports":page} setPage={setPage}/>
    <div className="main"><Header profile={profile} onLogout={logout}/>{body}</div>
    {profile.role==="admin"&&<AskChatbot session={session}/>}
  </div>;
}
