"use client";

import { useEffect, useState } from "react";
import { FormConfig } from "../lib/form-config";

type Travel = { type: string; start: string; end: string; destination: string; purpose: string };
type EventItem = { date: string; type: string; description: string; location: string };
type Issue = { category: string; details: string; deadline: string };

const today = new Date().toISOString().slice(0, 10);
const DIRECT_EVENT_TYPE = "__direct__:";

function weekLabelFromDate(value: string) {
  const reportDate = new Date(`${value}T12:00:00`);
  const target = new Date(reportDate);
  target.setDate(reportDate.getDate() + 7);
  return `${target.getFullYear()}년 ${target.getMonth() + 1}월 ${Math.ceil(target.getDate() / 7)}주차`;
}

function SurveyHeader({ no, title, subtitle }: { no: string; title: string; subtitle: string }) {
  return <div className="survey-section-head"><span>{no}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>;
}

/** 저장 없이 클릭·입력이 가능한 실시간 양식 미리보기 */
export function FormPreview({ config }: { config: FormConfig }) {
  const [weekDate, setWeekDate] = useState(today);
  const [weekLabel, setWeekLabel] = useState(() => weekLabelFromDate(today));
  const [travel, setTravel] = useState<Travel[]>([]);
  const [events, setEvents] = useState<EventItem[]>([{ date: today, type: "", description: "", location: "" }]);
  const [issues, setIssues] = useState<Issue[]>([{ category: config.issues.categoryOptions[0] || "", details: "", deadline: "" }]);
  const [ceoRequests, setCeoRequests] = useState("");
  const [keyQuestion, setKeyQuestion] = useState("");
  const [showCeo, setShowCeo] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [pickingTravel, setPickingTravel] = useState(false);

  // 카테고리 옵션이 바뀌면 미리보기의 선택값도 유효한 옵션으로 맞춤
  useEffect(() => {
    const first = config.issues.categoryOptions[0] || "";
    setIssues((rows) => rows.map((row) => (
      config.issues.categoryOptions.includes(row.category) ? row : { ...row, category: first }
    )));
  }, [config.issues.categoryOptions]);

  function updateTravel(index: number, field: keyof Travel, value: string) {
    setTravel((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      if (field === "type") {
        const isLeave = value.includes("휴가");
        return { ...row, type: value, destination: isLeave ? "" : row.destination, purpose: isLeave ? "" : row.purpose };
      }
      return { ...row, [field]: value };
    }));
  }

  return <div className="form-preview report-compose">
    <div className="report-compose-head form-preview-head">
      <div>
        <p className="eyebrow blue">LIVE PREVIEW</p>
        <h1>새 Schedule 작성</h1>
        <p>실제 작성 화면과 동일하게 클릭·입력해 확인할 수 있습니다. 제출되지 않습니다.</p>
      </div>
      <div className="report-week-picker">
        <label>보고 기준일<input type="date" value={weekDate} onChange={(e) => {
          setWeekDate(e.target.value);
          setWeekLabel(weekLabelFromDate(e.target.value));
        }} /></label>
        <span>{weekLabel}</span>
      </div>
    </div>

    <div className="survey-form report-compose-body">
      <section className="survey-section">
        <SurveyHeader no="01" title={config.travel.title} subtitle={config.travel.subtitle} />
        {travel.map((row, index) => {
          const isLeave = row.type.includes("휴가");
          return <div className={`entry-grid ${isLeave ? "three" : "five"}${index > 0 ? " entry-follow" : ""}`} key={index}>
            <label><span className="field-label">구분</span><select value={isLeave ? "휴가" : "출장"} onChange={(e) => updateTravel(index, "type", e.target.value)}><option value="출장">출장</option><option value="휴가">휴가</option></select></label>
            <label><span className="field-label">시작일</span><input type="date" value={row.start} onChange={(e) => updateTravel(index, "start", e.target.value)} /></label>
            <label><span className="field-label">종료일</span><input type="date" value={row.end} onChange={(e) => updateTravel(index, "end", e.target.value)} /></label>
            {!isLeave && <>
              <label><span className="field-label">목적지</span><input value={row.destination} onChange={(e) => updateTravel(index, "destination", e.target.value)} placeholder={config.travel.destinationPlaceholder} /></label>
              <label><span className="field-label">출장목적</span><input value={row.purpose} onChange={(e) => updateTravel(index, "purpose", e.target.value)} placeholder={config.travel.purposePlaceholder} /></label>
            </>}
            <button type="button" className="remove" aria-label="행 삭제" onClick={() => setTravel((rows) => rows.filter((_, i) => i !== index))}>×</button>
          </div>;
        })}
        {pickingTravel ? (
          <div className="travel-type-pick">
            <button type="button" className="travel-pick-btn trip" onClick={() => { setTravel((rows) => [...rows, { type: "출장", start: today, end: today, destination: "", purpose: "" }]); setPickingTravel(false); }}>
              <i>✈</i><span>출장 추가</span>
            </button>
            <button type="button" className="travel-pick-btn leave" onClick={() => { setTravel((rows) => [...rows, { type: "휴가", start: today, end: today, destination: "", purpose: "" }]); setPickingTravel(false); }}>
              <i>⌂</i><span>휴가 추가</span>
            </button>
            <button type="button" className="travel-pick-cancel" onClick={() => setPickingTravel(false)}>취소</button>
          </div>
        ) : (
          <button type="button" className="add-row" onClick={() => setPickingTravel(true)}>+ 출장·휴가 일정 추가</button>
        )}
      </section>

      <section className="survey-section">
        <SurveyHeader no="02" title={config.events.title} subtitle={config.events.subtitle} />
        {events.map((row, index) => <div className={`entry-grid four${index > 0 ? " entry-follow" : ""}`} key={index}>
          <label><span className="field-label">날짜</span><input type="date" value={row.date} onChange={(e) => setEvents((rows) => rows.map((item, i) => i === index ? { ...item, date: e.target.value } : item))} /></label>
          <label>
            <span className="field-label">유형</span>
            <select value={row.type.startsWith(DIRECT_EVENT_TYPE) ? DIRECT_EVENT_TYPE : row.type} onChange={(e) => setEvents((rows) => rows.map((item, i) => i === index ? { ...item, type: e.target.value } : item))}>
              <option value="">- 선택 -</option>
              <option value={DIRECT_EVENT_TYPE}>직접 입력</option>
              {config.events.typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {row.type.startsWith(DIRECT_EVENT_TYPE) && (
              <input value={row.type.slice(DIRECT_EVENT_TYPE.length)} onChange={(e) => setEvents((rows) => rows.map((item, i) => i === index ? { ...item, type: `${DIRECT_EVENT_TYPE}${e.target.value}` } : item))} placeholder={config.events.directInputPlaceholder} autoFocus />
            )}
          </label>
          <label><span className="field-label">일정 설명</span><input value={row.description} onChange={(e) => setEvents((rows) => rows.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} placeholder={config.events.descriptionPlaceholder} /></label>
          <label><span className="field-label">장소</span><input value={row.location} onChange={(e) => setEvents((rows) => rows.map((item, i) => i === index ? { ...item, location: e.target.value } : item))} /></label>
          <button type="button" className="remove" aria-label="행 삭제" onClick={() => setEvents((rows) => rows.filter((_, i) => i !== index))}>×</button>
        </div>)}
        <button type="button" className="add-row" onClick={() => setEvents((rows) => [...rows, { date: today, type: "", description: "", location: "" }])}>+ 주요 일정 추가</button>
      </section>

      <section className="survey-section">
        <SurveyHeader no="03" title={config.issues.title} subtitle={config.issues.subtitle} />
        {issues.map((row, index) => <div className={`entry-grid three${index > 0 ? " entry-follow" : ""}`} key={index}>
          <label>
            <span className="field-label">카테고리</span>
            <select value={row.category} onChange={(e) => setIssues((rows) => rows.map((item, i) => i === index ? { ...item, category: e.target.value } : item))}>
              {config.issues.categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label><span className="field-label">상세 내용</span><input value={row.details} onChange={(e) => setIssues((rows) => rows.map((item, i) => i === index ? { ...item, details: e.target.value } : item))} placeholder={config.issues.detailsPlaceholder} /></label>
          <label><span className="field-label">일정·마감</span><input value={row.deadline} onChange={(e) => setIssues((rows) => rows.map((item, i) => i === index ? { ...item, deadline: e.target.value } : item))} placeholder={config.issues.deadlinePlaceholder} /></label>
          <button type="button" className="remove" aria-label="행 삭제" onClick={() => setIssues((rows) => rows.filter((_, i) => i !== index))}>×</button>
        </div>)}
        <button type="button" className="add-row" onClick={() => setIssues((rows) => [...rows, { category: config.issues.categoryOptions[0] || "", details: "", deadline: "" }])}>+ 핵심 이슈 추가</button>
      </section>

      <section className="survey-section">
        <SurveyHeader no="04" title={config.ceo.title} subtitle={config.ceo.subtitle} />
        {showCeo ? (
          <div className="large-field optional-field">
            <label>{config.ceo.title}<textarea value={ceoRequests} onChange={(e) => setCeoRequests(e.target.value)} placeholder={config.ceo.placeholder} /></label>
            <button type="button" className="remove-optional" onClick={() => { setCeoRequests(""); setShowCeo(false); }}>작성 취소</button>
          </div>
        ) : (
          <button type="button" className="add-row" onClick={() => setShowCeo(true)}>+ {config.ceo.title} 작성</button>
        )}
      </section>

      <section className="survey-section">
        <SurveyHeader no="05" title={config.keyQuestion.title} subtitle={config.keyQuestion.subtitle} />
        {showKey ? (
          <div className="large-field optional-field">
            <label>{config.keyQuestion.title}<textarea value={keyQuestion} onChange={(e) => setKeyQuestion(e.target.value)} placeholder={config.keyQuestion.placeholder} /></label>
            <button type="button" className="remove-optional" onClick={() => { setKeyQuestion(""); setShowKey(false); }}>작성 취소</button>
          </div>
        ) : (
          <button type="button" className="add-row" onClick={() => setShowKey(true)}>+ {config.keyQuestion.title} 작성</button>
        )}
      </section>

      <div className="survey-submit form-preview-submit">
        <div className="survey-submit-actions">
          <button className="secondary" type="button" disabled>취소</button>
          <button className="primary" type="button" disabled>Schedule 제출</button>
        </div>
        <p className="form-preview-note">미리보기에서는 제출되지 않습니다.</p>
      </div>
    </div>
  </div>;
}
