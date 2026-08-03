"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createDocument, Profile, Session } from "./firebase-rest";

type Travel = { type: string; name: string; start: string; end: string; destination: string; purpose: string; notes: string };
type EventItem = { date: string; type: string; description: string; location: string; notes: string };
type Issue = { category: string; details: string; deadline: string };
type Report = {
  id: string; department: string; authorId: string; authorName: string; employeeNumber: string;
  weekLabel: string; createdAt: string; submittedAt: string; travel: Travel[]; events: EventItem[];
  issues: Issue[]; ceoRequests: string; keyQuestion: string;
};

const today = new Date().toISOString().slice(0, 10);
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 보고 기준일 선택 → 선택한 날 +1주를 `YYYY년 M월 N주차`로 기록 */
function weekLabelFromDate(value: string) {
  const reportDate = new Date(`${value}T12:00:00`);
  const target = new Date(reportDate);
  target.setDate(reportDate.getDate() + 7);
  return `${target.getFullYear()}년 ${target.getMonth() + 1}월 ${Math.ceil(target.getDate() / 7)}주차`;
}

function formatRange(start: string, end: string) {
  if (!start) return "기간 선택";
  if (!end || start === end) return start;
  return `${start} ~ ${end}`;
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function createDraft(weekDate = today) {
  return {
    weekLabel: weekLabelFromDate(weekDate),
    travel: [] as Travel[],
    events: [{ date: today, type: "회의", description: "", location: "", notes: "" }] as EventItem[],
    issues: [{ category: "핵심이슈", details: "", deadline: "" }] as Issue[],
    ceoRequests: "",
    keyQuestion: "",
  };
}

function SurveyHeader({ no, title, subtitle }: { no: string; title: string; subtitle: string }) {
  return <div className="survey-section-head"><span>{no}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}

function DateRangePicker({ start, end, onChange }: { start: string; end: string; onChange: (start: string, end: string) => void }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const base = start || today;
    return new Date(`${base}T12:00:00`);
  });
  const [picking, setPicking] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setPicking(null);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  const rangeStart = picking || start;
  const rangeEnd = picking ? "" : end;

  function inRange(value: string) {
    if (!rangeStart) return false;
    if (!rangeEnd) return value === rangeStart;
    const from = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    const to = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    return value >= from && value <= to;
  }

  function isEdge(value: string) {
    if (!rangeStart) return false;
    if (!rangeEnd) return value === rangeStart;
    const from = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    const to = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    return value === from || value === to;
  }

  function selectDay(day: number) {
    const value = toDateKey(year, month, day);
    if (!picking) {
      setPicking(value);
      return;
    }
    const nextStart = picking <= value ? picking : value;
    const nextEnd = picking <= value ? value : picking;
    onChange(nextStart, nextEnd);
    setPicking(null);
    setOpen(false);
  }

  return (
    <div className="date-range-picker" ref={rootRef}>
      <button
        type="button"
        className={`date-range-trigger ${start ? "" : "placeholder"}`}
        onClick={() => {
          setOpen((current) => !current);
          setPicking(null);
          if (start) setCursor(new Date(`${start}T12:00:00`));
        }}
      >
        <span>{formatRange(start, end)}</span>
        <i>▦</i>
      </button>
      {open && (
        <div className="date-range-popover" role="dialog" aria-label="기간 선택">
          <div className="date-range-head">
            <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="이전 달">←</button>
            <strong>{year}년 {month + 1}월</strong>
            <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="다음 달">→</button>
          </div>
          <p className="date-range-hint">{picking ? "종료일을 선택하세요" : "시작일을 선택하세요"}</p>
          <div className="date-range-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="date-range-grid">
            {cells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} className="date-range-empty" />;
              const value = toDateKey(year, month, day);
              return (
                <button
                  type="button"
                  key={value}
                  className={[
                    "date-range-day",
                    value === today ? "is-today" : "",
                    inRange(value) ? "in-range" : "",
                    isEdge(value) ? "is-edge" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => selectDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportWriter({ session, profile, onSaved, onClose }: { session: Session; profile: Profile; onSaved: (report: Report) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => createDraft());
  const [weekDate, setWeekDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showCeoRequests, setShowCeoRequests] = useState(false);
  const [showKeyQuestion, setShowKeyQuestion] = useState(false);
  const [pickingTravelType, setPickingTravelType] = useState(false);
  const update = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  function rowUpdate<T extends Record<string, string>>(key: "travel" | "events" | "issues", index: number, field: keyof T, value: string) {
    const rows = [...(draft[key] as unknown as T[])];
    rows[index] = { ...rows[index], [field]: value };
    update(key, rows);
  }

  function updateTravelRange(index: number, start: string, end: string) {
    const rows = [...draft.travel];
    rows[index] = { ...rows[index], start, end };
    update("travel", rows);
  }

  function addTravel(type: "출장" | "휴가") {
    update("travel", [...draft.travel, {
      type,
      name: "",
      start: "",
      end: "",
      destination: "",
      purpose: "",
      notes: "",
    }]);
    setPickingTravelType(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const report: Report = {
        ...draft,
        travel: draft.travel.map((row) => ({
          ...row,
          name: profile.name,
          notes: "",
          destination: row.type.includes("휴가") ? "" : row.destination,
          purpose: row.type.includes("휴가") ? "" : row.purpose,
        })),
        id: crypto.randomUUID(),
        department: profile.department,
        authorId: profile.uid,
        authorName: profile.name,
        employeeNumber: profile.employeeNumber,
        createdAt: new Date().toISOString(),
        submittedAt: new Date().toISOString(),
      };
      await createDocument("reports", report.id, report, session.idToken);
      onSaved(report);
      setDraft(createDraft());
      setShowCeoRequests(false);
      setShowKeyQuestion(false);
      setPickingTravelType(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "보고서를 제출하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="report-compose">
    <div className="report-compose-head">
      <div><h1>새 보고서 작성</h1></div>
      <div className="report-week-picker">
        <label>보고 기준일<input type="date" value={weekDate} onChange={(event) => {
          setWeekDate(event.target.value);
          update("weekLabel", weekLabelFromDate(event.target.value));
        }} /></label>
        <span>{draft.weekLabel}</span>
      </div>
      <button type="button" className="report-modal-close" onClick={onClose} aria-label="작성 창 닫기">×</button>
    </div>

    <form className="survey-form report-compose-body" onSubmit={submit}>
      <section className="survey-section">
        <SurveyHeader no="01" title="출장 및 휴가" subtitle="Travel & Time Off" />
        {draft.travel.map((row, index) => {
          const isLeave = row.type.includes("휴가");
          const prev = draft.travel[index - 1];
          const follow = Boolean(prev && prev.type.includes("휴가") === isLeave);
          return <div className={`entry-grid travel ${isLeave ? "leave" : "trip"}${follow ? " entry-follow" : ""}`} key={index}>
            <div className="travel-type-badge" aria-label="구분"><span className="field-label">구분</span><b>{row.type}</b></div>
            <label className="travel-range-field"><span className="field-label">기간</span><DateRangePicker start={row.start} end={row.end} onChange={(start, end) => updateTravelRange(index, start, end)} /></label>
            {!isLeave && <>
              <label><span className="field-label">목적지</span><input value={row.destination} onChange={(event) => rowUpdate<Travel>("travel", index, "destination", event.target.value)} placeholder="도시/장소" aria-label="목적지" /></label>
              <label><span className="field-label">출장목적</span><input value={row.purpose} onChange={(event) => rowUpdate<Travel>("travel", index, "purpose", event.target.value)} placeholder="출장 목적" aria-label="출장목적" /></label>
            </>}
            <button type="button" className="remove" aria-label="출장·휴가 행 삭제" onClick={() => update("travel", draft.travel.filter((_, rowIndex) => rowIndex !== index))}>×</button>
          </div>;
        })}
        {pickingTravelType ? (
          <div className="travel-type-pick">
            <button type="button" className="travel-pick-btn trip" onClick={() => addTravel("출장")}>
              <i>✈</i><span>출장 추가</span>
            </button>
            <button type="button" className="travel-pick-btn leave" onClick={() => addTravel("휴가")}>
              <i>⌂</i><span>휴가 추가</span>
            </button>
            <button type="button" className="travel-pick-cancel" onClick={() => setPickingTravelType(false)}>취소</button>
          </div>
        ) : (
          <button type="button" className="add-row" onClick={() => setPickingTravelType(true)}>+ 출장·휴가 일정 추가</button>
        )}
      </section>

      <section className="survey-section">
        <SurveyHeader no="02" title="부서의 주요 일정" subtitle="Key Dates & Events" />
        {draft.events.map((row, index) => <div className={`entry-grid four${index > 0 ? " entry-follow" : ""}`} key={index}>
          <label><span className="field-label">날짜</span><input type="date" value={row.date} onChange={(event) => rowUpdate<EventItem>("events", index, "date", event.target.value)} aria-label="날짜" /></label>
          <label><span className="field-label">유형</span><input value={row.type} onChange={(event) => rowUpdate<EventItem>("events", index, "type", event.target.value)} aria-label="유형" /></label>
          <label><span className="field-label">일정 설명</span><input value={row.description} onChange={(event) => rowUpdate<EventItem>("events", index, "description", event.target.value)} placeholder="핵심 일정" aria-label="일정 설명" /></label>
          <label><span className="field-label">장소</span><input value={row.location} onChange={(event) => rowUpdate<EventItem>("events", index, "location", event.target.value)} aria-label="장소" /></label>
          <button type="button" className="remove" aria-label="주요 일정 행 삭제" onClick={() => update("events", draft.events.filter((_, rowIndex) => rowIndex !== index))}>×</button>
        </div>)}
        <button type="button" className="add-row" onClick={() => update("events", [...draft.events, { date: today, type: "회의", description: "", location: "", notes: "" }])}>+ 주요 일정 추가</button>
      </section>

      <section className="survey-section">
        <SurveyHeader no="03" title="부서의 핵심 이슈" subtitle="Key Issues & Asks" />
        {draft.issues.map((row, index) => <div className={`entry-grid three${index > 0 ? " entry-follow" : ""}`} key={index}>
          <label><span className="field-label">카테고리</span><select value={row.category} onChange={(event) => rowUpdate<Issue>("issues", index, "category", event.target.value)} aria-label="카테고리"><option>핵심이슈</option><option>과제</option><option>의사결정</option><option>리스크</option></select></label>
          <label><span className="field-label">상세 내용</span><input value={row.details} onChange={(event) => rowUpdate<Issue>("issues", index, "details", event.target.value)} placeholder="배경과 필요한 액션을 명확히 작성" aria-label="상세 내용" /></label>
          <label><span className="field-label">일정·마감</span><input value={row.deadline} onChange={(event) => rowUpdate<Issue>("issues", index, "deadline", event.target.value)} placeholder="예: 8월 말" aria-label="일정·마감" /></label>
          <button type="button" className="remove" aria-label="핵심 이슈 행 삭제" onClick={() => update("issues", draft.issues.filter((_, rowIndex) => rowIndex !== index))}>×</button>
        </div>)}
        <button type="button" className="add-row" onClick={() => update("issues", [...draft.issues, { category: "핵심이슈", details: "", deadline: "" }])}>+ 핵심 이슈 추가</button>
      </section>

      <section className="survey-section">
        <SurveyHeader no="04" title="CEO 요청사항" subtitle="결정·협조 요청" />
        {showCeoRequests ? (
          <div className="large-field optional-field">
            <label>CEO 요청사항<textarea value={draft.ceoRequests} onChange={(event) => update("ceoRequests", event.target.value)} placeholder="대표님의 확인, 결정, 지원이 필요한 사항" /></label>
            <button type="button" className="remove-optional" onClick={() => { update("ceoRequests", ""); setShowCeoRequests(false); }}>작성 취소</button>
          </div>
        ) : (
          <button type="button" className="add-row" onClick={() => setShowCeoRequests(true)}>+ CEO 요청사항 작성</button>
        )}
      </section>

      <section className="survey-section">
        <SurveyHeader no="05" title="Key Question" subtitle="핵심 질문" />
        {showKeyQuestion ? (
          <div className="large-field optional-field">
            <label>Key Question<textarea value={draft.keyQuestion} onChange={(event) => update("keyQuestion", event.target.value)} placeholder="이번 주 가장 중요한 질문" /></label>
            <button type="button" className="remove-optional" onClick={() => { update("keyQuestion", ""); setShowKeyQuestion(false); }}>작성 취소</button>
          </div>
        ) : (
          <button type="button" className="add-row" onClick={() => setShowKeyQuestion(true)}>+ Key Question 작성</button>
        )}
      </section>

      <div className="survey-submit">
        <div className="survey-submit-actions"><button className="secondary" type="button" onClick={onClose}>취소</button><button className="primary" type="submit" disabled={saving}>{saving ? "제출 중..." : "보고서 제출"}</button></div>
      </div>
      {message && <div className={message.includes("제출되었") ? "success-box" : "error-box"}>{message}</div>}
    </form>
  </div>;
}
