"use client";

import { FormEvent, useState } from "react";
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
const DIRECT_EVENT_TYPE = "__direct__:";

/** 보고 기준일 선택 → 선택한 날 +1주를 `YYYY년 M월 N주차`로 기록 */
function weekLabelFromDate(value: string) {
  const reportDate = new Date(`${value}T12:00:00`);
  const target = new Date(reportDate);
  target.setDate(reportDate.getDate() + 7);
  return `${target.getFullYear()}년 ${target.getMonth() + 1}월 ${Math.ceil(target.getDate() / 7)}주차`;
}

function createDraft(weekDate = today) {
  return {
    weekLabel: weekLabelFromDate(weekDate),
    travel: [] as Travel[],
    events: [{ date: today, type: "", description: "", location: "", notes: "" }] as EventItem[],
    issues: [{ category: "핵심이슈", details: "", deadline: "" }] as Issue[],
    ceoRequests: "",
    keyQuestion: "",
  };
}

function SurveyHeader({ no, title, subtitle }: { no: string; title: string; subtitle: string }) {
  return <div className="survey-section-head"><span>{no}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
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

  function updateTravelType(index: number, type: string) {
    const rows = [...draft.travel];
    const isLeave = type.includes("휴가");
    rows[index] = {
      ...rows[index],
      type,
      destination: isLeave ? "" : rows[index].destination,
      purpose: isLeave ? "" : rows[index].purpose,
    };
    update("travel", rows);
  }

  function addTravel(type: "출장" | "휴가") {
    update("travel", [...draft.travel, {
      type,
      name: "",
      start: today,
      end: today,
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
        events: draft.events.map((row) => ({
          ...row,
          type: row.type.startsWith(DIRECT_EVENT_TYPE) ? row.type.slice(DIRECT_EVENT_TYPE.length).trim() : row.type,
        })),
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
      setMessage(error instanceof Error ? error.message : "Schedule을 제출하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="report-compose">
    <div className="report-compose-head">
      <div><h1>새 Schedule 작성</h1></div>
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
          return <div className={`entry-grid ${isLeave ? "three" : "five"}${index > 0 ? " entry-follow" : ""}`} key={index}>
            <label><span className="field-label">구분</span><select value={isLeave ? "휴가" : "출장"} onChange={(event) => updateTravelType(index, event.target.value)} aria-label="구분"><option value="출장">출장</option><option value="휴가">휴가</option></select></label>
            <label><span className="field-label">시작일</span><input type="date" value={row.start} onChange={(event) => rowUpdate<Travel>("travel", index, "start", event.target.value)} aria-label="시작일" /></label>
            <label><span className="field-label">종료일</span><input type="date" value={row.end} onChange={(event) => rowUpdate<Travel>("travel", index, "end", event.target.value)} aria-label="종료일" /></label>
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
          <label><span className="field-label">유형</span><select value={row.type.startsWith(DIRECT_EVENT_TYPE) ? DIRECT_EVENT_TYPE : row.type} onChange={(event) => rowUpdate<EventItem>("events", index, "type", event.target.value)} aria-label="유형"><option value="">- 선택 -</option><option value={DIRECT_EVENT_TYPE}>직접 입력</option><option value="대표님 회의">대표님 회의</option><option value="부서 회의">부서 회의</option><option value="워크샵">워크샵</option><option value="행사">행사</option><option value="Store Open">Store Open</option><option value="촬영">촬영</option><option value="계약">계약</option><option value="제품 출시">제품 출시</option><option value="공사">공사</option></select>{row.type.startsWith(DIRECT_EVENT_TYPE)&&<input value={row.type.slice(DIRECT_EVENT_TYPE.length)} onChange={(event) => rowUpdate<EventItem>("events", index, "type", `${DIRECT_EVENT_TYPE}${event.target.value}`)} placeholder="유형을 입력하세요" aria-label="일정 유형 직접 입력" autoFocus/>}</label>
          <label><span className="field-label">일정 설명</span><input value={row.description} onChange={(event) => rowUpdate<EventItem>("events", index, "description", event.target.value)} placeholder="핵심 일정" aria-label="일정 설명" /></label>
          <label><span className="field-label">장소</span><input value={row.location} onChange={(event) => rowUpdate<EventItem>("events", index, "location", event.target.value)} aria-label="장소" /></label>
          <button type="button" className="remove" aria-label="주요 일정 행 삭제" onClick={() => update("events", draft.events.filter((_, rowIndex) => rowIndex !== index))}>×</button>
        </div>)}
        <button type="button" className="add-row" onClick={() => update("events", [...draft.events, { date: today, type: "", description: "", location: "", notes: "" }])}>+ 주요 일정 추가</button>
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
            <label>Key Question<textarea value={draft.keyQuestion} onChange={(event) => update("keyQuestion", event.target.value)} placeholder="부서장이 하고있는 가장 중요한 질문 (한 주에만 해당되는 것은 아님)" /></label>
            <button type="button" className="remove-optional" onClick={() => { update("keyQuestion", ""); setShowKeyQuestion(false); }}>작성 취소</button>
          </div>
        ) : (
          <button type="button" className="add-row" onClick={() => setShowKeyQuestion(true)}>+ Key Question 작성</button>
        )}
      </section>

      <div className="survey-submit">
        <div className="survey-submit-actions"><button className="secondary" type="button" onClick={onClose}>취소</button><button className="primary" type="submit" disabled={saving}>{saving ? "제출 중..." : "Schedule 제출"}</button></div>
      </div>
      {message && <div className={message.includes("제출되었") ? "success-box" : "error-box"}>{message}</div>}
    </form>
  </div>;
}
